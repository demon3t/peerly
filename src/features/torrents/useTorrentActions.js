import { useMemo } from 'react';
import { api } from '../../api/client';

/**
 * User-facing torrent commands with consistent success/error feedback.
 * UI-only actions (open details, ask to remove) are delegated to callbacks.
 */
export function useTorrentActions({ t, notify, notifyError, onShowDetails, onRequestRemove, onRequestAddTrackers }) {
  return useMemo(() => {
    const run = async (action, successKey) => {
      try {
        const result = await action();
        if (successKey) notify(t(successKey));
        return result;
      } catch (error) {
        notifyError(error);
        return undefined;
      }
    };

    return {
      toggle: (item) => run(() => api.toggle(item.id)),
      remove: (item, deleteFiles) =>
        run(() => api.remove(item.id, deleteFiles), deleteFiles ? 'toast.removedWithFiles' : 'toast.removedKeptFiles'),
      exportFile: (item) => run(() => api.export(item.id)),
      copyMagnet: (item) => run(() => api.copyMagnet(item.id), 'toast.magnetCopied'),
      openFolder: (item) => run(() => api.openFolder(item.id)),
      openFile: (item, file) => run(() => api.openFile(item.id, file.path)),
      recheck: (item) => run(() => api.recheck(item.id), 'toast.recheckStarted'),
      move: (item) =>
        run(async () => {
          if (await api.move(item.id)) notify(t('toast.moved'));
        }),
      setFilePriorities: (item, priorities) => run(() => api.setFilePriorities(item.id, priorities)),
      addTrackers: (item, urls) => run(() => api.addTrackers(item.id, urls), 'toast.trackersAdded'),
      requestAddTrackers: (item) => onRequestAddTrackers(item),
      showDetails: (item) => onShowDetails(item.id),
      requestRemove: (item) => onRequestRemove(item),
    };
  }, [t, notify, notifyError, onShowDetails, onRequestRemove, onRequestAddTrackers]);
}
