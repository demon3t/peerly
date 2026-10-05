import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  Radio,
  Upload,
} from 'lucide-react';
import { api } from '../../api/client';
import { Checkbox } from '../../components/Checkbox';
import { Modal } from '../../components/Modal';
import { Tabs } from '../../components/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { baseName, formatBytes } from '../../lib/format';

const MODES = [
  { value: 'torrent', labelKey: 'add.modeTorrent', icon: FileText },
  { value: 'magnet', labelKey: 'add.modeMagnet', icon: Link2 },
  { value: 'seed', labelKey: 'add.modeSeed', icon: Upload },
];

const PRIORITY_SKIP = 0;
const PRIORITY_NORMAL = 1;

const parseMagnets = (text) => text.split(/\s+/).filter((line) => /^magnet:\?/i.test(line));

/** Name, size and file list of a single torrent before the user commits. */
function useTorrentPreview(source, enabled) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setPreview(null);
    if (!enabled || !source) return undefined;
    let cancelled = false;
    api
      .inspect(source)
      .then((info) => {
        if (!cancelled) setPreview(info);
      })
      .catch(() => {
        if (!cancelled) setPreview({ invalid: true });
      });
    return () => {
      cancelled = true;
    };
  }, [source, enabled]);

  return preview;
}

export function AddTorrentModal({
  initialMode = 'torrent',
  initialSources = [],
  defaultPath,
  defaultPaused = false,
  onClose,
  onDone,
  onError,
}) {
  const { t, errorText } = useI18n();
  const [mode, setMode] = useState(initialMode);
  const [files, setFiles] = useState(initialMode === 'magnet' ? [] : initialSources);
  const [magnetText, setMagnetText] = useState(initialMode === 'magnet' ? initialSources.join('\n') : '');
  const [savePath, setSavePath] = useState('');
  const [startPaused, setStartPaused] = useState(defaultPaused);
  const [skipped, setSkipped] = useState(() => new Set()); // file indexes not to download
  const [seedOptions, setSeedOptions] = useState({ isPrivate: false, trackers: '', comment: '' });
  const [busy, setBusy] = useState(false);

  const isSeed = mode === 'seed';
  const isMagnet = mode === 'magnet';
  const sources = isMagnet ? parseMagnets(magnetText) : files;
  const preview = useTorrentPreview(sources.length === 1 ? sources[0] : '', !isSeed);
  const torrentFiles = preview?.files?.length > 1 ? preview.files : null;

  useEffect(() => setSkipped(new Set()), [preview]);

  const pick = (request) => async () => {
    try {
      const result = await request();
      if (Array.isArray(result) ? result.length : result) setFiles([].concat(result));
    } catch (error) {
      onError(error);
    }
  };

  function switchMode(next) {
    setMode(next);
    setFiles([]);
  }

  async function chooseFolder() {
    try {
      const folder = await api.pickFolder(savePath || defaultPath);
      if (folder) setSavePath(folder);
    } catch (error) {
      onError(error);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!sources.length) {
      onError(new Error(t(isSeed ? 'add.needSeedSource' : isMagnet ? 'add.needMagnet' : 'add.needTorrent')));
      return;
    }
    if (torrentFiles && skipped.size === torrentFiles.length) {
      onError(new Error(t('add.needFiles')));
      return;
    }

    const filePriorities =
      torrentFiles && skipped.size
        ? torrentFiles.map((file) => (skipped.has(file.index) ? PRIORITY_SKIP : PRIORITY_NORMAL))
        : null;

    setBusy(true);
    const failures = [];
    for (const source of sources) {
      try {
        if (isSeed) {
          await api.seed({
            source,
            isPrivate: seedOptions.isPrivate,
            trackers: seedOptions.trackers.split(/\s+/).filter(Boolean),
            comment: seedOptions.comment.trim(),
          });
        } else {
          await api.add({ source, savePath: savePath.trim(), paused: startPaused, filePriorities });
        }
      } catch (error) {
        failures.push(errorText(error));
      }
    }
    setBusy(false);

    const added = sources.length - failures.length;
    if (failures.length) onError(new Error(failures[0]));
    if (!added) return;
    if (isSeed) onDone(t('add.doneSeed'));
    else onDone(added > 1 ? t('add.doneMany', { count: added }) : t('add.doneOne'));
  }

  return (
    <Modal title={t(isSeed ? 'add.titleSeed' : 'add.titleDownload')} locked={busy} onClose={onClose}>
      <Tabs
        items={MODES.map(({ value, labelKey, icon }) => ({ value, icon, label: t(labelKey) }))}
        value={mode}
        onChange={switchMode}
        disabled={busy}
      />

      <form onSubmit={submit}>
        {isMagnet ? (
          <label className="form-label">
            <span>{t('add.magnetLabel')}</span>
            <textarea
              autoFocus
              className="text-input text-area"
              onChange={(event) => setMagnetText(event.target.value)}
              placeholder={t('add.magnetPlaceholder')}
              rows="3"
              value={magnetText}
            />
          </label>
        ) : (
          <SourcePicker
            files={files}
            isSeed={isSeed}
            onPickTorrents={pick(() => api.pickTorrent())}
            onPickFile={pick(() => api.pickContent('file'))}
            onPickFolder={pick(() => api.pickContent('folder'))}
          />
        )}

        {!isSeed && <PreviewCard preview={preview} />}
        {!isSeed && torrentFiles && <FilePicker files={torrentFiles} skipped={skipped} onChange={setSkipped} />}

        {!isSeed && (
          <>
            <label className="form-label">
              <span>{t('add.saveFolder')}</span>
              <div className="input-with-button">
                <input
                  className="text-input"
                  onChange={(event) => setSavePath(event.target.value)}
                  placeholder={defaultPath || ''}
                  value={savePath}
                />
                <button
                  className="icon-button bordered"
                  type="button"
                  onClick={chooseFolder}
                  title={t('add.chooseFolder')}
                  aria-label={t('add.chooseFolder')}
                >
                  <FolderOpen size={17} />
                </button>
              </div>
            </label>
            <div className="option-list">
              <Checkbox checked={startPaused} onChange={setStartPaused} label={t('add.startPaused')} />
            </div>
          </>
        )}

        {isSeed && <SeedOptions value={seedOptions} onChange={setSeedOptions} />}

        <div className="modal-footer">
          <button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy && (
              <>
                <Loader2 size={17} className="spin" /> {t(isSeed ? 'add.hashing' : 'add.adding')}
              </>
            )}
            {!busy && isSeed && (
              <>
                <Radio size={17} /> {t('add.createSeed')}
              </>
            )}
            {!busy && !isSeed && (
              <>
                <Download size={17} /> {t('add.startDownload')}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SourcePicker({ files, isSeed, onPickTorrents, onPickFile, onPickFolder }) {
  const { t } = useI18n();
  const filled = files.length > 0;
  return (
    <div className={filled ? 'drop-zone filled' : 'drop-zone'}>
      <div className="drop-icon">{isSeed ? <Upload size={22} /> : <FileText size={22} />}</div>
      {filled ? (
        <>
          <strong>{files.length > 1 ? t('add.filesSelected', { count: files.length }) : baseName(files[0])}</strong>
          <small className="selected-path" title={files.join('\n')}>
            {files.length > 1 ? files.map(baseName).join(', ') : files[0]}
          </small>
        </>
      ) : (
        <>
          <strong>{t(isSeed ? 'add.dropSeed' : 'add.dropTorrent')}</strong>
          <span>{t(isSeed ? 'add.dropSeedHint' : 'add.dropTorrentHint')}</span>
        </>
      )}
      <div className="drop-zone-actions">
        {isSeed ? (
          <>
            <button className="button button-secondary" type="button" onClick={onPickFile}>
              <File size={16} /> {t('add.pickFile')}
            </button>
            <button className="button button-secondary" type="button" onClick={onPickFolder}>
              <Folder size={16} /> {t('add.pickFolder')}
            </button>
          </>
        ) : (
          <button className="button button-secondary" type="button" onClick={onPickTorrents}>
            <FolderOpen size={16} /> {t(filled ? 'add.pickOther' : 'add.pickTorrent')}
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewCard({ preview }) {
  const { t } = useI18n();
  if (!preview) return null;
  if (preview.invalid) {
    return (
      <div className="torrent-preview invalid">
        <AlertCircle size={15} /> {t('add.previewInvalid')}
      </div>
    );
  }
  return (
    <div className="torrent-preview">
      <strong title={preview.name}>{preview.name || t('add.previewNoName')}</strong>
      <span>
        {preview.length ? formatBytes(preview.length) : t('add.previewSizeUnknown')}
        {preview.fileCount ? ` · ${t('add.fileCount', { count: preview.fileCount })}` : ''}
      </span>
    </div>
  );
}

/** Choose which files of a multi-file torrent to download. */
function FilePicker({ files, skipped, onChange }) {
  const { t } = useI18n();
  const selectedSize = useMemo(
    () => files.reduce((sum, file) => sum + (skipped.has(file.index) ? 0 : file.length), 0),
    [files, skipped],
  );
  const total = files.reduce((sum, file) => sum + file.length, 0);
  const allSelected = skipped.size === 0;

  const toggle = (index, selected) => {
    const next = new Set(skipped);
    if (selected) next.delete(index);
    else next.add(index);
    onChange(next);
  };

  return (
    <div className="file-picker">
      <div className="file-picker-head">
        <Checkbox
          checked={allSelected}
          indeterminate={!allSelected && skipped.size < files.length}
          onChange={(value) => onChange(value ? new Set() : new Set(files.map((file) => file.index)))}
          label={t('add.filesToDownload')}
        />
        <span>{t('add.selectedSize', { selected: formatBytes(selectedSize), total: formatBytes(total) })}</span>
      </div>
      <ul className="file-picker-list">
        {files.map((file) => (
          <li key={file.index}>
            <Checkbox
              checked={!skipped.has(file.index)}
              onChange={(value) => toggle(file.index, value)}
              label={file.path.split(/[\\/]/).slice(1).join('/') || file.name}
            />
            <span>{formatBytes(file.length)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Extra options for creating a torrent, collapsed by default to keep the dialog simple. */
function SeedOptions({ value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const set = (key) => (next) => onChange({ ...value, [key]: next });

  return (
    <div className={open ? 'advanced open' : 'advanced'}>
      <button className="advanced-toggle" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDown size={16} /> {t('add.advanced')}
      </button>
      {open && (
        <div className="advanced-body">
          <Checkbox
            checked={value.isPrivate}
            onChange={set('isPrivate')}
            label={t('add.private')}
            hint={t('add.privateHint')}
          />
          <label className="form-label">
            <span>{t('add.trackers')}</span>
            <textarea
              className="text-input text-area"
              rows="3"
              placeholder={t('add.trackersPlaceholder')}
              value={value.trackers}
              onChange={(event) => set('trackers')(event.target.value)}
            />
          </label>
          <label className="form-label">
            <span>{t('add.comment')}</span>
            <input
              className="text-input"
              value={value.comment}
              onChange={(event) => set('comment')(event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
