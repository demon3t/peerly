import { ArrowDownToLine, MessageSquare } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { PeerlyMark } from './PeerlyMark';

/**
 * Custom title bar of the frameless window. The whole strip drags the window;
 * Windows draws its native minimize/maximize/close buttons over the right edge.
 * Next to them, from the right: "Feedback", always there, and "Update" while a newer version
 * is available, so Update coming and going never moves Feedback. Both show just an icon and
 * widen to show their label on hover (Update stays wide while it downloads or installs).
 */
export function TitleBar({ title, update, onOpenUpdate, onFeedback }) {
  const { t } = useI18n();
  const status = update?.status;
  const percent = Math.round((update?.progress || 0) * 100);
  const busy = status === 'downloading' || status === 'installing';
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
      <div className="titlebar-actions">
        {update?.available && status !== 'checking' && (
          <button
            className={`titlebar-action titlebar-update${busy ? ' expanded' : ''}`}
            type="button"
            onClick={onOpenUpdate}
            disabled={status === 'installing'}
            title={t('updates.titlebar.hint', { version: update.latest })}
            style={{ '--progress': `${status === 'downloading' ? percent : 100}%` }}
          >
            <ArrowDownToLine size={14} />
            <span className="titlebar-action-label">{label}</span>
          </button>
        )}
        <button
          className="titlebar-action titlebar-feedback"
          type="button"
          onClick={onFeedback}
          title={t('feedback.hint')}
        >
          <MessageSquare size={14} />
          <span className="titlebar-action-label">{t('feedback.button')}</span>
        </button>
      </div>
    </header>
  );
}
