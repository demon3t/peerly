import { useEffect, useState } from 'react';
import { api } from '../api/client';

const REFRESH_MS = 1000;

/** Speed samples [{ t, down, up }] for the whole client, or one torrent when `id` is set. */
export function useSpeedHistory(id) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .history(id)
        .then((next) => {
          if (!cancelled) setPoints(next || []);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  return points;
}
