const fs = require('fs');
const { UserError } = require('../lib/errors');

let parseTorrent = null;

async function loadParser() {
  if (!parseTorrent) parseTorrent = (await import('parse-torrent')).default;
  return parseTorrent;
}

/**
 * Resolves user input (magnet link, info hash or path to a .torrent file)
 * into the value WebTorrent accepts plus its parsed metadata.
 */
async function resolveSource(source) {
  const parse = await loadParser();
  source = String(source || '').trim();
  if (!source) throw new UserError('errors.sourceMissing');

  if (/^magnet:/i.test(source) || /^[a-f0-9]{40}$/i.test(source)) {
    try {
      const parsed = await parse(source);
      if (!parsed?.infoHash) throw new Error();
      return { input: source, parsed, kind: 'magnet' };
    } catch {
      throw new UserError('errors.invalidMagnet');
    }
  }

  if (!fs.existsSync(source)) throw new UserError('errors.torrentFileNotFound');
  const buffer = await fs.promises.readFile(source);
  try {
    const parsed = await parse(buffer);
    if (!parsed?.infoHash) throw new Error();
    return { input: buffer, parsed, kind: 'torrent' };
  } catch {
    throw new UserError('errors.invalidTorrentFile');
  }
}

/** Metadata preview shown before the user starts a download. */
async function inspectSource(source) {
  const { parsed } = await resolveSource(source);
  return {
    name: parsed.name || parsed.dn || '',
    infoHash: parsed.infoHash,
    length: parsed.length || 0,
    fileCount: parsed.files?.length || 0,
    files: (parsed.files || []).map((file, index) => ({
      index,
      path: file.path,
      name: file.name,
      length: file.length,
    })),
  };
}

module.exports = { resolveSource, inspectSource };
