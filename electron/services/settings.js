const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('../config');
const { readJson, writeJson } = require('../lib/json-file');
const paths = require('../lib/paths');
const { SCHEDULE_PATTERN, legacySchedule } = require('./speed-scheduler');

const INTEGER_KEYS = new Set([
  'downloadLimit',
  'uploadLimit',
  'altDownloadLimit',
  'altUploadLimit',
  'maxConns',
  'maxActiveDownloads',
  'seedTimeLimit',
  'listeningPort',
]);
const FLOAT_KEYS = new Set(['ratioLimit']);
// Allowed values: null = any string, an array = one of, a RegExp = must match.
const STRING_KEYS = {
  language: null,
  limitAction: ['pause', 'remove'],
  schedule: SCHEDULE_PATTERN,
};
// Optional folders/files: '' means "off", anything else is stored as an absolute path.
const OPTIONAL_PATHS = new Set(['incompletePath', 'watchFolder', 'ipFilterPath']);

/** Persistent user preferences. Emits 'change' with (settings, changedKeys). */
class SettingsStore extends EventEmitter {
  constructor() {
    super();
    this.values = { ...DEFAULT_SETTINGS };
  }

  load() {
    const saved = readJson(paths.settingsPath(), {});
    this.values = { ...DEFAULT_SETTINGS, ...saved };
    // Before the weekly grid the schedule was one "from–to on these days" window.
    if (!saved.schedule && saved.schedulerFrom) this.values.schedule = legacySchedule(saved);
    for (const key of ['schedulerFrom', 'schedulerTo', 'schedulerDays']) delete this.values[key];
    if (!SCHEDULE_PATTERN.test(this.values.schedule)) this.values.schedule = DEFAULT_SETTINGS.schedule;
    if (!this.values.downloadPath) this.values.downloadPath = paths.defaultDownloadPath();
    if (!this.values.listeningPort) {
      // A stable port (like qBittorrent) so the user can forward it on the router.
      this.values.listeningPort = 20000 + Math.floor(Math.random() * 40000);
      writeJson(paths.settingsPath(), this.values);
    }
    if (this.values.listeningPort > 65535) this.values.listeningPort = 65535;
    return this;
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  /** Download folder, created on demand. */
  downloadPath() {
    fs.mkdirSync(this.values.downloadPath, { recursive: true });
    return this.values.downloadPath;
  }

  update(patch = {}) {
    const changed = [];
    for (const [key, raw] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      let value;
      if (INTEGER_KEYS.has(key)) value = Math.max(0, Math.floor(Number(raw) || 0));
      else if (FLOAT_KEYS.has(key)) value = Math.max(0, Math.round((Number(raw) || 0) * 100) / 100);
      else if (key === 'downloadPath') value = path.resolve(String(raw));
      else if (OPTIONAL_PATHS.has(key)) {
        const text = String(raw || '').trim();
        value = !text || /^https?:\/\//i.test(text) ? text : path.resolve(text);
      } else if (key in STRING_KEYS) {
        value = String(raw);
        const rule = STRING_KEYS[key];
        if (Array.isArray(rule) && !rule.includes(value)) continue;
        if (rule instanceof RegExp && !rule.test(value)) continue;
      } else value = Boolean(raw);
      if (this.values[key] === value) continue;
      this.values[key] = value;
      changed.push(key);
    }
    if (changed.length) {
      writeJson(paths.settingsPath(), this.values);
      this.emit('change', this.all(), changed);
    }
    return this.all();
  }
}

module.exports = { SettingsStore };
