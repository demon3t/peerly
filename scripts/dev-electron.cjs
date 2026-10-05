// Dev runner: starts Electron and restarts it whenever main-process code
// (electron/, shared/) or translations (locales/) change. The renderer is hot-reloaded by Vite separately; the main
// process is not, so without this a running app keeps executing stale code.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const electronPath = require('electron');

const root = path.resolve(__dirname, '..');
// Everything the main process loads at startup.
const watchDirs = ['electron', 'shared', 'locales'].map((dir) => path.join(root, dir));
const RESTART_DELAY_MS = 300;
// The old instance needs a moment to release the single-instance lock; a new
// one started too early sees "already running" and quits immediately.
const RELAUNCH_DELAY_MS = 700;
const EARLY_EXIT_MS = 4000;
const MAX_RETRIES = 5;

let child = null;
let restarting = false;
let timer = null;
let startedAt = 0;
let retries = 0;
const hashes = new Map();

// Windows reports spurious change events (e.g. when another process reads the
// file), so only restart when the content really differs.
function contentChanged(file) {
  let hash = null;
  try {
    hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch {
    // deleted or temporarily locked: treat as a change
  }
  const changed = hashes.get(file) !== hash;
  hashes.set(file, hash);
  return changed;
}

function snapshot(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(full);
    else contentChanged(full);
  }
}

function start() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // set by some IDE terminals; turns Electron into plain Node
  startedAt = Date.now();
  child = spawn(electronPath, ['.'], { cwd: root, env, stdio: 'inherit' });
  child.on('exit', (code) => {
    child = null;
    if (restarting) {
      restarting = false;
      setTimeout(start, RELAUNCH_DELAY_MS);
    } else if (Date.now() - startedAt < EARLY_EXIT_MS && retries < MAX_RETRIES) {
      retries += 1; // lost the single-instance race with the previous process
      setTimeout(start, RELAUNCH_DELAY_MS);
    } else {
      process.exit(code ?? 0); // user closed the app: stop the dev session
    }
  });
  setTimeout(() => {
    retries = 0;
  }, EARLY_EXIT_MS);
}

function restart(file) {
  console.log(`[dev] ${path.relative(root, file)} changed, restarting Electron…`);
  if (!child) return start();
  restarting = true;
  child.kill();
}

for (const dir of watchDirs) {
  snapshot(dir);
  fs.watch(dir, { recursive: true }, (_, fileName) => {
    if (!fileName || !/\.(c?js|mjs|json)$/.test(fileName)) return;
    const file = path.join(dir, fileName);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (contentChanged(file)) restart(file);
    }, RESTART_DELAY_MS);
  });
}

process.on('SIGINT', () => {
  child?.kill();
  process.exit(0);
});

start();
