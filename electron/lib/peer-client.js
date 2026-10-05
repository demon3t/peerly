// Turns a BitTorrent peer id into a readable client name, e.g.
// "-qB4630-…" → "qBittorrent 4.6.3" (Azureus-style ids, used by most clients).

const CLIENTS = {
  AZ: 'Vuze',
  BC: 'BitComet',
  BI: 'BiglyBT',
  BT: 'BitTorrent',
  DE: 'Deluge',
  FD: 'Free Download Manager',
  FX: 'Flud',
  KT: 'KTorrent',
  LT: 'libtorrent',
  lt: 'libTorrent',
  PI: 'PicoTorrent',
  qB: 'qBittorrent',
  TR: 'Transmission',
  TX: 'Tixati',
  UT: 'µTorrent',
  UM: 'µTorrent Mac',
  UW: 'µTorrent Web',
  WD: 'WebTorrent Desktop',
  WW: 'WebTorrent',
  XL: 'Xunlei',
};

function describePeer(peerIdHex) {
  if (!peerIdHex) return '';
  let id;
  try {
    id = Buffer.from(peerIdHex, 'hex').toString('latin1');
  } catch {
    return '';
  }
  const match = /^-([A-Za-z]{2})([0-9A-Za-z]{4})-/.exec(id);
  if (!match) return '';
  const [, code, rawVersion] = match;
  const name = CLIENTS[code] || code;
  const version = rawVersion
    .replace(/[^0-9]/g, '')
    .split('')
    .slice(0, 3)
    .join('.');
  return version ? `${name} ${version}` : name;
}

module.exports = { describePeer };
