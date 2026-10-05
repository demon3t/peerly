// End-to-end check of qBittorrent-style options inside Electron:
// speed schedule, incomplete folder, watched folder, "add paused",
// "delete .torrent after adding".
// Run: npx electron scripts/settings-test.cjs
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'peerly-settings-'));
app.setPath('userData', path.join(sandbox, 'userData'));

const { SettingsStore } = require('../electron/services/settings');
const { TorrentManager } = require('../electron/core/torrent-manager');
const { WatchFolder } = require('../electron/services/watch-folder');
const { scheduleMode, legacySchedule, effectiveLimits } = require('../electron/services/speed-scheduler');

const log = (...args) => console.log('[settings]', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitFor(label, predicate, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function makeManager(name, overrides = {}) {
  const settings = new SettingsStore().load();
  Object.assign(settings.values, { downloadPath: path.join(sandbox, `${name}-dl`), listeningPort: 0, ...overrides });
  const manager = new TorrentManager({
    settings,
    dataDir: path.join(sandbox, `${name}-data`),
    clientOptions: { utp: false },
  });
  return { settings, manager };
}

/** Minimal stand-in for SettingsStore in the pure scheduler checks. */
const fakeSettings = (values) => ({ get: (key) => values[key] });

function checkScheduler() {
  const at = (day, hh, mm) => new Date(2026, 9, 4 + day, hh, mm); // 2026-10-04 is a Sunday (day 0)
  // The old "22:00–07:00 on weekdays" window converts into the weekly grid.
  const night = fakeSettings({
    schedulerEnabled: true,
    schedule: legacySchedule({ schedulerFrom: '22:00', schedulerTo: '07:00', schedulerDays: 'weekdays' }),
  });
  assert(scheduleMode(night, at(1, 23, 0)) === 'limited', 'Monday 23:00 should be in a 22–07 weekday schedule');
  assert(scheduleMode(night, at(2, 6, 30)) === 'limited', 'Tuesday 06:30 belongs to Monday night');
  assert(scheduleMode(night, at(1, 6, 30)) === 'full', 'Monday 06:30 belongs to Sunday night (weekend)');
  assert(scheduleMode(night, at(1, 12, 0)) === 'full', 'Noon is outside 22–07');

  // Every hour has its own mode; a disabled schedule is always full speed.
  const week = '0'.repeat(168).split('');
  week[3 * 24 + 14] = '2'; // Wednesday 14:00 – seeding only
  week[6 * 24 + 2] = '3'; // Saturday 02:00 – off
  const grid = { schedulerEnabled: true, schedule: week.join('') };
  assert(scheduleMode(fakeSettings(grid), at(3, 14, 59)) === 'seed', 'Wednesday 14:59 is seeding only');
  assert(scheduleMode(fakeSettings(grid), at(6, 2, 0)) === 'off', 'Saturday 02:00 is off');
  assert(scheduleMode(fakeSettings(grid), at(3, 15, 0)) === 'full', 'Wednesday 15:00 is full speed');
  assert(scheduleMode(fakeSettings({ ...grid, schedulerEnabled: false }), at(6, 2, 0)) === 'full', 'disabled schedule');
  const limited = effectiveLimits(
    fakeSettings({ schedulerEnabled: true, schedule: '1'.repeat(168), altDownloadLimit: 64, altUploadLimit: 0 }),
  );
  assert(limited.mode === 'limited' && limited.alternative && limited.download === 64 * 1024, 'limited hours');

  const limits = effectiveLimits(
    fakeSettings({
      altSpeedEnabled: true,
      altDownloadLimit: 100,
      altUploadLimit: 50,
      downloadLimit: 0,
      uploadLimit: 0,
    }),
  );
  assert(
    limits.alternative && limits.download === 100 * 1024 && limits.upload === 50 * 1024,
    'manual alternative limits',
  );
  const normal = effectiveLimits(
    fakeSettings({ altSpeedEnabled: false, schedulerEnabled: false, downloadLimit: 0, uploadLimit: 10 }),
  );
  assert(!normal.alternative && normal.download === -1 && normal.upload === 10 * 1024, 'normal limits');
  log('scheduler: weekly grid, legacy window migration and manual mode are correct');
}

async function main() {
  checkScheduler();

  const content = path.join(sandbox, 'share', 'Payload');
  fs.mkdirSync(content, { recursive: true });
  fs.writeFileSync(path.join(content, 'data.bin'), crypto.randomBytes(512 * 1024));

  const { manager: seeder, settings: seederSettings } = makeManager('seeder');
  await seeder.start();
  const seedId = await seeder.seed({ source: content });
  await waitFor('seed ready', () => seeder.list().find((t) => t.id === seedId)?.status === 'seeding');
  const torrentFile = seeder.torrentFilePath(seedId);
  const connect = (manager, id) => manager.records.get(id).torrent?.addPeer(`127.0.0.1:${seeder.client.torrentPort}`);

  // ----- incomplete folder: download there, move to the final folder when done -----
  const incomplete = path.join(sandbox, 'incomplete');
  const { manager: leecher, settings } = makeManager('leecher', {
    incompleteEnabled: true,
    incompletePath: incomplete,
  });
  await leecher.start();
  const id = await leecher.add({ source: torrentFile });
  assert(leecher.list()[0].savePath === incomplete, 'should download into the incomplete folder');
  await waitFor('metadata', () => leecher.records.get(id).torrent?.ready);
  connect(leecher, id);
  const finalFolder = settings.get('downloadPath');
  await waitFor('moved to final folder', () => {
    const item = leecher.list().find((t) => t.id === id);
    return item.status === 'seeding' && item.savePath === finalFolder;
  });
  assert(fs.existsSync(path.join(finalFolder, 'Payload', 'data.bin')), 'file not in final folder');
  assert(!fs.existsSync(path.join(incomplete, 'Payload')), 'file left in incomplete folder');
  log('incomplete folder: downloaded there and moved to', finalFolder);
  await leecher.remove(id);

  // ----- add paused + delete .torrent after adding -----
  settings.values.addPaused = true;
  settings.values.deleteTorrentAfterAdd = true;
  const copy = path.join(sandbox, 'copy.torrent');
  fs.copyFileSync(torrentFile, copy);
  const pausedId = await leecher.add({ source: copy });
  assert(leecher.list().find((t) => t.id === pausedId).status === 'paused', 'should be added paused');
  assert(!fs.existsSync(copy), 'source .torrent should be deleted');
  log(
    'add paused: status paused; source .torrent deleted, own copy kept:',
    fs.existsSync(leecher.torrentFilePath(pausedId)),
  );
  await leecher.remove(pausedId);
  settings.values.addPaused = false;
  settings.values.deleteTorrentAfterAdd = false;

  // ----- watched folder -----
  const watched = path.join(sandbox, 'watched');
  fs.mkdirSync(watched);
  settings.values.watchFolder = watched;
  const watcher = new WatchFolder({ manager: leecher, settings });
  watcher.restart();
  fs.copyFileSync(torrentFile, path.join(watched, 'dropped.torrent'));
  await waitFor('watched torrent added', () => leecher.list().length === 1, 10_000);
  await waitFor('file marked as added', () => fs.existsSync(path.join(watched, 'dropped.torrent.added')), 5_000);
  log('watched folder: torrent added automatically and renamed to .added');
  watcher.stop();

  // ----- weekly schedule: "off" stops everything, "seed only" holds downloads -----
  const setMode = (store, manager, digit) => {
    Object.assign(store.values, { schedulerEnabled: true, schedule: String(digit).repeat(168) });
    manager.applyLimits();
  };
  setMode(seederSettings, seeder, 3);
  await waitFor('seed held by schedule', () => {
    const item = seeder.list().find((t) => t.id === seedId);
    return item.status === 'scheduled' && !seeder.records.get(seedId).torrent;
  });
  assert(seeder.network().scheduleMode === 'off', 'network reports the schedule mode');
  setMode(seederSettings, seeder, 2);
  await waitFor('seed runs in "seeding only"', () => seeder.list().find((t) => t.id === seedId).status === 'seeding');

  const second = path.join(sandbox, 'share', 'Second');
  fs.mkdirSync(second);
  fs.writeFileSync(path.join(second, 'more.bin'), crypto.randomBytes(256 * 1024));
  const secondId = await seeder.seed({ source: second });
  setMode(settings, leecher, 2);
  const pending = await leecher.add({ source: seeder.torrentFilePath(secondId) });
  await waitFor(
    'download held in "seeding only"',
    () => leecher.list().find((t) => t.id === pending).status === 'scheduled',
  );
  setMode(settings, leecher, 0);
  await waitFor(
    'download resumes at full speed',
    () => leecher.list().find((t) => t.id === pending).status !== 'scheduled',
  );
  log('schedule: "off" stops seeding, "seeding only" holds downloads, full speed resumes them');

  await Promise.all([leecher.shutdown(), seeder.shutdown()]);
}

app
  .whenReady()
  .then(main)
  .then(() => {
    log('ALL CHECKS PASSED');
    fs.rmSync(sandbox, { recursive: true, force: true });
    app.exit(0);
  })
  .catch((error) => {
    console.error('[settings] FAILED', error);
    app.exit(1);
  });
