import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Sparkles, TrendingUp, Wrench } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useI18n } from '../../i18n/I18nProvider';

const TYPES = [
  { key: 'new', Icon: Sparkles },
  { key: 'improved', Icon: TrendingUp },
  { key: 'fixed', Icon: Wrench },
];

/**
 * "What's new" before updating: the changes of every version between the running and the latest one,
 * grouped by type, and the button that downloads and installs the update.
 */
export function UpdateModal({ update, onClose }) {
  const { t, errorText, language } = useI18n();
  const [releases, setReleases] = useState(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const status = update?.status;
  const busy = status === 'downloading' || status === 'installing';

  useEffect(() => {
    let alive = true;
    api
      .updateChanges(language)
      .then((list) => alive && setReleases(list))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [language, update?.latest]);

  // Several skipped versions read as one list: newest changes first within each type.
  const groups = TYPES.map((type) => ({
    ...type,
    items: (releases || []).flatMap((release) => release.changes[type.key]),
  }));
  const hasChanges = groups.some((group) => group.items.length);

  async function install() {
    setError('');
    try {
      await api.installUpdate();
      // The .dmg / .deb is opened for the user; an in-place update restarts Peerly instead.
      if (!update.installsInPlace) onClose();
    } catch (installError) {
      setError(errorText(installError));
    }
  }

  let label = t(update?.installsInPlace ? 'updates.modal.installRestart' : 'updates.modal.install');
  if (status === 'downloading') {
    label = t('updates.titlebar.downloading', { percent: Math.round((update.progress || 0) * 100) });
  } else if (status === 'installing') label = t('updates.titlebar.installing');

  return (
    <Modal
      eyebrow={t('updates.modal.eyebrow')}
      title={t('updates.modal.title', { version: update?.latest })}
      locked={status === 'installing'}
      onClose={onClose}
    >
      <p className="update-versions mono">
        {update?.current} <ArrowRight size={13} /> <strong>{update?.latest}</strong>
      </p>

      <div className="update-changes">
        {!releases && !failed && <p className="modal-hint">{t('common.loading')}</p>}
        {failed && <p className="modal-hint">{t('updates.modal.loadFailed')}</p>}
        {releases && !hasChanges && <p className="modal-hint">{t('updates.modal.empty')}</p>}
        {groups
          .filter((group) => group.items.length)
          .map(({ key, Icon, items }) => (
            <section key={key} className={`update-group update-group-${key}`}>
              <h3>
                <Icon size={14} /> {t(`updates.modal.types.${key}`)}
              </h3>
              <ul>
                {items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      {error && <p className="modal-hint warning">{error}</p>}

      <div className="modal-footer">
        <button className="button button-quiet" type="button" onClick={onClose} disabled={status === 'installing'}>
          {t('updates.modal.later')}
        </button>
        <button className="button button-primary" type="button" autoFocus onClick={install} disabled={busy}>
          <ArrowDownToLine size={16} /> {label}
        </button>
      </div>
    </Modal>
  );
}
