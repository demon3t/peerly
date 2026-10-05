const fs = require('fs');
const path = require('path');

const SCAN_DELAY_MS = 800; // let the browser finish writing the file
const ADDED_SUFFIX = '.added';

/**
 * Watched folder: every .torrent file that appears in it is added automatically
 * and renamed to "*.torrent.added" so it is never picked up twice.
 */
class WatchFolder {
  constructor({ manager, settings }) {
    this.manager = manager;
    this.settings = settings;
    this.watcher = null;
    this.folder = '';
    this.timer = null;
  }

  /** (Re)starts watching the folder from settings; an empty setting turns it off. */
  restart() {
    this.stop();
    const folder = this.settings.get('watchFolder');
    if (!folder || !fs.existsSync(folder)) return;
    this.folder = folder;
    try {
      this.watcher = fs.watch(folder, () => this.scheduleScan());
    } catch (error) {
      console.error('Unable to watch folder', folder, error);
      return;
    }
    this.scheduleScan();
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.timer);
  }

  scheduleScan() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.scan(), SCAN_DELAY_MS);
  }

  async scan() {
    let entries = [];
    try {
      entries = await fs.promises.readdir(this.folder);
    } catch {
      return;
    }
    for (const name of entries.filter((entry) => entry.toLowerCase().endsWith('.torrent'))) {
      const file = path.join(this.folder, name);
      try {
        await this.manager.add({ source: file });
      } catch (error) {
        // Duplicates and broken files are skipped but still marked, so they aren't retried forever.
        console.warn('Watched folder: not added', name, error.message);
      }
      await fs.promises.rename(file, file + ADDED_SUFFIX).catch(() => {});
    }
  }
}

module.exports = { WatchFolder };
