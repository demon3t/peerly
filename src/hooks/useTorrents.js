import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** Only uploaded with nothing downloaded (pure seeding) is an infinite ratio. */
function withRatio({ uploaded = 0, received = 0, wasted = 0 }) {
  return { uploaded, received, wasted, ratio: received > 0 ? uploaded / received : uploaded > 0 ? Infinity : 0 };
}

/**
 * Live torrent list and network status pushed by the backend.
 * `onOpenRequest` fires when Windows hands us a .torrent file or magnet link.
 */
export function useTorrents({ onOpenRequest } = {}) {
  const [state, setState] = useState({
    torrents: [],
    network: { online: false, port: 0 },
    lifetime: { uploaded: 0, received: 0, ratio: 0 },
    loaded: false,
  });

  useEffect(() => {
    const apply = ({ torrents, network, lifetime }) =>
      setState((current) => ({
        torrents,
        network,
        lifetime: lifetime ? withRatio(lifetime) : current.lifetime,
        loaded: true,
      }));
    api.list().then(apply);
    const offUpdate = api.onUpdate(apply);
    const offOpen = api.onOpenRequest((source) => onOpenRequest?.(source));
    api.ready();
    return () => {
      offUpdate();
      offOpen();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- subscribe once

  return state;
}
