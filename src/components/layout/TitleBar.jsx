import { ArrowDownToLine } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { PeerlyMark } from './PeerlyMark';

/**
 * Custom title bar of the frameless window. The whole strip drags the window;
 * Windows draws its native minimize/maximize/close buttons over the right edge.
 * Next to them sits the "Update" button while a newer version is available.
 */
export function TitleBar({ title, update, onInstallUpdate }) {
  const { t } = useI18n();
  const status = update?.status;
  const busy = status === 'downloading' || status === 'installing';
  const percent = Math.round((update?.progress || 0) * 100);
  const label =
    status === 'downloading'
      ? t('updates.titlebar.downloading', { percent })
      : status === 'installing'
        ? t('updates.titlebar.installing')
        : t('updates.install');

  return (
    <header className="titlebar">
      <span className="titlebar-mark">
        <PeerlyMark size={14} />
      </span>
      <span className="titlebar-name">Peerly</span>
      {title && <span className="titlebar-title">{title}</span>}
      {update?.available && status !== 'checking' && (
        <button
          className="titlebar-update"
          type="button"
          onClick={onInstallUpdate}
          disabled={busy}
          title={t('updates.titlebar.hint', { version: update.latest })}
          style={{ '--progress': `${status === 'downloading' ? percent : 0}%` }}
        >
          <ArrowDownToLine size={14} />
          {label}
        </button>
      )}
    </header>
  );
}
