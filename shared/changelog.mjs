// Parser for changelog/<language>.md, shared by the updater (main process) and the CI scripts.
//
// Format (the "### New / Improved / Fixed" headings stay in English in every language):
//
//   ## 0.2.0 — 2026-10-24
//   ### New
//   - Something the user can now do
//   ### Improved
//   ### Fixed
//
// A section belongs to a package.json version; every CI build of that version (0.2.0-build.N) ships it.

export const CHANGE_TYPES = ['new', 'improved', 'fixed'];

const VERSION_LINE = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const TYPE_LINE = /^###\s+(.+?)\s*$/;
const ITEM_LINE = /^[-*]\s+(.+?)\s*$/;

/** Markdown → [{ version, date, changes: { new: [], improved: [], fixed: [] } }], newest first as written. */
export function parseChangelog(text) {
  const releases = [];
  let release = null;
  let type = null;
  for (const line of String(text).split(/\r?\n/)) {
    const version = VERSION_LINE.exec(line);
    if (version) {
      release = { version: version[1], date: version[2] || '', changes: { new: [], improved: [], fixed: [] } };
      releases.push(release);
      type = null;
      continue;
    }
    const heading = TYPE_LINE.exec(line);
    if (heading) {
      const key = heading[1].toLowerCase();
      type = CHANGE_TYPES.includes(key) ? key : null;
      continue;
    }
    const item = ITEM_LINE.exec(line);
    if (item && release && type) release.changes[type].push(item[1]);
    else if (release && type && line.startsWith('  ') && line.trim()) {
      // A wrapped bullet continues the previous item.
      const list = release.changes[type];
      if (list.length) list[list.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}

/** The section of one version back as Markdown (used for the GitHub release notes). */
export function changelogSection(text, version) {
  const release = parseChangelog(text).find((entry) => entry.version === version);
  if (!release) return '';
  const titles = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
  return CHANGE_TYPES.filter((key) => release.changes[key].length)
    .map((key) => [`### ${titles[key]}`, ...release.changes[key].map((item) => `- ${item}`)].join('\n'))
    .join('\n\n');
}
