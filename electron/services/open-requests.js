const fs = require('fs');

/**
 * .torrent files and magnet links handed to us by Windows (double click,
 * browser, second instance). Buffered until the renderer can show them.
 */
function extractOpenTargets(argv) {
  return argv
    .slice(1)
    .filter((arg) => arg && !arg.startsWith('--'))
    .filter((arg) => /^magnet:/i.test(arg) || (/\.torrent$/i.test(arg) && fs.existsSync(arg)));
}

class OpenRequestQueue {
  /** @param {{ deliver: (target: string) => boolean }} options deliver returns false while the UI is not ready */
  constructor({ deliver }) {
    this.deliver = deliver;
    this.pending = [];
  }

  pushFromArgv(argv) {
    const targets = extractOpenTargets(argv);
    this.pending.push(...targets);
    this.flush();
    return targets.length;
  }

  flush() {
    while (this.pending.length) {
      if (!this.deliver(this.pending[0])) return;
      this.pending.shift();
    }
  }
}

module.exports = { OpenRequestQueue, extractOpenTargets };
