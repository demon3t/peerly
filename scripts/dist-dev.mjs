// Builds a local "Peerly Dev" Windows installer to try a branch before merging:
// release/upload/Peerly-Dev-Windows-x64-Setup.exe. Dev builds are never published.
// package.json is switched to the dev flavor for the build and restored afterwards.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'package.json');
const original = fs.readFileSync(file);
const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });

try {
  run(`node scripts/dev-flavor.mjs ${process.argv[2] || Math.floor(Date.now() / 1000)}`);
  run('npm run build');
  run('node scripts/package-all.mjs win x64');
} finally {
  fs.writeFileSync(file, original);
}
