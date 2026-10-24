// Changelog tooling for CI (format: shared/changelog.mjs).
//   node scripts/changelog.mjs check          every changelog parses; en.md has a section for package.json's version
//   node scripts/changelog.mjs notes <ver>    prints the en.md section of <ver> for the GitHub release notes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection, parseChangelog } from '../shared/changelog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'changelog');
const read = (code) => fs.readFileSync(path.join(dir, `${code}.md`), 'utf8');
// CI builds are <package version>-build.<run>; the changelog is written per package version.
const baseVersion = (version) => version.replace(/-build\.\d+$/, '');

const [command, version] = process.argv.slice(2);

if (command === 'notes') {
  process.stdout.write(changelogSection(read('en'), baseVersion(version || '')));
} else if (command === 'check') {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const wanted = baseVersion(pkg.version);
  let failed = false;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const code = file.replace(/\.md$/, '');
    const releases = parseChangelog(read(code));
    const current = releases.find((entry) => entry.version === wanted);
    const count = current ? Object.values(current.changes).flat().length : 0;
    if (code === 'en' && !count) {
      console.error(`${file}: no changes listed for ${wanted} (package.json version)`);
      failed = true;
    } else if (!count) {
      console.warn(`${file}: no section for ${wanted} yet — the update window falls back to English`);
    } else {
      console.log(`${file}: ${releases.length} version(s), ${count} change(s) in ${wanted}`);
    }
  }
  if (failed) process.exit(1);
} else {
  console.error('Usage: node scripts/changelog.mjs check | notes <version>');
  process.exit(1);
}
