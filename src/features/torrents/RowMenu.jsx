import { useState } from 'react';
import { Copy, FolderInput, FolderOpen, Info, MoreHorizontal, Network, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { useEscape, useOutsideClick } from '../../hooks/useKeyboard';
import { useI18n } from '../../i18n/I18nProvider';

/** "⋯" menu of a torrent; `inPanel` hides entries the details panel already shows. */
export function RowMenu({ item, actions, inPanel = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useOutsideClick(close, open);
  useEscape(close, open);

  const pick = (action) => (event) => {
    event.stopPropagation();
    close();
    action(item);
  };

  return (
    <div className="row-menu" ref={ref}>
      <button
        aria-expanded={open}
        aria-label={t('table.actions')}
        className="row-icon"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        title={t('table.actions')}
        type="button"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="popover menu-popover" role="menu">
          {!inPanel && (
            <button type="button" onClick={pick(actions.showDetails)}>
              <Info size={15} /> {t('menu.details')}
            </button>
          )}
          {!inPanel && (
            <button type="button" onClick={pick(actions.openFolder)}>
              <FolderOpen size={15} /> {t('menu.openFolder')}
            </button>
          )}
          <button type="button" onClick={pick(actions.copyMagnet)}>
            <Copy size={15} /> {t('menu.copyMagnet')}
          </button>
          <button type="button" onClick={pick(actions.exportFile)} disabled={!item.canExport}>
            <Share2 size={15} /> {t('menu.saveTorrent')}
          </button>
          <div className="menu-separator" />
          <button type="button" onClick={pick(actions.recheck)}>
            <RefreshCw size={15} /> {t('menu.recheck')}
          </button>
          <button type="button" onClick={pick(actions.move)}>
            <FolderInput size={15} /> {t('menu.move')}
          </button>
          <button type="button" onClick={pick(actions.requestAddTrackers)}>
            <Network size={15} /> {t('menu.addTrackers')}
          </button>
          <div className="menu-separator" />
          <button className="danger" type="button" onClick={pick(actions.requestRemove)}>
            <Trash2 size={15} /> {t('menu.remove')}
          </button>
        </div>
      )}
    </div>
  );
}
