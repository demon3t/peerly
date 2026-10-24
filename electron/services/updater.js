const { spawn } = require('child_process');
const crypto = require('crypto');
const { EventEmitter, once } = require('events');
const fs = require('fs');
const path = require('path');
const { app, net, shell } = require('electron');
const { CHANGELOG_BASE_URL, CHANNEL, RELEASES_API_URL, RELEASES_PAGE_URL } = require('../config');

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const WINDOWS_ARCH = { x64: 'x64', arm64: 'ARM64', ia32: 'x86-32bit' };
const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

/** "v0.1.0-build.3" → { core: [0, 1, 0], pre: ['build', 3] }; null when it isn't a version. */
function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(text).trim());
  if (!match) return null;
  const pre = match[4] ? match[4].split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [];
  return { core: match.slice(1, 4).map(Number), pre };
}

/** Semver order: negative when a < b, 0 when equal, positive when a > b. Unparsable versions sort lowest. */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return Boolean(left) - Boolean(right);
  for (let i = 0; i < 3; i += 1) if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  // A pre-release (1.0.0-build.3) comes before the release itself (1.0.0).
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'number' || typeof y === 'number') return typeof x === 'number' ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * The release file for this system (names come from scripts/package-all.mjs).
 * 'nsis' and 'appimage' install in place; the rest is opened for the user to install.
 */
function installerFor({ platform, arch }) {
  if (platform === 'win32' && WINDOWS_ARCH[arch]) {
    return { name: `Peerly-Windows-${WINDOWS_ARCH[arch]}-Setup.exe`, kind: 'nsis' };
  }
  if (platform === 'darwin')
    return { name: `Peerly-macOS-${arch === 'arm64' ? 'AppleSilicon' : 'Intel'}.dmg`, kind: 'open' };
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    return process.env.APPIMAGE
      ? { name: `Peerly-Linux-${arch}.AppImage`, kind: 'appimage' }
      : { name: `Peerly-Linux-${arch}.deb`, kind: 'open' };
  }
  return null;
}

/**
 * Keeps Peerly up to date from GitHub Releases. Automatic checks run only while the user
 * has allowed them (settings.checkUpdates); with settings.autoUpdate a new version is also
 * downloaded in the background and installed when Peerly exits. "Check now" and "Update"
 * are always explicit requests. Every installer is verified against the SHA-256 GitHub
 * publishes for it. Emits 'change' with the renderer's view of the state.
 */
class Updater extends EventEmitter {
  constructor({ settings, onQuit }) {
    super();
    this.settings = settings;
    this.onQuit = onQuit;
    this.timer = null;
    this.checking = null;
    this.downloading = null;
    this.abort = null;
    this.release = null; // { version, url, asset: { name, kind, url, size, sha256 } | null }
    this.file = ''; // the verified installer of this.release
    this.installOnExit = null; // { relaunch } once an installer should run after shutdown
    this.checkedAt = 0;
    this.changelog = null; // { key, promise } of the last changes() request
    this.state = { status: 'idle', current: app.getVersion(), latest: '', progress: 0 };
  }

  /** (Re)schedules automatic checks according to the setting. */
  restart() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.settings.get('checkUpdates')) return;
    const delay = this.checkedAt
      ? Math.max(CHECK_INTERVAL_MS - (Date.now() - this.checkedAt), 0)
      : FIRST_CHECK_DELAY_MS;
    this.timer = setTimeout(() => {
      this.check().finally(() => this.restart());
    }, delay);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
  }

  /** One check; concurrent calls share the same request. Skipped while an update is being fetched or installed. */
  check() {
    if (['downloading', 'ready', 'installing'].includes(this.state.status)) return Promise.resolve(this.view());
    if (!this.checking) {
      this.setState({ status: 'checking' });
      this.checking = this.fetchLatest()
        .then((release) => {
          if (release.version !== this.release?.version) {
            this.file = '';
            this.installOnExit = null;
          }
          this.release = release;
          this.setState({
            status: this.isAvailable(release.version) ? 'available' : 'current',
            latest: release.version,
          });
          this.applyAutoUpdate();
        })
        .catch((error) => {
          console.warn('Update check failed:', error.message);
          this.setState({ status: 'error' });
        })
        .finally(() => {
          this.checkedAt = Date.now();
          this.checking = null;
        })
        .then(() => this.view());
    }
    return this.checking;
  }

  /** With "update automatically" on, fetches the new version in the background to install on exit. */
  applyAutoUpdate() {
    const enabled = this.settings.get('checkUpdates') && this.settings.get('autoUpdate');
    if (!enabled) {
      if (!this.installOnExit?.relaunch) this.installOnExit = null;
      return;
    }
    if (!this.isAvailable(this.state.latest) || !this.canDownload()) return;
    this.download()
      .then(() => {
        if (this.installsInPlace() && !this.installOnExit) this.installOnExit = { relaunch: false };
      })
      .catch(() => {});
  }

  /** The "Update" button: download if needed, then install and restart, or open the installer. */
  async install() {
    if (!this.canDownload()) return this.openRelease();
    const file = await this.download();
    if (!this.installsInPlace()) {
      const error = await shell.openPath(file);
      if (error) throw new Error(error);
      return true;
    }
    this.installOnExit = { relaunch: true };
    this.setState({ status: 'installing' });
    this.onQuit();
    return true;
  }

  /**
   * What changed between the running version and the latest one: [{ version, date, changes }], newest first.
   * Read from changelog/<language>.md at the release tag, falling back to English.
   */
  changes(language) {
    const latest = this.state.latest;
    if (!this.isAvailable(latest)) return Promise.resolve([]);
    const key = `${latest}/${language}`;
    if (this.changelog?.key !== key) {
      const promise = this.fetchChanges(latest, language);
      promise.catch(() => {
        if (this.changelog?.promise === promise) this.changelog = null; // retry next time
      });
      this.changelog = { key, promise };
    }
    return this.changelog.promise;
  }

  async fetchChanges(latest, language) {
    const { parseChangelog } = await import('../../shared/changelog.mjs');
    // Sections are per package version: every build of 0.2.0 (0.2.0-build.N) ships the "0.2.0" section.
    const latestBase = latest.replace(/-build\.\d+$/, '');
    for (const code of [...new Set([language, 'en'])].filter((value) => LANGUAGE_CODE.test(value || ''))) {
      const response = await net.fetch(`${CHANGELOG_BASE_URL}/v${latest}/changelog/${code}.md`, {
        headers: { 'User-Agent': this.userAgent() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      return parseChangelog(await response.text()).filter(
        (release) => this.isAvailable(release.version) && compareVersions(release.version, latestBase) <= 0,
      );
    }
    return [];
  }

  /** Runs the pending installer; called once the torrents are saved, right before the process exits. */
  runPendingInstall() {
    if (!this.installOnExit || !this.file) return;
    const { relaunch } = this.installOnExit;
    try {
      if (this.release.asset.kind === 'nsis') {
        // The switches electron-updater uses: silent upgrade into the existing install folder.
        const args = ['--updated', '/S', ...(relaunch ? ['--force-run'] : [])];
        spawn(this.file, args, { detached: true, stdio: 'ignore' }).unref();
      } else {
        // A running AppImage can be swapped: rename keeps the old file alive until it exits.
        const target = process.env.APPIMAGE;
        const staged = `${target}.update`;
        fs.copyFileSync(this.file, staged);
        fs.chmodSync(staged, 0o755);
        fs.renameSync(staged, target);
        if (relaunch) spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
      }
    } catch (error) {
      console.error('Update install failed', error);
    }
  }

  download() {
    if (this.file) return Promise.resolve(this.file);
    if (!this.downloading) {
      this.setState({ status: 'downloading', progress: 0 });
      this.downloading = this.fetchInstaller(this.release.asset)
        .then((file) => {
          this.file = file;
          this.setState({ status: 'ready', progress: 1 });
          return file;
        })
        .catch((error) => {
          console.warn('Update download failed:', error.message);
          this.setState({ status: 'downloadFailed' });
          throw error;
        })
        .finally(() => {
          this.downloading = null;
          this.abort = null;
        });
    }
    return this.downloading;
  }

  async fetchLatest() {
    const response = await net.fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': this.userAgent() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!parseVersion(version)) throw new Error(`Unexpected release tag "${release.tag_name}"`);
    // Only ever open or download files of this repository, whatever the response says.
    const url = String(release.html_url || '').startsWith(`${RELEASES_PAGE_URL}/`)
      ? release.html_url
      : RELEASES_PAGE_URL;
    const wanted = installerFor(process);
    const found = wanted && (release.assets || []).find((asset) => asset.name === wanted.name);
    const trusted =
      found &&
      String(found.browser_download_url).startsWith(`${RELEASES_PAGE_URL}/download/`) &&
      /^sha256:[0-9a-f]{64}$/.test(found.digest);
    const asset = trusted
      ? { ...wanted, url: found.browser_download_url, size: found.size, sha256: found.digest.slice(7) }
      : null;
    return { version, url, asset };
  }

  async fetchInstaller(asset) {
    const dir = path.join(app.getPath('temp'), 'peerly-update');
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, asset.name);
    this.abort = new AbortController();
    const response = await net.fetch(asset.url, {
      headers: { 'User-Agent': this.userAgent() },
      signal: this.abort.signal,
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let received = 0;
    let reported = 0;
    try {
      for await (const chunk of response.body) {
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await once(out, 'drain');
        const progress = received / asset.size;
        if (progress - reported >= 0.01) {
          reported = progress;
          this.setState({ progress });
        }
      }
    } finally {
      await new Promise((resolve) => out.end(resolve));
    }
    if (received !== asset.size || hash.digest('hex') !== asset.sha256) {
      await fs.promises.rm(file, { force: true });
      throw new Error('The downloaded installer does not match the release checksum');
    }
    return file;
  }

  openRelease() {
    return shell.openExternal(this.release?.url || RELEASES_PAGE_URL);
  }

  isAvailable(version) {
    return Boolean(version) && compareVersions(version, this.state.current) > 0;
  }

  /**
   * A development run never replaces itself, and a dev build would install the release
   * Peerly next to it rather than update itself; both only link to the release.
   */
  canDownload() {
    return app.isPackaged && CHANNEL !== 'dev' && Boolean(this.release?.asset);
  }

  installsInPlace() {
    return this.canDownload() && this.release.asset.kind !== 'open';
  }

  userAgent() {
    return `Peerly/${this.state.current}`;
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.view());
  }

  /** What the renderer sees. */
  view() {
    const { status, current, latest, progress } = this.state;
    return {
      status,
      current,
      latest,
      progress,
      available: this.isAvailable(latest),
      installsInPlace: this.installsInPlace(),
    };
  }
}

module.exports = { Updater, compareVersions, installerFor };
