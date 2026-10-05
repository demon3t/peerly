import { useEffect, useState } from 'react';
import { api } from '../api/client';

const REFRESH_MS = 15_000;

/** Free/total space of the drive holding the download folder. */
export function useDiskUsage(downloadPath) {
  const [disk, setDisk] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.disk().then((value) => {
        if (!cancelled) setDisk(value);
      });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [downloadPath]);

  return disk;
}
