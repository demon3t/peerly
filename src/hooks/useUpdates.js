import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/** Result of the latest update check: { status: 'idle' | 'checking' | 'current' | 'available' | 'error', current, latest }. */
export function useUpdates() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .updateStatus()
      .then((state) => alive && setUpdate(state))
      .catch(() => {});
    const unsubscribe = api.onUpdateStatus(setUpdate);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const check = useCallback(() => api.checkUpdate().then(setUpdate), []);

  return { update, check };
}
