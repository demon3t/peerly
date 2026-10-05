import { Download, Magnet, Upload } from 'lucide-react';
import { statusInfo } from '../lib/torrentStatus';

const ICONS = { seed: Upload, magnet: Magnet, torrent: Download };

/** Rounded badge showing how the torrent was added, tinted by its status. */
export function TorrentIcon({ item, size = 18 }) {
  const Icon = ICONS[item.sourceType] || Download;
  return (
    <div className={`torrent-type ${statusInfo(item.status).tone}`}>
      <Icon size={size} strokeWidth={2.1} />
    </div>
  );
}
