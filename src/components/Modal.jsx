import { X } from 'lucide-react';
import { useEscape } from '../hooks/useKeyboard';
import { useI18n } from '../i18n/I18nProvider';

/** Shared modal shell: backdrop, header, Escape / backdrop click to close. */
export function Modal({ eyebrow, danger = false, title, small = false, locked = false, onClose, children }) {
  const { t } = useI18n();
  useEscape(onClose, !locked);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !locked && onClose()}
    >
      <section
        className={small ? 'modal modal-small' : 'modal'}
        role={danger ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            {eyebrow && <p className={danger ? 'eyebrow danger-text' : 'eyebrow'}>{eyebrow}</p>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={locked}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
