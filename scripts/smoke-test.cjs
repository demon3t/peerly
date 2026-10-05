// End-to-end check of the torrent engine inside the Electron runtime:
// seed -> download by a second client -> pause/resume -> restart/restore -> remove.
// Run: npx electron scripts/smoke-test.cjs
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'peerly-smoke-'));
app.setPath('userData', path.join(sandbox, 'userData'));

const { SettingsStore } = require('../electron/services/settings');
const { TorrentManager } = require('../electron/core/torrent-manager');

const log = (...args) => console.log('[smoke]', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, predicate, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function makeSettings(downloadPath) {
  const settings = new SettingsStore().load();
  settings.values.downloadPath = downloadPath;
  return settings;
}

async function main() {
  const contentDir = path.join(sandbox, 'share', 'Peerly Smoke');
  fs.mkdirSync(contentDir, { recursive: true });
  const payload = crypto.randomBytes(3 * 1024 * 1024 + 12345);
  fs.writeFileSync(path.join(contentDir, 'data.bin'), payload);
  fs.writeFileSync(path.join(contentDir, 'readme.txt'), 'Привет из Peerly');

  // ----- seeder -----
  const seeder = new TorrentManager({
    settings: makeSettings(path.join(sandbox, 'seeder-dl')),
    dataDir: path.join(sandbox, 'seeder-data'),
    clientOptions: { utp: false },
  });
  await seeder.start();
  const seedId = await seeder.seed({ source: contentDir });
  const seedSummary = await waitFor('seed ready', () =>
    seeder.list().find((t) => t.id === seedId && t.status === 'seeding'),
  );
  log('seeding', seedSummary.name, seedSummary.length, 'bytes, files:', seedSummary.fileCount);
  const torrentFile = seeder.torrentFilePath(seedId);
  log('torrent file stored at', torrentFile);

  // duplicate seed is rejected
  await seeder.seed({ source: contentDir }).then(
    () => {
      throw new Error('duplicate seed was accepted');
    },
    (error) => log('duplicate seed rejected:', error.message),
  );

  // ----- leecher (separate state dir) -----
  const leechDir = path.join(sandbox, 'leecher-dl');
  const leecher = new TorrentManager({
    settings: makeSettings(leechDir),
    dataDir: path.join(sandbox, 'leecher-data'),
    clientOptions: { utp: false },
  });
  await leecher.start();

  const external = path.join(sandbox, 'copy.torrent');
  fs.copyFileSync(torrentFile, external);
  const preview = await leecher.inspect(external);
  log('inspect:', preview.name, preview.length, 'bytes', preview.fileCount, 'files');

  const leechId = await leecher.add({ source: external });
  fs.rmSync(external); // our own copy must keep the torrent alive

  await leecher.add({ source: seeder.magnetURI(seedId) }).then(
    () => {
      throw new Error('duplicate add was accepted');
    },
    (error) => log('duplicate add rejected:', error.message),
  );

  const connect = () => {
    const torrent = leecher.records.get(leechId).torrent;
    torrent?.addPeer(`127.0.0.1:${seeder.client.torrentPort}`);
  };
  connect();
  await waitFor('download complete', () => leecher.list().find((t) => t.id === leechId && t.status === 'seeding'));
  const downloaded = fs.readFileSync(path.join(leechDir, 'Peerly Smoke', 'data.bin'));
  if (!downloaded.equals(payload)) throw new Error('downloaded data differs');
  log('download verified byte-for-byte');

  // ----- pause / resume -----
  await leecher.setPaused(leechId, true);
  let summary = leecher.list().find((t) => t.id === leechId);
  if (summary.status !== 'completed' || summary.progress !== 1)
    throw new Error(`bad paused state ${JSON.stringify(summary)}`);
  log('paused: status', summary.status, 'progress', summary.progress, 'live torrents', leecher.client.torrents.length);
  await leecher.setPaused(leechId, false);
  await waitFor('resumed and seeding', () => leecher.list().find((t) => t.id === leechId && t.status === 'seeding'));
  log('resumed and verified existing data');

  const details = leecher.details(leechId);
  log('details files:', details.files.map((f) => `${f.path} ${Math.round(f.progress * 100)}%`).join(', '));

  // ----- restart: restore seeder state from disk -----
  await seeder.shutdown();
  const restored = new TorrentManager({
    settings: makeSettings(path.join(sandbox, 'seeder-dl')),
    dataDir: path.join(sandbox, 'seeder-data'),
    clientOptions: { utp: false },
  });
  await restored.start();
  const back = await waitFor(
    'restored seed',
    () => restored.list().find((t) => t.id === seedId && t.status === 'seeding'),
    20_000,
  ).catch((error) => {
    console.log('[smoke] restored state:', JSON.stringify(restored.list(), null, 1));
    throw error;
  });
  log('restored after restart:', back.name, back.status, 'uploaded', back.uploaded);

  // ----- remove with files -----
  await leecher.remove(leechId, { deleteFiles: true });
  if (fs.existsSync(path.join(leechDir, 'Peerly Smoke'))) throw new Error('files were not deleted');
  log('removed with files; remaining', leecher.list().length);
  const lifetime = leecher.lifetime();
  if (lifetime.received < payload.length) throw new Error(`lifetime lost after remove: ${JSON.stringify(lifetime)}`);
  log('lifetime kept after remove: received', lifetime.received, 'uploaded', lifetime.uploaded);

  // ----- private torrent: no public trackers added -----
  const { default: createTorrent } = await import('create-torrent');
  const privateTracker = 'http://private.example/announce?passkey=secret';
  const privateFile = path.join(sandbox, 'private.torrent');
  const privateBuf = await new Promise((resolve, reject) =>
    createTorrent(
      path.join(contentDir, 'readme.txt'),
      { announceList: [[privateTracker]], private: true },
      (error, buf) => (error ? reject(error) : resolve(buf)),
    ),
  );
  fs.writeFileSync(privateFile, privateBuf);
  const privateId = await leecher.add({ source: privateFile });
  const privateTorrent = await waitFor(
    'private metadata',
    () => leecher.records.get(privateId).torrent?.announce?.length && leecher.records.get(privateId).torrent,
  );
  const leaked = privateTorrent.announce.filter((url) => url !== privateTracker);
  if (leaked.length || !leecher.list().find((t) => t.id === privateId).isPrivate)
    throw new Error(`private torrent leaked trackers: ${leaked}`);
  log('private torrent keeps only its tracker:', privateTorrent.announce);
  await leecher.remove(privateId);

  // ----- remove seed keeps user files -----
  await restored.remove(seedId, { deleteFiles: true });
  if (!fs.existsSync(path.join(contentDir, 'data.bin'))) throw new Error('seed source files were deleted');
  log('seed removed, source files kept');

  await Promise.all([restored.shutdown(), leecher.shutdown()]);
}

app
  .whenReady()
  .then(main)
  .then(() => {
    log('ALL CHECKS PASSED');
    app.exit(0);
  })
  .catch((error) => {
    console.error('[smoke] FAILED', error);
    app.exit(1);
  })
  .finally(() => fs.rmSync(sandbox, { recursive: true, force: true }));
