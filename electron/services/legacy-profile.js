const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// The app used to be called "Northstar Torrent" and kept its data here.
const LEGACY_FOLDER = 'northstar-torrent';
const FILES = ['settings.json', 'torrents.json', 'stats.json'];
const FOLDERS = ['torrents', 'locales'];

/**
 * One-time copy of torrents, statistics, settings and translations from the
 * old profile into the current one. The old folder is left untouched as a backup.
 * @returns {boolean} whether anything was migrated
 */
function migrateLegacyProfile() {
  const target = app.getPath('userData');
  const legacy = path.join(app.getPath('appData'), LEGACY_FOLDER);
  if (path.resolve(legacy).toLowerCase() === path.resolve(target).toLowerCase()) return false;
  if (!fs.existsSync(path.join(legacy, 'torrents.json'))) return false;
  if (fs.existsSync(path.join(target, 'torrents.json'))) return false; // already migrated or used

  fs.mkdirSync(target, { recursive: true });
  for (const file of FILES) {
    const from = path.join(legacy, file);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, file));
  }
  for (const folder of FOLDERS) {
    const from = path.join(legacy, folder);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(target, folder), { recursive: true });
  }

  // Stored .torrent copies now live in the new profile.
  const statePath = path.join(target, 'torrents.json');
  try {
    const legacyStore = path.join(legacy, 'torrents');
    const records = JSON.parse(fs.readFileSync(statePath, 'utf8')).map((record) => ({
      ...record,
      torrentFile: record.torrentFile?.startsWith(legacyStore)
        ? path.join(target, 'torrents', path.basename(record.torrentFile))
        : record.torrentFile,
    }));
    fs.writeFileSync(statePath, JSON.stringify(records, null, 2));
  } catch (error) {
    console.error('Unable to update migrated torrent paths', error);
  }
  return true;
}

module.exports = { migrateLegacyProfile };
