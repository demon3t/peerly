// End-to-end check of qBittorrent-style features inside Electron:
// file selection, queue, recheck, move, seeding ratio limit,
// private torrent creation and persistence of all of it.
// Run: npx electron scripts/features-test.cjs
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'peerly-features-'));
app.setPath('userData', path.join(sandbox, 'userData'));

const { SettingsStore } = require('../electron/services/settings');
const { TorrentManager } = require('../electron/core/torrent-manager');

const log = (...args) => console.log('[features]', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitFor(label, predicate, timeoutMs = 60_000) {
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

function makeContent(name, files) {
  const dir = path.join(sandbox, 'share', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, size] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), crypto.randomBytes(size));
  return dir;
}

const summary = (manager, id) => manager.list().find((t) => t.id === id);
const connect = (leecher, id, seeder) =>
  leecher.records.get(id).torrent?.addPeer(`127.0.0.1:${seeder.client.torrentPort}`);

async function main() {
  // Three files of 1 MB with 16 KB pieces, so files don't share many pieces.
  const multi = makeContent('Multi', { 'a.bin': 1 << 20, 'b.bin': 1 << 20, 'c.bin': 1 << 20 });
  const single = makeContent('Single', { 'only.bin': 1 << 20 });

  const { manager: seeder } = makeManager('seeder');
  await seeder.start();
  const multiId = await seeder.seed({ source: multi });
  const singleId = await seeder.seed({ source: single });
  await waitFor(
    'seeds ready',
    () => summary(seeder, multiId)?.status === 'seeding' && summary(seeder, singleId)?.status === 'seeding',
    8000,
  ).catch((e) => {
    console.log(JSON.stringify(seeder.list().map((t) => [t.status, t.progress, t.length, t.error])));
    throw e;
  });
  log('seeder port', seeder.client.torrentPort);

  // ----- queue: only one download at a time -----
  const { manager: leecher, settings: leechSettings } = makeManager('leecher', { maxActiveDownloads: 1 });
  await leecher.start();

  // ----- file selection: skip b.bin, a.bin high priority -----
  const multiFile = seeder.torrentFilePath(multiId);
  const preview = await leecher.inspect(multiFile);
  const order = preview.files.map((f) => path.basename(f.path));
  const priorities = order.map((name) => ({ 'a.bin': 2, 'b.bin': 0, 'c.bin': 1 })[name]);
  const multiLeech = await leecher.add({ source: multiFile, filePriorities: priorities });
  const singleLeech = await leecher.add({ source: seeder.torrentFilePath(singleId) });

  assert(
    summary(leecher, singleLeech).status === 'queued',
    `second torrent should be queued, got ${summary(leecher, singleLeech).status}`,
  );
  log('queue: second torrent is', summary(leecher, singleLeech).status);

  await waitFor('multi metadata', () => leecher.records.get(multiLeech).torrent?.ready);
  connect(leecher, multiLeech, seeder);
  await waitFor('selected files done', () => summary(leecher, multiLeech).status === 'seeding');
  const files = leecher.details(multiLeech).files;
  const byName = Object.fromEntries(files.map((f) => [path.basename(f.path), f]));
  assert(byName['a.bin'].progress === 1 && byName['c.bin'].progress === 1, 'selected files not complete');
  assert(byName['b.bin'].progress < 0.5, `skipped file downloaded: ${byName['b.bin'].progress}`);
  const s = summary(leecher, multiLeech);
  assert(s.length === 2 << 20 && s.totalLength === 3 << 20, `sizes wrong: ${s.length}/${s.totalLength}`);
  log(
    'file selection: a/c done, b skipped at',
    Math.round(byName['b.bin'].progress * 100) + '%',
    '| selected',
    s.length,
    'of',
    s.totalLength,
  );

  // Queue moves on once the first download finished.
  await waitFor('queued torrent started', () => leecher.records.get(singleLeech).torrent?.ready);
  connect(leecher, singleLeech, seeder);
  await waitFor('second download done', () => summary(leecher, singleLeech).status === 'seeding');
  log('queue: second torrent started after the first finished');

  // Selecting the skipped file resumes downloading it.
  leecher.setFilePriorities(
    multiLeech,
    priorities.map(() => 1),
  );
  assert(summary(leecher, multiLeech).status === 'downloading', 'should download newly selected file');
  connect(leecher, multiLeech, seeder);
  await waitFor(
    'all files done',
    () => summary(leecher, multiLeech).status === 'seeding' && summary(leecher, multiLeech).progress === 1,
  );
  log('selecting the skipped file downloads it too');
  const traffic = summary(leecher, multiLeech);
  assert(traffic.received <= traffic.totalLength, `downloaded ${traffic.received} exceeds size ${traffic.totalLength}`);
  log('downloaded', traffic.received, 'of', traffic.totalLength, '| wasted', traffic.wasted);

  // ----- recheck -----
  await leecher.recheck(multiLeech);
  await waitFor('recheck finished', () => summary(leecher, multiLeech).status === 'seeding', 15000).catch((e) => {
    const t = leecher.records.get(multiLeech).torrent;
    console.log(
      'state',
      JSON.stringify(summary(leecher, multiLeech)),
      'ready',
      t?.ready,
      'done',
      t?.done,
      'files',
      JSON.stringify(leecher.details(multiLeech).files.map((f) => f.progress)),
    );
    throw e;
  });
  log('recheck verified data');

  // ----- move -----
  const newHome = path.join(sandbox, 'moved');
  await leecher.move(multiLeech, newHome);
  assert(fs.existsSync(path.join(newHome, 'Multi', 'a.bin')), 'files not moved');
  assert(!fs.existsSync(path.join(leechSettings.get('downloadPath'), 'Multi')), 'old folder still there');
  await waitFor(
    'seeding from new folder',
    () => summary(leecher, multiLeech).status === 'seeding' && summary(leecher, multiLeech).savePath === newHome,
  );
  log('move: files moved and torrent continues from', newHome);

  // ----- persistence -----
  await leecher.shutdown();
  const { manager: restored } = makeManager('leecher', { maxActiveDownloads: 1 });
  await restored.start();
  const back = await waitFor(
    'restored',
    () => summary(restored, multiLeech)?.status === 'seeding' && summary(restored, multiLeech),
  );
  const restoredFiles = restored.details(multiLeech).files;
  assert(back.savePath === newHome && restoredFiles.every((f) => f.priority === 1), 'settings lost after restart');
  log('restart keeps location and file priorities');
  await restored.shutdown();

  // ----- seeding ratio limit on the seeder -----
  seeder.settings.values.ratioLimitEnabled = true;
  seeder.settings.values.ratioLimit = 0.5;
  seeder.settings.values.limitAction = 'pause';
  await waitFor('ratio limit pauses seed', () => summary(seeder, singleId).status === 'completed', 10_000);
  log('ratio limit reached -> seed paused as "completed"; ratio', summary(seeder, singleId).ratio.toFixed(2));

  // ----- private torrent with own trackers -----
  const privateDir = makeContent('Private', { 'p.bin': 50_000 });
  const tracker = 'https://tracker.example/announce?passkey=1';
  const privateId = await seeder.seed({ source: privateDir, isPrivate: true, trackers: [tracker], comment: 'hello' });
  const privateTorrent = seeder.records.get(privateId).torrent;
  assert(
    privateTorrent.private && privateTorrent.announce.length === 1 && privateTorrent.announce[0] === tracker,
    `private announce: ${privateTorrent.announce}`,
  );
  assert(privateTorrent.comment === 'hello', 'comment missing');
  log('private torrent: only', privateTorrent.announce, 'comment', privateTorrent.comment);

  await seeder.shutdown();
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
    console.error('[features] FAILED', error);
    app.exit(1);
  });
