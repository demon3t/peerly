import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/** Persistent app settings plus the theme side effect. */
export function useSettings({ onError } = {}) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(() => api.settings().then(setSettings), []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.darkMode ? 'dark' : 'light';
  }, [settings?.darkMode]);

  const update = useCallback(
    async (patch) => {
      setSettings((current) => ({ ...current, ...patch })); // optimistic
      try {
        setSettings(await api.updateSettings(patch));
      } catch (error) {
        onError?.(error);
        reload();
      }
    },
    [onError, reload],
  );

  return { settings, update, reload };
}
