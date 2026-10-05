const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { EXTRA_TRACKERS } = require('../config');
const { readJson, writeJson } = require('../lib/json-file');
const { UserError } = require('../lib/errors');
const record = require('./torrent-record');
const { resolveSource, inspectSource } = require('./torrent-source');
const { effectiveLimits } = require('../services/speed-scheduler');

const SAVE_DEBOUNCE_MS = 300;
const TICK_MS = 1000;
// Speed history for the charts: one sample per tick, kept in memory only.
const GLOBAL_HISTORY = 600; // 10 minutes
const TORRENT_HISTORY = 300; // 5 minutes
// Traffic counters and seeding time grow without 'change' events; persist them periodically.
const AUTOSAVE_TICKS = 30;
const { PRIORITY } = record;

/**
 * Owns the WebTorrent client and every torrent record: adding, seeding,
 * pausing, queueing, seeding limits, removing and persisting them.
 *
 * Which torrents actually run is decided in one place, schedule(): paused and
 * failed ones stay stopped, finished ones seed, unfinished ones take a download
 * slot or wait in the queue.
 *
 * Knows nothing about windows or IPC. Events:
 *   'change'            — something visible changed, UI should refresh
 *   'completed' (item)  — a download finished for the first time
 */
class TorrentManager extends EventEmitter {
  /**
   * @param {object} options
   * @param {import('../services/settings').SettingsStore} options.settings
   * @param {string} options.dataDir where torrents.json and stored .torrent files live
   * @param {object} [options.clientOptions] extra WebTorrent client options
   */
  constructor({ settings, dataDir, clientOptions = {} }) {
    super();
    this.settings = settings;
    this.clientOptions = clientOptions;
    this.statePath = path.join(dataDir, 'torrents.json');
    this.torrentStoreDir = path.join(dataDir, 'torrents');
    this.statsPath = path.join(dataDir, 'stats.json');
    // Traffic of torrents that were removed, so lifetime totals never go down.
    this.archived = { uploaded: 0, received: 0, wasted: 0 };
    this.client = null;
    this.records = new Map();
    this.saveTimer = null;
    this.tickTimer = null;
    this.portInUse = false;
    this.history = []; // [{ t, down, up }]
    this.ticks = 0;
    this.altSpeedActive = false;
    this.scheduleMode = 'full';
  }

  // ---------- lifecycle ----------

  async start() {
    await this.createClient();
    this.restore();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Creates the WebTorrent client; falls back to a random port if the saved one is busy. */
  async createClient() {
    const { default: WebTorrent } = await import('webtorrent');
    const build = (port) =>
      new WebTorrent({
        torrentPort: port,
        maxConns: this.settings.get('maxConns') || 200,
        dht: this.settings.get('dht') !== false,
        utPex: this.settings.get('pex') !== false,
        lsd: this.settings.get('lsd') !== false,
        // IP filter: a P2P/eMule blocklist file or URL.
        ...(this.settings.get('ipFilterPath') ? { blocklist: this.settings.get('ipFilterPath') } : {}),
        ...this.clientOptions,
      });

    const listen = (client) =>
      new Promise((resolve) => {
        const onError = (error) => resolve(error);
        client.once('error', onError);
        client.once('listening', () => {
          client.removeListener('error', onError);
          resolve(null);
        });
      });

    let client = build(this.settings.get('listeningPort') || 0);
    const error = await listen(client);
    this.portInUse = Boolean(error && error.code === 'EADDRINUSE');
    if (this.portInUse) {
      console.warn(`Port ${this.settings.get('listeningPort')} is busy, using a random one`);
      // WebTorrent destroys itself on a TCP listen error; only clean up if it didn't.
      if (!client.destroyed) await new Promise((resolve) => client.destroy(() => resolve()));
      client = build(0);
      await listen(client);
    }
    client.on('error', (err) => console.error('WebTorrent error', err));
    this.client = client;
    this.applyLimits();
  }

  /** Applies connection settings (port, DHT, …) by recreating the client; torrents resume. */
  async restartEngine() {
    for (const item of this.records.values()) await this.stopTorrent(item);
    const old = this.client;
    this.client = null;
    if (old) await new Promise((resolve) => old.destroy(() => resolve()));
    await this.createClient();
    this.schedule();
    this.changed();
  }

  /** Applies the normal or alternative speed limits and the schedule mode, whichever is active now. */
  applyLimits() {
    if (!this.client) return;
    const limits = effectiveLimits(this.settings);
    this.altSpeedActive = limits.alternative;
    this.client.throttleDownload(limits.download);
    this.client.throttleUpload(limits.upload);
    if (limits.mode !== this.scheduleMode) {
      this.scheduleMode = limits.mode;
      this.schedule();
    }
  }

  /** Persists state and tears down all peer connections (bounded by a timeout). */
  shutdown(timeoutMs = 4000) {
    clearInterval(this.tickTimer);
    this.saveNow();
    const client = this.client;
    this.client = null;
    if (!client || client.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      client.destroy(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // ---------- queries ----------

  list() {
    return Array.from(this.records.values()).map((item) => record.toSummary(item, this.exportInfo(item)));
  }

  details(id) {
    const item = this.get(id);
    return record.toDetails(item, this.exportInfo(item), {
      dht: this.settings.get('dht') !== false,
      pex: this.settings.get('pex') !== false,
      lsd: this.settings.get('lsd') !== false,
    });
  }

  network() {
    const client = this.client;
    if (!client) return { online: false, port: 0, portInUse: false, downloadSpeed: 0, uploadSpeed: 0 };
    return {
      online: Boolean(client.listening),
      port: client.torrentPort || 0,
      portInUse: this.portInUse,
      altSpeed: this.altSpeedActive,
      scheduleMode: this.scheduleMode,
      downloadSpeed: client.downloadSpeed,
      uploadSpeed: client.uploadSpeed,
    };
  }

  /** Local all-time traffic: current torrents plus everything ever removed. */
  lifetime() {
    let uploaded = this.archived.uploaded;
    let received = this.archived.received;
    let wasted = this.archived.wasted || 0;
    for (const item of this.records.values()) {
      uploaded += record.totalUploaded(item);
      received += record.totalReceived(item);
      wasted += record.totalWasted(item);
    }
    return { uploaded, received, wasted };
  }

  /** Speed samples for the charts: the whole client, or one torrent when `id` is given. */
  speedHistory(id) {
    return id ? this.get(id).history || [] : this.history;
  }

  inspect(source) {
    return inspectSource(source);
  }

  get(id) {
    const item = this.records.get(id);
    if (!item) throw new UserError('errors.taskNotFound');
    return item;
  }

  /** Path of the downloaded content (file or top-level folder). */
  contentPath(id) {
    const item = this.get(id);
    const name = item.torrent?.name || item.name;
    return name ? path.join(item.savePath, name) : item.savePath;
  }

  magnetURI(id) {
    const item = this.get(id);
    const magnet = item.torrent?.magnetURI || item.magnetURI;
    if (!magnet) throw new UserError('errors.magnetUnavailable');
    return magnet;
  }

  torrentFilePath(id) {
    const item = this.get(id);
    if (!this.hasTorrentFile(item)) throw new UserError('errors.torrentFileNotReady');
    return item.torrentFile;
  }

  /** Absolute path of one file inside a torrent, guarded against path traversal. */
  filePath(id, relativePath) {
    const item = this.get(id);
    const root = path.resolve(item.savePath);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + path.sep)) throw new UserError('errors.invalidPath');
    if (!fs.existsSync(target)) throw new UserError('errors.fileNotDownloaded');
    return target;
  }

  // ---------- commands ----------

  /**
   * @param {{ source: string, savePath?: string, paused?: boolean, filePriorities?: number[] }} options
   *   `paused` defaults to the "add paused" setting.
   */
  async add({ source, savePath, paused = this.settings.get('addPaused'), filePriorities = null }) {
    const { input, parsed, kind } = await resolveSource(source);
    // With an "incomplete" folder the data lands there first and moves to the
    // final folder when the download finishes.
    const finalPath = savePath ? path.resolve(savePath) : this.settings.downloadPath();
    const incomplete = this.settings.get('incompleteEnabled') && this.settings.get('incompletePath');
    const duplicate = this.findByInfoHash(parsed.infoHash);
    if (duplicate)
      throw new UserError('errors.duplicateTorrent', { name: duplicate.name || parsed.name || parsed.infoHash });

    const item = record.createRecord({
      infoHash: parsed.infoHash,
      name: parsed.name || parsed.dn || '',
      isPrivate: Boolean(parsed.private),
      magnetURI: kind === 'magnet' && String(source).startsWith('magnet:') ? String(source).trim() : '',
      sourceType: kind,
      savePath: incomplete ? path.resolve(incomplete) : finalPath,
      finalPath: incomplete ? finalPath : '',
      paused: Boolean(paused),
      filePriorities: Array.isArray(filePriorities) ? filePriorities.map(Number) : null,
    });

    if (Buffer.isBuffer(input)) {
      item.torrentFile = this.storeTorrentFile(parsed.infoHash, input);
      // We keep our own copy, so the user's file can go if they asked for that.
      if (this.settings.get('deleteTorrentAfterAdd'))
        await fs.promises.rm(String(source), { force: true }).catch(() => {});
    }

    this.records.set(item.id, item);
    try {
      this.schedule();
    } catch (error) {
      this.records.delete(item.id);
      throw error;
    }
    this.changed();
    return item.id;
  }

  /**
   * Creates a new torrent from local files and starts sharing it.
   * @param {{ source: string, isPrivate?: boolean, trackers?: string[], comment?: string }} options
   */
  seed({ source, isPrivate = false, trackers = [], comment = '' }) {
    source = String(source || '').trim();
    if (!source) return Promise.reject(new UserError('errors.seedSourceMissing'));
    if (!fs.existsSync(source)) return Promise.reject(new UserError('errors.seedSourceNotFound'));

    const ownTrackers = cleanTrackers(trackers);
    const item = record.createRecord({
      name: path.basename(source),
      sourceType: 'seed',
      savePath: path.dirname(source),
      isPrivate: Boolean(isPrivate),
      extraTrackers: ownTrackers,
    });
    this.records.set(item.id, item);

    // A private torrent only announces to the trackers the user listed.
    const announce = isPrivate ? ownTrackers : [...ownTrackers, ...EXTRA_TRACKERS];
    const options = {
      announceList: announce.map((url) => [url]),
      private: Boolean(isPrivate),
      ...(comment ? { comment: String(comment) } : {}),
    };

    return new Promise((resolve, reject) => {
      const fail = (error) => {
        this.records.delete(item.id);
        this.changed();
        reject(error);
      };

      // For content that is already shared WebTorrent silently drops the new
      // torrent and calls back with the existing one.
      const torrent = this.client.seed(source, options, (seeded) => {
        if (seeded !== torrent) {
          fail(new UserError('errors.alreadySeeding'));
          return;
        }
        item.completedAt = item.completedAt || Date.now();
        this.changed();
      });
      this.attach(item, torrent);
      torrent.once('ready', () => resolve(item.id));
      torrent.once('error', (error) =>
        fail(new UserError('errors.seedFailed', { reason: error?.message || String(error) })),
      );
      this.changed();
    });
  }

  async setPaused(id, paused) {
    const item = this.get(id);
    item.paused = Boolean(paused);
    if (paused) {
      await this.stopTorrent(item);
    } else {
      item.error = '';
      item.limitReached = false;
    }
    this.schedule();
    this.changed();
  }

  async toggle(id) {
    await this.setPaused(id, !this.get(id).paused);
  }

  async setAllPaused(paused) {
    for (const item of this.records.values()) {
      item.paused = Boolean(paused);
      if (paused) await this.stopTorrent(item);
      else {
        item.error = '';
        item.limitReached = false;
      }
    }
    this.schedule();
    this.changed();
  }

  async remove(id, { deleteFiles = false } = {}) {
    const item = this.get(id);
    const name = item.torrent?.name || item.name;
    await this.stopTorrent(item);

    // Seeds point at the user's own files, so they are never deleted from disk.
    if (deleteFiles && item.sourceType !== 'seed' && name) {
      const target = path.resolve(item.savePath, name);
      if (target !== path.resolve(item.savePath)) {
        await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {});
      }
    }
    if (item.torrentFile && item.torrentFile.startsWith(this.torrentStoreDir)) {
      await fs.promises.rm(item.torrentFile, { force: true }).catch(() => {});
    }
    this.archived.uploaded += record.totalUploaded(item);
    this.archived.received += record.totalReceived(item);
    this.archived.wasted = (this.archived.wasted || 0) + record.totalWasted(item);
    this.records.delete(id);
    this.schedule(); // a download slot may have been freed
    this.changed();
  }

  /** qBittorrent's "Force recheck": re-verify every piece already on disk. */
  async recheck(id) {
    const item = this.get(id);
    await this.exclusive(item, async () => {
      await this.stopTorrent(item);
      item.error = '';
    });
  }

  /** Runs an operation on a stopped torrent without the scheduler restarting it midway. */
  async exclusive(item, operation) {
    item.busy = true;
    try {
      await operation();
    } finally {
      item.busy = false;
      this.schedule();
      this.changed();
    }
  }

  /** Moves the downloaded files to another folder and continues from there. */
  async move(id, destination) {
    const item = this.get(id);
    const target = path.resolve(String(destination || ''));
    if (!destination || target === path.resolve(item.savePath)) return;
    const name = item.torrent?.name || item.name;
    await this.exclusive(item, async () => {
      await this.stopTorrent(item);
      fs.mkdirSync(target, { recursive: true });
      if (name) {
        const from = path.join(item.savePath, name);
        const to = path.join(target, name);
        if (fs.existsSync(to)) throw new UserError('errors.moveTargetExists', { path: to });
        if (fs.existsSync(from)) {
          try {
            await fs.promises.rename(from, to);
          } catch (error) {
            if (error.code !== 'EXDEV') throw new UserError('errors.moveFailed', { reason: error.message });
            // Different drive: copy, then delete the original.
            await fs.promises.cp(from, to, { recursive: true });
            await fs.promises.rm(from, { recursive: true, force: true });
          }
        }
      }
      item.savePath = target;
    });
  }

  /** @param {number[]} priorities PRIORITY value per file index */
  setFilePriorities(id, priorities) {
    const item = this.get(id);
    item.filePriorities = priorities.map((value) => Math.max(0, Math.min(2, Number(value) || 0)));
    if (item.torrent?.ready) this.applyPriorities(item);
    // Newly selected files make a finished torrent download again.
    if (!record.isComplete(item)) item.completedAt = null;
    this.schedule();
    this.changed();
  }

  async addTrackers(id, urls) {
    const item = this.get(id);
    const added = cleanTrackers(urls).filter((url) => !item.extraTrackers.includes(url));
    if (!added.length) return;
    item.extraTrackers = [...item.extraTrackers, ...added];
    // WebTorrent can't add trackers to a running torrent; restart it with the new list.
    await this.exclusive(item, () => this.stopTorrent(item));
  }

  // ---------- scheduling ----------

  /**
   * Decides which torrents run. Finished ones seed; unfinished ones take one of
   * `maxActiveDownloads` slots in the order they were added, the rest wait.
   * The weekly schedule can hold back downloads ("seed only") or everything ("off").
   */
  schedule() {
    if (!this.client) return;
    const run = (item) => {
      if (item.torrent) return;
      try {
        this.startTorrent(item);
      } catch (error) {
        item.error = error.message;
      }
    };
    const limit = this.settings.get('maxActiveDownloads') || 0;
    const waiting = [];
    const held = [];
    let active = 0;

    const byAge = Array.from(this.records.values()).sort((a, b) => a.addedAt - b.addedAt);
    for (const item of byAge) {
      if (item.busy) continue;
      if (item.paused || item.error) {
        item.queued = false;
        item.scheduled = false;
        continue;
      }
      const seeding = record.isComplete(item) || item.sourceType === 'seed';
      if (this.scheduleMode === 'off' || (!seeding && this.scheduleMode === 'seed')) {
        held.push(item);
        continue;
      }
      item.scheduled = false;
      if (seeding) {
        item.queued = false;
        run(item);
        continue;
      }
      if (!limit || active < limit) {
        active += 1;
        item.queued = false;
        run(item);
      } else {
        waiting.push(item);
      }
    }

    for (const item of waiting) {
      item.queued = true;
      if (item.torrent) this.stopTorrent(item).then(() => this.changed());
    }
    for (const item of held) {
      item.queued = false;
      item.scheduled = true;
      if (item.torrent) this.stopTorrent(item).then(() => this.changed());
    }
  }

  /** Once per second: completion, seeding time and seeding limits. */
  tick() {
    this.recordSpeeds();
    this.ticks += 1;
    if (this.ticks % AUTOSAVE_TICKS === 0) this.saveNow();
    let dirty = false;

    // The schedule may switch the alternative limits or the mode (seed only / off).
    const limits = effectiveLimits(this.settings);
    if (limits.alternative !== this.altSpeedActive || limits.mode !== this.scheduleMode) {
      this.applyLimits();
      dirty = true;
    }
    for (const item of this.records.values()) {
      if (!item.torrent?.ready || item.paused) continue;
      const complete = record.isComplete(item);

      if (complete && !item.completedAt) {
        item.completedAt = Date.now();
        dirty = true;
        if (item.sourceType !== 'seed') this.emit('completed', { id: item.id, name: item.torrent.name });
        if (item.finalPath) this.moveToFinal(item);
      }
      if (!complete) continue;

      item.seedingSeconds += TICK_MS / 1000;
      if (this.limitReached(item)) {
        dirty = true;
        this.applyLimitAction(item);
      }
    }
    if (dirty) {
      this.schedule();
      this.changed();
    }
  }

  recordSpeeds() {
    const t = Date.now();
    const push = (list, sample, max) => {
      list.push(sample);
      if (list.length > max) list.splice(0, list.length - max);
    };
    push(
      this.history,
      {
        t,
        down: this.client ? this.client.downloadSpeed : 0,
        up: this.client ? this.client.uploadSpeed : 0,
      },
      GLOBAL_HISTORY,
    );
    for (const item of this.records.values()) {
      if (!item.history) item.history = [];
      const live = item.torrent?.ready;
      push(
        item.history,
        { t, down: live ? item.torrent.downloadSpeed : 0, up: live ? item.torrent.uploadSpeed : 0 },
        TORRENT_HISTORY,
      );
    }
  }

  /** Moves a finished download out of the "incomplete" folder. */
  moveToFinal(item) {
    const destination = item.finalPath;
    item.finalPath = '';
    this.move(item.id, destination).catch((error) => {
      item.error = error.message;
      this.changed();
    });
  }

  limitReached(item) {
    const s = this.settings;
    if (s.get('ratioLimitEnabled')) {
      const cache = record.progressCache(item);
      if (record.shareRatio(item, cache?.length || 0) >= s.get('ratioLimit')) return true;
    }
    if (s.get('seedTimeLimitEnabled') && item.seedingSeconds >= s.get('seedTimeLimit') * 60) return true;
    return false;
  }

  applyLimitAction(item) {
    if (this.settings.get('limitAction') === 'remove') {
      this.remove(item.id, { deleteFiles: false }).catch((error) =>
        console.error('Seeding limit remove failed', error),
      );
      return;
    }
    item.paused = true;
    item.limitReached = true;
    this.stopTorrent(item).then(() => this.changed());
  }

  // ---------- internals ----------

  exportInfo(item) {
    return { canExport: this.hasTorrentFile(item) };
  }

  hasTorrentFile(item) {
    return Boolean(item.torrentFile && fs.existsSync(item.torrentFile));
  }

  findByInfoHash(infoHash) {
    if (!infoHash) return null;
    return Array.from(this.records.values()).find((item) => item.infoHash === infoHash) || null;
  }

  /** Keeps our own copy so the torrent survives the user deleting the original file. */
  storeTorrentFile(infoHash, buffer) {
    fs.mkdirSync(this.torrentStoreDir, { recursive: true });
    const target = path.join(this.torrentStoreDir, `${infoHash}.torrent`);
    if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
    return target;
  }

  announceList(item) {
    // Private-tracker torrents must only talk to their own tracker: adding
    // public trackers would leak the info hash and can get the account banned.
    return item.isPrivate ? item.extraTrackers : [...item.extraTrackers, ...EXTRA_TRACKERS];
  }

  startTorrent(item) {
    const source = this.hasTorrentFile(item) ? fs.readFileSync(item.torrentFile) : item.magnetURI || item.infoHash;
    if (!source) throw new UserError('errors.noTorrentData');
    fs.mkdirSync(item.savePath, { recursive: true });
    const torrent = this.client.add(source, {
      path: item.savePath,
      announce: this.announceList(item),
      // WebTorrent's 'rarest' strategy blocks the main process for 10+ seconds at
      // high speed and is ~4x slower; its default in-order strategy is used instead.
      strategy: 'sequential',
      // Trackers credit `downloaded` to the account; report bytes really
      // received this session, not data that was already on disk.
      getAnnounceOpts: () => ({ downloaded: torrent.received }),
    });
    this.attach(item, torrent);
  }

  /** WebTorrent's pause() keeps existing peers; destroying the instance is a real pause. */
  stopTorrent(item) {
    const torrent = item.torrent;
    if (!torrent) return Promise.resolve();
    item.cache = record.progressCache(item);
    record.freezeTraffic(item);
    item.torrent = null;
    return new Promise((resolve) => torrent.destroy({ destroyStore: false }, () => resolve()));
  }

  /** Downloads only wanted files; "high" files get their pieces first. */
  applyPriorities(item) {
    const torrent = item.torrent;
    if (!torrent?.ready || !item.filePriorities) return;
    torrent.deselect(0, torrent.pieces.length - 1);
    torrent.files.forEach((file, index) => {
      const priority = item.filePriorities[index] ?? PRIORITY.normal;
      if (priority === PRIORITY.skip) return;
      file.select(priority === PRIORITY.high ? 1 : 0);
    });
  }

  attach(item, torrent) {
    item.torrent = torrent;
    item.error = '';
    const current = () => item.torrent === torrent;

    torrent.on('infoHash', () => {
      if (!current()) return;
      item.infoHash = torrent.infoHash;
      item.magnetURI = torrent.magnetURI;
    });

    torrent.on('metadata', () => {
      if (!current()) return;
      item.name = torrent.name;
      item.infoHash = torrent.infoHash;
      item.magnetURI = torrent.magnetURI;
      item.isPrivate = Boolean(torrent.private);
      if (item.filePriorities && item.filePriorities.length !== torrent.files.length) item.filePriorities = null;
      if (torrent.torrentFile) {
        try {
          item.torrentFile = this.storeTorrentFile(torrent.infoHash, torrent.torrentFile);
        } catch (error) {
          console.error('Unable to store torrent file', error);
        }
      }
      this.changed();
    });

    torrent.on('ready', () => {
      if (!current()) return;
      item.sessionStart = Number(torrent.downloaded || 0); // data already on disk is not "downloaded"
      this.applyPriorities(item);
      item.cache = record.progressCache(item);
      if (record.isComplete(item) && !item.completedAt) item.completedAt = Date.now();
      this.schedule();
      this.changed();
    });

    torrent.on('error', (error) => {
      if (!current()) return;
      item.error = error?.message || String(error);
      record.freezeTraffic(item);
      item.torrent = null;
      this.schedule();
      this.changed();
    });
  }

  restore() {
    this.archived = { ...this.archived, ...readJson(this.statsPath, {}).archived };
    for (const saved of readJson(this.statePath, [])) {
      if (!saved || (!saved.torrentFile && !saved.magnetURI && !saved.infoHash)) continue;
      const item = record.fromPersisted(saved);
      if (!item.savePath) item.savePath = this.settings.downloadPath();
      this.records.set(item.id, item);
    }
    try {
      this.schedule();
    } catch (error) {
      console.error('Unable to start restored torrents', error);
    }
    this.changed();
  }

  changed() {
    this.emit('change');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    try {
      writeJson(this.statePath, Array.from(this.records.values()).map(record.toPersisted));
      writeJson(this.statsPath, { archived: this.archived });
    } catch (error) {
      console.error('Unable to save torrent state', error);
    }
  }
}

function cleanTrackers(urls) {
  const list = Array.isArray(urls) ? urls : String(urls || '').split(/\s+/);
  return [...new Set(list.map((url) => String(url).trim()).filter((url) => /^(udp|https?|wss?):\/\//i.test(url)))];
}

module.exports = { TorrentManager };
