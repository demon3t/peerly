// Demo data for previewing the UI in a plain browser (no Electron bridge).
const now = Date.now();

const base = {
  savePath: 'C:\Users\you\Downloads\Peerly',
  error: '',
  eta: null,
  canExport: true,
  completedAt: null,
};

export const SAMPLE_TORRENTS = [
  {
    ...base,
    id: 'sample-ubuntu',
    received: 6114656256,
    name: 'ubuntu-24.04.1-desktop-amd64.iso',
    infoHash: '5a8062c076fa85e8056451c0d9aa04349ae27909',
    sourceType: 'torrent',
    status: 'seeding',
    progress: 1,
    downloaded: 6_114_656_256,
    uploaded: 4_120_000_000,
    length: 6_114_656_256,
    downloadSpeed: 0,
    uploadSpeed: 2_400_000,
    peers: 8,
    ratio: 0.67,
    addedAt: now - 2_400_000,
    completedAt: now - 1_200_000,
    fileCount: 1,
  },
  {
    ...base,
    id: 'sample-blender',
    received: 3800000000,
    name: 'Blender Open Movies Collection',
    infoHash: 'c9e15763f722f23e98a29decdfae341b98d53056',
    sourceType: 'magnet',
    status: 'downloading',
    progress: 0.72,
    downloaded: 3_800_000_000,
    uploaded: 1_110_000_000,
    length: 5_270_000_000,
    downloadSpeed: 6_800_000,
    uploadSpeed: 520_000,
    peers: 14,
    ratio: 0.29,
    eta: 216,
    addedAt: now - 5_100_000,
    fileCount: 4,
  },
  {
    ...base,
    id: 'sample-wiki',
    received: 4000000000,
    name: 'Wikipedia Offline Dump 2026-09',
    infoHash: '08ada5a7a6183aae1e09d831df6748d566095a10',
    sourceType: 'torrent',
    status: 'paused',
    progress: 0.38,
    downloaded: 4_000_000_000,
    uploaded: 480_000_000,
    length: 10_520_000_000,
    downloadSpeed: 0,
    uploadSpeed: 0,
    peers: 0,
    ratio: 0.12,
    addedAt: now - 8_000_000,
    fileCount: 1,
  },
  {
    ...base,
    id: 'sample-photos',
    received: 0,
    name: 'Семейные фото 2026',
    infoHash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
    sourceType: 'seed',
    status: 'seeding',
    progress: 1,
    downloaded: 780_000_000,
    uploaded: 1_030_000_000,
    length: 780_000_000,
    downloadSpeed: 0,
    uploadSpeed: 1_700_000,
    peers: 5,
    ratio: 1.32,
    addedAt: now - 11_000_000,
    completedAt: now - 11_000_000,
    fileCount: 214,
  },
];

export function sampleDetails(item) {
  const count = Math.min(item.fileCount || 1, 6);
  const files = Array.from({ length: count }, (_, index) => ({
    index,
    name: count > 1 ? `part-${index + 1}.mkv` : item.name,
    path: count > 1 ? `${item.name}/part-${index + 1}.mkv` : item.name,
    length: item.length / count,
    progress: Math.min(1, item.progress * (1 + index * 0.1)),
    priority: item.filePriorities?.[index] ?? 1,
  }));

  return {
    ...item,
    totalLength: item.totalLength || item.length,
    wasted: Math.round((item.received || 0) * 0.02),
    seedingSeconds: item.seedingSeconds || (item.status === 'seeding' ? 5400 : 0),
    files,
    peerList: item.peers
      ? Array.from({ length: Math.min(item.peers, 6) }, (_, index) => ({
          address: `192.0.2.${20 + index}:${51000 + index * 7}`,
          type: 'tcpOutgoing',
          client: ['qBittorrent 4.6.3', 'Transmission 4.0', 'µTorrent 3.6', 'Deluge 2.1'][index % 4],
          progress: index % 3 === 0 ? 1 : 0.4 + index * 0.08,
          downloadSpeed: item.downloadSpeed / (index + 2),
          uploadSpeed: item.uploadSpeed / (index + 2),
        }))
      : [],
    trackers: ['udp://tracker.opentrackr.org:1337/announce', 'udp://open.stealth.si:80/announce'],
    sources: { dht: true, pex: true, lsd: true },
  };
}
