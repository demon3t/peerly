// Builds every installer of one OS (default: the current one) for all its CPU architectures
// and copies them to release/upload/ under stable names, e.g. Peerly-Windows-x64-Setup.exe.
// Native modules are N-API, so instead of rebuilding them we download the matching
// node-datachannel (WebRTC) binary before each architecture. The optional ones
// (utp-native, fs-native-extensions) ship their own prebuilds or are skipped at runtime.
// Run after `npm run build`: node scripts/package-all.mjs [win|mac|linux]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const releaseDir = path.join(root, 'release');
const uploadDir = path.join(releaseDir, 'upload');

// electron-builder arch -> node-datachannel prebuild arch, and the public file names.
const TARGETS = {
  win: {
    platform: 'win32',
    archs: {
      x64: { prebuild: 'x64', files: { exe: 'Peerly-Windows-x64-Setup.exe' } },
      ia32: { prebuild: 'x86', files: { exe: 'Peerly-Windows-x86-32bit-Setup.exe' } },
      arm64: { prebuild: 'arm64', files: { exe: 'Peerly-Windows-ARM64-Setup.exe' } },
    },
  },
  mac: {
    platform: 'darwin',
    archs: {
      arm64: { prebuild: 'arm64', files: { dmg: 'Peerly-macOS-AppleSilicon.dmg' } },
      x64: { prebuild: 'x64', files: { dmg: 'Peerly-macOS-Intel.dmg' } },
    },
  },
  linux: {
    platform: 'linux',
    archs: {
      x64: { prebuild: 'x64', files: { AppImage: 'Peerly-Linux-x64.AppImage', deb: 'Peerly-Linux-x64.deb' } },
      arm64: {
        prebuild: 'arm64',
        files: { AppImage: 'Peerly-Linux-arm64.AppImage', deb: 'Peerly-Linux-arm64.deb' },
      },
    },
  },
};

const HOST = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
const os = process.argv[2] || HOST;
const target = TARGETS[os];
if (!target) throw new Error(`Unknown OS "${os}". Use one of: ${Object.keys(TARGETS).join(', ')}`);

const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
const nodeBin = process.execPath;

/** Replaces node-datachannel's binary with the prebuild for `platform`/`arch`. */
function fetchWebRtc(platform, arch) {
  const moduleDir = path.join(root, 'node_modules', 'node-datachannel');
  const installer = require.resolve('prebuild-install/bin.js', { paths: [moduleDir] });
  console.log(`\n> node-datachannel for ${platform}-${arch}`);
  run(nodeBin, [installer, '-r', 'napi', '--platform', platform, '--arch', arch, '--force'], moduleDir);
}

/** Name -> modification time of every file in release/, to tell this build's output apart. */
const snapshot = () =>
  new Map(
    fs
      .readdirSync(releaseDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, fs.statSync(path.join(releaseDir, entry.name)).mtimeMs]),
  );

/** The .ext file this build produced (Linux names the arch x86_64 / amd64, so compare with the snapshot). */
function builtFile(ext, before) {
  const fresh = [...snapshot()]
    .filter(
      ([name, mtime]) => name.endsWith(`.${ext}`) && !name.includes('__uninstaller') && before.get(name) !== mtime,
    )
    .map(([name]) => path.join(releaseDir, name));
  if (fresh.length !== 1) throw new Error(`Expected one new .${ext} in ${releaseDir}, found ${fresh.length}`);
  return fresh[0];
}

fs.mkdirSync(uploadDir, { recursive: true });
const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
try {
  for (const [arch, { prebuild, files }] of Object.entries(target.archs)) {
    fetchWebRtc(target.platform, prebuild);
    console.log(`\n> electron-builder --${os} --${arch}`);
    const before = snapshot();
    run(nodeBin, [builder, `--${os}`, `--${arch}`, '--publish', 'never']);
    for (const [ext, publicName] of Object.entries(files)) {
      fs.copyFileSync(builtFile(ext, before), path.join(uploadDir, publicName));
      console.log(`  ${publicName}`);
    }
  }
} finally {
  // Leave the working copy runnable on this machine.
  const hostArch = { ia32: 'x86' }[process.arch] || process.arch;
  if (HOST) fetchWebRtc(process.platform, hostArch);
}
