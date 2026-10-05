import { useState } from 'react';
import { Check, Copy, FolderOpen, Magnet, X } from 'lucide-react';
import { api } from '../api/client';
import { NumberInput } from '../components/NumberInput';
import { PeerlyMark } from '../components/layout/PeerlyMark';
import { SCHEDULE_MODES, ScheduleGrid } from '../components/ScheduleGrid';
import { Select } from '../components/Select';
import { Tabs } from '../components/Tabs';
import { Toggle } from '../components/Toggle';
import { useI18n } from '../i18n/I18nProvider';

const EMPTY_SCHEDULE = '0'.repeat(7 * 24);
const SECTIONS = ['general', 'downloads', 'speed', 'schedule', 'seeding', 'connection', 'about'];

/** All preferences, grouped into tabs like qBittorrent's options dialog. */
export function SettingsPage({ settings, network, onChange, onPickFolder, onMakeDefaultMagnet }) {
  const { t } = useI18n();
  const [section, setSection] = useState('general');
  const s = settings || {};
  const set = (key) => (value) => onChange({ [key]: value });
  const controls = {
    s,
    t,
    set,
    toggle: (key) => <Toggle checked={Boolean(s[key])} onChange={set(key)} label={t(`settings.${key}`)} />,
  };

  return (
    <section className="subpage">
      <header className="page-header">
        <h1>{t('settings.title')}</h1>
      </header>

      <Tabs
        className="settings-tabs"
        items={SECTIONS.map((value) => ({ value, label: t(`settings.sections.${value}`) }))}
        value={section}
        onChange={setSection}
      />

      {section === 'general' && <GeneralSection {...controls} onMakeDefaultMagnet={onMakeDefaultMagnet} />}
      {section === 'downloads' && <DownloadsSection {...controls} onPickFolder={onPickFolder} />}
      {section === 'speed' && <SpeedSection {...controls} network={network} />}
      {section === 'schedule' && <ScheduleSection {...controls} network={network} />}
      {section === 'seeding' && <SeedingSection {...controls} />}
      {section === 'connection' && <ConnectionSection {...controls} network={network} />}
      {section === 'about' && <AboutSection s={s} t={t} />}
    </section>
  );
}

function GeneralSection({ s, t, set, toggle, onMakeDefaultMagnet }) {
  const { language, languages } = useI18n();
  return (
    <div className="settings-list">
      <Row title={t('settings.language')} hint={t('settings.languageHint')}>
        <Select
          ariaLabel={t('settings.language')}
          value={s.language || 'auto'}
          onChange={set('language')}
          options={[
            {
              value: 'auto',
              label: t('settings.languageAuto'),
              hint: languages.find((l) => l.code === language)?.name,
            },
            ...languages.map(({ code, name }) => ({ value: code, label: name })),
          ]}
        />
      </Row>
      <Row title={t('settings.darkMode')} hint={t('settings.darkModeHint')}>
        {toggle('darkMode')}
      </Row>
      <Row title={t('settings.closeToTray')} hint={t('settings.closeToTrayHint')}>
        {toggle('closeToTray')}
      </Row>
      <Row title={t('settings.startMinimized')} hint={t('settings.startMinimizedHint')}>
        {toggle('startMinimized')}
      </Row>
      <Row title={t('settings.startWithWindows')} hint={t('settings.startWithWindowsHint')}>
        {toggle('startWithWindows')}
      </Row>
      <Row title={t('settings.notifications')} hint={t('settings.notificationsHint')}>
        {toggle('notifications')}
      </Row>
      <Row
        title={t('settings.magnet')}
        hint={t(s.isDefaultMagnet ? 'settings.magnetIsDefault' : 'settings.magnetOffer')}
      >
        {s.isDefaultMagnet ? (
          <span className="settings-badge">
            <Check size={14} /> {t('settings.default')}
          </span>
        ) : (
          <button className="button button-secondary" type="button" onClick={onMakeDefaultMagnet}>
            <Magnet size={16} /> {t('settings.makeDefault')}
          </button>
        )}
      </Row>
    </div>
  );
}

function DownloadsSection({ s, t, set, toggle, onPickFolder }) {
  return (
    <>
      <div className="settings-list">
        <Row title={t('settings.downloadFolder')} hint={<span className="mono">{s.downloadPath}</span>}>
          <button className="button button-secondary" type="button" onClick={onPickFolder}>
            <FolderOpen size={16} /> {t('settings.change')}
          </button>
        </Row>
        <Row title={t('settings.incompleteEnabled')} hint={t('settings.incompleteHint')}>
          <PathSetting value={s.incompletePath} onChange={(value) => onChangeBoth(set, value)} />
        </Row>
        <Row title={t('settings.watchFolder')} hint={t('settings.watchFolderHint')}>
          <PathSetting value={s.watchFolder} onChange={set('watchFolder')} />
        </Row>
      </div>

      <h3 className="list-title">{t('settings.sections.adding')}</h3>
      <div className="settings-list">
        <Row title={t('settings.showAddDialog')} hint={t('settings.showAddDialogHint')}>
          {toggle('showAddDialog')}
        </Row>
        <Row title={t('settings.addPaused')} hint={t('settings.addPausedHint')}>
          {toggle('addPaused')}
        </Row>
        <Row title={t('settings.deleteTorrentAfterAdd')} hint={t('settings.deleteTorrentAfterAddHint')}>
          {toggle('deleteTorrentAfterAdd')}
        </Row>
        <Row title={t('settings.confirmRemoval')} hint={t('settings.confirmRemovalHint')}>
          {toggle('confirmRemoval')}
        </Row>
      </div>
    </>
  );
}

/** The incomplete-folder switch follows its path: choosing a folder turns it on, clearing turns it off. */
function onChangeBoth(set, value) {
  set('incompletePath')(value);
  set('incompleteEnabled')(Boolean(value));
}

function SpeedSection({ s, t, set, toggle, network }) {
  const kbps = t('settings.units.kbps');
  return (
    <>
      <div className="settings-list">
        <Row title={t('settings.downloadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.downloadLimit}
            onCommit={set('downloadLimit')}
            unit={kbps}
            ariaLabel={t('settings.downloadLimit')}
          />
        </Row>
        <Row title={t('settings.uploadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.uploadLimit}
            onCommit={set('uploadLimit')}
            unit={kbps}
            ariaLabel={t('settings.uploadLimit')}
          />
        </Row>
      </div>

      <h3 className="list-title">{t('settings.sections.altSpeed')}</h3>
      <div className="settings-list">
        <Row
          title={t('settings.altSpeedEnabled')}
          hint={network?.altSpeed ? t('settings.altSpeedActive') : t('settings.altSpeedHint')}
        >
          {toggle('altSpeedEnabled')}
        </Row>
        <Row title={t('settings.altDownloadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.altDownloadLimit}
            onCommit={set('altDownloadLimit')}
            unit={kbps}
            ariaLabel={t('settings.altDownloadLimit')}
          />
        </Row>
        <Row title={t('settings.altUploadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.altUploadLimit}
            onCommit={set('altUploadLimit')}
            unit={kbps}
            ariaLabel={t('settings.altUploadLimit')}
          />
        </Row>
      </div>
    </>
  );
}

/** Weekly plan: for every hour — full speed, alternative limits, seeding only or nothing. */
function ScheduleSection({ s, t, set, toggle, network }) {
  const { language } = useI18n();
  const kbps = t('settings.units.kbps');
  const schedule = s.schedule || EMPTY_SCHEDULE;
  const mode = s.schedulerEnabled ? network?.scheduleMode || 'full' : null;
  const counts = SCHEDULE_MODES.map((_, index) => schedule.split(String(index)).length - 1);

  return (
    <>
      <div className="settings-list">
        <Row
          title={t('settings.schedule.enabled')}
          hint={
            mode
              ? t('settings.schedule.now', { mode: t(`settings.schedule.modes.${mode}`) })
              : t('settings.schedule.enabledHint')
          }
        >
          {toggle('schedulerEnabled')}
        </Row>
      </div>

      <div className={s.schedulerEnabled ? 'schedule-card' : 'schedule-card off'}>
        <ScheduleGrid value={schedule} onChange={set('schedule')} language={language} t={t} />
        <div className="schedule-footer">
          <span className="schedule-totals">
            {SCHEDULE_MODES.map((name, index) =>
              counts[index] ? (
                <span key={name}>
                  <i className={`schedule-swatch mode-${name}`} />
                  {t('settings.schedule.hours', { count: counts[index] })}
                </span>
              ) : null,
            )}
          </span>
          <button className="button button-secondary" type="button" onClick={() => set('schedule')(EMPTY_SCHEDULE)}>
            {t('settings.schedule.clear')}
          </button>
        </div>
      </div>

      <h3 className="list-title">{t('settings.schedule.limitsTitle')}</h3>
      <div className="settings-list">
        <Row title={t('settings.altDownloadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.altDownloadLimit}
            onCommit={set('altDownloadLimit')}
            unit={kbps}
            ariaLabel={t('settings.altDownloadLimit')}
          />
        </Row>
        <Row title={t('settings.altUploadLimit')} hint={t('settings.limitHint')}>
          <NumberInput
            value={s.altUploadLimit}
            onCommit={set('altUploadLimit')}
            unit={kbps}
            ariaLabel={t('settings.altUploadLimit')}
          />
        </Row>
      </div>
    </>
  );
}

function SeedingSection({ s, t, set, toggle }) {
  return (
    <>
      <div className="settings-list">
        <Row title={t('settings.maxActiveDownloads')} hint={t('settings.maxActiveDownloadsHint')}>
          <NumberInput
            value={s.maxActiveDownloads}
            onCommit={set('maxActiveDownloads')}
            max={100}
            ariaLabel={t('settings.maxActiveDownloads')}
          />
        </Row>
      </div>

      <h3 className="list-title">{t('settings.sections.seedingLimits')}</h3>
      <div className="settings-list">
        <Row title={t('settings.ratioLimit')} hint={t('settings.ratioLimitHint')}>
          <div className="setting-pair">
            <NumberInput
              value={s.ratioLimit}
              onCommit={set('ratioLimit')}
              decimals={2}
              disabled={!s.ratioLimitEnabled}
              ariaLabel={t('settings.ratioLimit')}
            />
            {toggle('ratioLimitEnabled')}
          </div>
        </Row>
        <Row title={t('settings.seedTimeLimit')} hint={t('settings.seedTimeLimitHint')}>
          <div className="setting-pair">
            <NumberInput
              value={s.seedTimeLimit}
              onCommit={set('seedTimeLimit')}
              unit={t('settings.units.min')}
              disabled={!s.seedTimeLimitEnabled}
              ariaLabel={t('settings.seedTimeLimit')}
            />
            {toggle('seedTimeLimitEnabled')}
          </div>
        </Row>
        <Row title={t('settings.limitAction')} hint={t('settings.limitActionHint')}>
          <Select
            ariaLabel={t('settings.limitAction')}
            value={s.limitAction || 'pause'}
            onChange={set('limitAction')}
            options={[
              { value: 'pause', label: t('settings.limitActions.pause') },
              { value: 'remove', label: t('settings.limitActions.remove') },
            ]}
          />
        </Row>
      </div>
    </>
  );
}

function ConnectionSection({ s, t, set, toggle, network }) {
  return (
    <div className="settings-list">
      <Row
        title={t('settings.port')}
        hint={network?.portInUse ? t('settings.portBusy', { port: network.port }) : t('settings.portHint')}
        warning={network?.portInUse}
      >
        <NumberInput
          value={s.listeningPort}
          onCommit={set('listeningPort')}
          min={1}
          max={65535}
          ariaLabel={t('settings.port')}
        />
      </Row>
      <Row title={t('settings.maxConns')} hint={t('settings.maxConnsHint')}>
        <NumberInput
          value={s.maxConns}
          onCommit={set('maxConns')}
          min={10}
          max={2000}
          ariaLabel={t('settings.maxConns')}
        />
      </Row>
      <Row title={t('settings.dht')} hint={t('settings.dhtHint')}>
        {toggle('dht')}
      </Row>
      <Row title={t('settings.pex')} hint={t('settings.pexHint')}>
        {toggle('pex')}
      </Row>
      <Row title={t('settings.lsd')} hint={t('settings.lsdHint')}>
        {toggle('lsd')}
      </Row>
      <Row title={t('settings.ipFilter')} hint={t('settings.ipFilterHint')}>
        <PathSetting value={s.ipFilterPath} onChange={set('ipFilterPath')} kind="ipfilter" />
      </Row>
    </div>
  );
}

/** Version and runtime details: what to quote in a bug report. */
function AboutSection({ s, t }) {
  const { errorText } = useI18n();
  const [status, setStatus] = useState('');
  const versions = s.versions || {};
  const details = [
    [t('settings.about.version'), s.version],
    ['Electron', versions.electron],
    ['Chromium', versions.chrome],
    ['Node.js', versions.node],
    ['WebTorrent', versions.webtorrent],
  ].filter(([, value]) => value);

  async function copyDetails() {
    const text = [`Peerly ${s.version}`, ...details.slice(1).map(([name, value]) => `${name} ${value}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t('settings.about.copied'));
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  async function openDataFolder() {
    try {
      await api.openDataFolder();
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  return (
    <>
      <div className="about-card">
        <span className="about-mark">
          <PeerlyMark size={34} />
        </span>
        <div className="about-title">
          <h2>Peerly</h2>
          <span>{t('settings.about.versionLine', { version: s.version || '—' })}</span>
          <p>{t('settings.about.tagline')}</p>
        </div>
        <div className="about-actions">
          <button className="button button-secondary" type="button" onClick={copyDetails}>
            <Copy size={16} /> {t('settings.about.copy')}
          </button>
          {status && <small>{status}</small>}
        </div>
      </div>

      <h3 className="list-title">{t('settings.about.details')}</h3>
      <div className="settings-list">
        {details.map(([name, value]) => (
          <Row key={name} title={name}>
            <span className="about-value mono">{value}</span>
          </Row>
        ))}
        <Row title={t('settings.about.dataFolder')} hint={<span className="mono">{s.dataPath}</span>}>
          <button className="button button-secondary" type="button" onClick={openDataFolder}>
            <FolderOpen size={16} /> {t('settings.about.open')}
          </button>
        </Row>
      </div>
    </>
  );
}

function Row({ title, hint, warning = false, children }) {
  return (
    <div className="settings-row">
      <div className="settings-text">
        <strong>{title}</strong>
        {hint && <span className={warning ? 'warning' : undefined}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** An optional folder (or file, when `kind` is set): shows the path with "change" and "turn off" buttons. */
function PathSetting({ value, onChange, kind }) {
  const { t, errorText } = useI18n();
  const [error, setError] = useState('');

  async function choose() {
    try {
      const picked = kind ? await api.pickFile(kind) : await api.pickFolder(value);
      if (picked) onChange(picked);
    } catch (pickError) {
      setError(errorText(pickError));
    }
  }

  return (
    <div className="path-setting" title={error || value}>
      <span className={value ? 'path-value mono' : 'path-value off'}>{value || t('settings.off')}</span>
      <button className="button button-secondary" type="button" onClick={choose}>
        <FolderOpen size={16} /> {t(value ? 'settings.change' : 'settings.choose')}
      </button>
      {value && (
        <button
          className="icon-button bordered"
          type="button"
          onClick={() => onChange('')}
          title={t('settings.turnOff')}
          aria-label={t('settings.turnOff')}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
