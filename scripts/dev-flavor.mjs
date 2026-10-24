// Turns this working copy into a "Peerly Dev" build: red icon, its own app id, name, install
// folder and profile, so it installs next to the release and never touches its data.
// Used by scripts/dist-dev.mjs (npm run dist:dev), which restores package.json afterwards;
// run on its own, it edits package.json in place — don't commit the result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const build = process.argv[2] || '0';
const NAME = 'Peerly Dev';

// 0.3.0-dev.12 sorts after every 0.3.0-build.N, so the updater never offers a release over it.
pkg.version = `${pkg.version.replace(/-.*$/, '')}-dev.${build}`;
pkg.productName = NAME; // also names the profile folder (userData)
pkg.peerly = { ...pkg.peerly, channel: 'dev' };
Object.assign(pkg.build, { appId: 'com.peerly.app.dev', productName: NAME });
Object.assign(pkg.build.win, {
  icon: 'build/icon-dev.ico',
  artifactName: 'Peerly-Dev-Setup-${version}-${arch}.${ext}',
});
Object.assign(pkg.build.nsis, {
  shortcutName: NAME,
  uninstallDisplayName: NAME,
  installerIcon: 'build/icon-dev.ico',
  uninstallerIcon: 'build/icon-dev.ico',
  installerHeaderIcon: 'build/icon-dev.ico',
});
Object.assign(pkg.build.mac, { icon: 'build/icon-dev.icns', artifactName: 'Peerly-Dev-${version}-${arch}.${ext}' });
Object.assign(pkg.build.linux, { icon: 'build/icon-dev.png', artifactName: 'Peerly-Dev-${version}-${arch}.${ext}' });
pkg.build.dmg.artifactName = 'Peerly-Dev-${version}-${arch}.${ext}';
// The .torrent association stays with the release; a dev build shouldn't take it over.
delete pkg.build.fileAssociations;

fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Dev build: ${NAME} ${pkg.version}`);
