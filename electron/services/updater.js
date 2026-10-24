const { EventEmitter } = require('events');
const { app, net, shell } = require('electron');
const { RELEASES_API_URL, RELEASES_PAGE_URL } = require('../config');

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

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
 * Asks GitHub Releases whether a newer Peerly is out. Nothing is downloaded or installed:
 * the user gets a link to the release page. Automatic checks run only while the user
 * has allowed them (settings.checkUpdates); "check now" is always an explicit request.
 * Emits 'change' with the state after every check.
 */
class UpdateChecker extends EventEmitter {
  constructor({ settings }) {
    super();
    this.settings = settings;
    this.timer = null;
    this.pending = null;
    this.state = { status: 'idle', current: app.getVersion(), latest: '', url: '', checkedAt: 0 };
  }

  /** (Re)schedules automatic checks according to the setting. */
  restart() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.settings.get('checkUpdates')) return;
    const sinceLast = Date.now() - this.state.checkedAt;
    const delay = this.state.checkedAt ? Math.max(CHECK_INTERVAL_MS - sinceLast, 0) : FIRST_CHECK_DELAY_MS;
    this.timer = setTimeout(() => {
      this.check().finally(() => this.restart());
    }, delay);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** One check; concurrent calls share the same request. */
  check() {
    if (!this.pending) {
      this.setState({ status: 'checking' });
      this.pending = this.fetchLatest()
        .then(({ version, url }) => {
          const available = compareVersions(version, this.state.current) > 0;
          this.setState({ status: available ? 'available' : 'current', latest: version, url });
        })
        .catch((error) => {
          console.warn('Update check failed:', error.message);
          this.setState({ status: 'error' });
        })
        .finally(() => {
          this.state.checkedAt = Date.now();
          this.pending = null;
        })
        .then(() => this.view());
    }
    return this.pending;
  }

  async fetchLatest() {
    const response = await net.fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Peerly/${this.state.current}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!parseVersion(version)) throw new Error(`Unexpected release tag "${release.tag_name}"`);
    // Only ever open pages of this repository, whatever the response says.
    const url = String(release.html_url || '').startsWith(`${RELEASES_PAGE_URL}/`)
      ? release.html_url
      : RELEASES_PAGE_URL;
    return { version, url };
  }

  openRelease() {
    return shell.openExternal(this.state.url || RELEASES_PAGE_URL);
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.view());
  }

  /** What the renderer sees. */
  view() {
    const { status, current, latest } = this.state;
    return { status, current, latest };
  }
}

module.exports = { UpdateChecker, compareVersions };
