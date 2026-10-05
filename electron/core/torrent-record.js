const crypto = require('crypto');
const { describePeer } = require('../lib/peer-client');

/** File priorities, as in qBittorrent. */
const PRIORITY = { skip: 0, normal: 1, high: 2 };

/**
 * A torrent known to the client. Survives pause/restart: `torrent` is the live
 * WebTorrent instance (null while paused, queued or failed), `cache` holds the
 * last known progress so stopped items still render correctly.
 */
function createRecord(fields) {
  return {
    id: crypto.randomUUID(),
    infoHash: '',
    name: '',
    magnetURI: '',
    torrentFile: '',
    savePath: '',
    finalPath: '', // where a download moves when finished ("incomplete folder" mode)
    sourceType: 'torrent', // 'torrent' | 'magnet' | 'seed'
    isPrivate: false, // private-tracker torrent: no DHT/PEX/extra trackers
    paused: false,
    queued: false, // waiting for a free download slot (runtime only)
    scheduled: false, // held back by the weekly schedule (runtime only)
    busy: false, // a recheck/move is in progress: the scheduler must not touch it (runtime only)
    limitReached: false, // stopped by a seeding limit
    filePriorities: null, // null = every file normal; otherwise PRIORITY value per file index
    extraTrackers: [],
    addedAt: Date.now(),
    completedAt: null,
    seedingSeconds: 0,
    baseUploaded: 0, // traffic from previous sessions; live counters reset on every restart
    baseReceived: 0, // useful data downloaded in previous sessions
    baseWasted: 0, // duplicate blocks and pieces that failed the hash check
    sessionStart: null, // verified bytes on disk when the current session became ready
    cache: null,
    error: '',
    torrent: null,
    ...fields,
  };
}

function totalUploaded(record) {
  return record.baseUploaded + Number(record.torrent?.uploaded || 0);
}

/**
 * New data this session = growth of the data on disk since the session became
 * ready. Unlike torrent.received it excludes duplicate blocks (endgame) and
 * pieces that failed verification, so it never exceeds the torrent size.
 */
function sessionUseful(record) {
  const torrent = record.torrent;
  if (!torrent?.ready || record.sessionStart == null) return 0;
  return Math.max(0, Number(torrent.downloaded || 0) - record.sessionStart);
}

/**
 * Useful bytes downloaded from peers (not data that was already on disk).
 * Own seeds never download content.
 */
function totalReceived(record) {
  if (record.sourceType === 'seed') return 0;
  return record.baseReceived + sessionUseful(record);
}

/** Traffic that brought nothing new: duplicates and corrupt pieces ("Wasted" in qBittorrent). */
function totalWasted(record) {
  if (record.sourceType === 'seed') return 0;
  const raw = Number(record.torrent?.received || 0);
  return record.baseWasted + Math.max(0, raw - sessionUseful(record));
}

/**
 * Share ratio = uploaded / downloaded. For own seeds and data verified from
 * disk nothing was received, so the content size is the denominator (as qBittorrent does).
 */
function shareRatio(record, length) {
  const uploaded = totalUploaded(record);
  const base = totalReceived(record) || length;
  return base > 0 ? uploaded / base : 0;
}

/** Snapshot traffic counters before the live torrent instance goes away. */
function freezeTraffic(record) {
  record.baseUploaded = totalUploaded(record);
  record.baseReceived = totalReceived(record);
  record.baseWasted = totalWasted(record);
  record.sessionStart = null;
}

const priorityOf = (record, index) => record.filePriorities?.[index] ?? PRIORITY.normal;

/**
 * Bytes of a file present on disk, from the piece bitfield. WebTorrent's own
 * file.downloaded drops a whole piece when a file ends exactly on a piece
 * boundary, so a finished file would show 98%.
 */
function fileDownloaded(torrent, file) {
  if (file.done || !file.length) return file.length;
  const pieceLength = torrent.pieceLength;
  const lastIndex = torrent.pieces.length - 1;
  const fileEnd = file.offset + file.length;
  let total = 0;
  for (let i = file._startPiece; i <= file._endPiece; i += 1) {
    const length = i === lastIndex ? torrent.lastPieceLength : pieceLength;
    const piece = torrent.pieces[i];
    const have = torrent.bitfield.get(i) ? length : piece ? length - piece.missing : 0;
    const start = i * pieceLength;
    const overlap = Math.min(start + length, fileEnd) - Math.max(start, file.offset);
    total += Math.max(0, Math.min(have, overlap));
  }
  return Math.min(file.length, total);
}

function fileList(record, torrent) {
  return (torrent.files || []).map((file, index) => {
    const downloaded = fileDownloaded(torrent, file);
    return {
      index,
      name: file.name,
      path: file.path,
      length: file.length,
      downloaded,
      progress: file.length ? downloaded / file.length : 1,
      priority: priorityOf(record, index),
    };
  });
}

/** Progress over the files the user actually wants (skipped files don't count). */
function progressCache(record) {
  const torrent = record.torrent;
  if (torrent?.ready) return summarizeFiles(fileList(record, torrent), torrent.length);
  const cache = record.cache;
  if (!cache?.files?.length) return cache;
  // Stopped torrent: re-apply current priorities to the last known file progress.
  const files = cache.files.map((file, index) => ({
    ...file,
    downloaded: file.downloaded ?? Math.round((file.progress || 0) * file.length),
    priority: priorityOf(record, index),
  }));
  return summarizeFiles(files, cache.totalLength || files.reduce((sum, file) => sum + file.length, 0));
}

function summarizeFiles(files, totalLength) {
  const wanted = files.filter((file) => file.priority !== PRIORITY.skip);
  const length = wanted.reduce((sum, file) => sum + file.length, 0);
  const downloaded = wanted.reduce((sum, file) => sum + file.downloaded, 0);
  return {
    totalLength,
    length,
    downloaded,
    progress: length ? downloaded / length : 1,
    files,
  };
}

function isComplete(record) {
  const cache = progressCache(record);
  return Boolean(cache && cache.length > 0 && cache.progress >= 1);
}

function statusOf(record) {
  const torrent = record.torrent;
  if (record.error) return 'error';
  if (record.paused) return isComplete(record) ? 'completed' : 'paused';
  if (record.scheduled) return 'scheduled';
  if (record.queued) return 'queued';
  if (!torrent) return 'queued';
  if (!torrent.ready) return torrent.metadata ? 'checking' : 'metadata';
  return isComplete(record) ? 'seeding' : 'downloading';
}

/** Lightweight view sent to the UI every second. */
function toSummary(record, { canExport }) {
  const torrent = record.torrent;
  const live = Boolean(torrent && torrent.ready);
  const cache = progressCache(record) || {};
  const length = Number(cache.length || 0);
  const downloaded = Number(cache.downloaded || 0);
  const downloadSpeed = live ? torrent.downloadSpeed : 0;
  const remaining = Math.max(0, length - downloaded);

  return {
    id: record.id,
    name: torrent?.name || record.name || '', // empty until metadata arrives; the UI shows a placeholder
    infoHash: torrent?.infoHash || record.infoHash || '',
    magnetURI: torrent?.magnetURI || record.magnetURI || '',
    sourceType: record.sourceType,
    isPrivate: Boolean(record.isPrivate),
    status: statusOf(record),
    progress: Math.max(0, Math.min(1, Number(cache.progress || 0))),
    downloaded,
    uploaded: totalUploaded(record),
    received: totalReceived(record),
    wasted: totalWasted(record),
    length,
    totalLength: Number(cache.totalLength || length),
    downloadSpeed,
    uploadSpeed: live ? torrent.uploadSpeed : 0,
    peers: live ? torrent.numPeers : 0,
    ratio: shareRatio(record, length),
    eta: live && downloadSpeed > 0 && remaining > 0 ? remaining / downloadSpeed : null,
    seedingSeconds: Math.round(record.seedingSeconds),
    savePath: record.savePath,
    error: record.error || '',
    addedAt: record.addedAt,
    completedAt: record.completedAt || null,
    fileCount: cache.files?.length || 0,
    canExport,
  };
}

function peerProgress(wire, pieceCount) {
  if (!wire.peerPieces || !pieceCount) return 0;
  let have = 0;
  for (let i = 0; i < pieceCount; i++) if (wire.peerPieces.get(i)) have += 1;
  return have / pieceCount;
}

/** Full view for the details panel (files, peers, trackers). */
function toDetails(record, options, network) {
  const torrent = record.torrent;
  const live = Boolean(torrent && torrent.ready);
  const pieceCount = live ? torrent.pieces.length : 0;
  return {
    ...toSummary(record, options),
    files: live ? fileList(record, torrent) : record.cache?.files || [],
    peerList: live
      ? torrent.wires.slice(0, 80).map((wire) => ({
          address: wire.remoteAddress ? `${wire.remoteAddress}:${wire.remotePort}` : 'webrtc',
          type: wire.type || 'tcp',
          client: wire.type === 'webSeed' ? 'Web seed' : describePeer(wire.peerId),
          progress: wire.type === 'webSeed' ? 1 : peerProgress(wire, pieceCount),
          downloadSpeed: wire.downloadSpeed(),
          uploadSpeed: wire.uploadSpeed(),
        }))
      : [],
    trackers: torrent?.announce?.length ? [...torrent.announce] : record.extraTrackers,
    sources: {
      dht: Boolean(network.dht && !record.isPrivate),
      pex: Boolean(network.pex && !record.isPrivate),
      lsd: Boolean(network.lsd && !record.isPrivate),
    },
  };
}

/** Shape written to torrents.json. */
function toPersisted(record) {
  return {
    id: record.id,
    infoHash: record.infoHash,
    name: record.name,
    magnetURI: record.magnetURI,
    torrentFile: record.torrentFile,
    savePath: record.savePath,
    finalPath: record.finalPath,
    sourceType: record.sourceType,
    isPrivate: record.isPrivate,
    paused: record.paused,
    limitReached: record.limitReached,
    filePriorities: record.filePriorities,
    extraTrackers: record.extraTrackers,
    addedAt: record.addedAt,
    completedAt: record.completedAt,
    seedingSeconds: Math.round(record.seedingSeconds),
    uploaded: totalUploaded(record),
    received: totalReceived(record),
    wasted: totalWasted(record),
    cache: progressCache(record),
  };
}

function fromPersisted(saved) {
  // Older versions counted every received byte; whatever exceeds the torrent
  // size there was waste, so split it out.
  let received = Number(saved.received || 0);
  let wasted = Number(saved.wasted || 0);
  const size = Number(saved.cache?.totalLength || saved.cache?.length || 0);
  if (saved.wasted === undefined && size && received > size) {
    wasted = received - size;
    received = size;
  }
  return createRecord({
    ...saved,
    id: saved.id || crypto.randomUUID(),
    extraTrackers: Array.isArray(saved.extraTrackers) ? saved.extraTrackers : [],
    seedingSeconds: Number(saved.seedingSeconds || 0),
    baseUploaded: Number(saved.uploaded || 0),
    baseReceived: received,
    baseWasted: wasted,
    cache: saved.cache || null,
    queued: false,
    scheduled: false,
    busy: false,
    torrent: null,
    error: '',
  });
}

module.exports = {
  PRIORITY,
  createRecord,
  totalUploaded,
  totalReceived,
  totalWasted,
  shareRatio,
  freezeTraffic,
  progressCache,
  isComplete,
  toSummary,
  toDetails,
  toPersisted,
  fromPersisted,
};
