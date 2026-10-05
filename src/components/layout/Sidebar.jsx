import { BarChart3, CheckCircle2, Download, LayoutList, Pause, Plus, Settings, Turtle, Upload } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatBytes } from '../../lib/format';
import { FILTERS } from '../../lib/torrentStatus';
import { NavItem } from './NavItem';

const FILTER_ICONS = { all: LayoutList, active: Download, seeding: Upload, completed: CheckCircle2, paused: Pause };

/** Left navigation: add button, status filters, pages, speed mode and connection status. */
export function Sidebar({ route, counts, disk, network, onNavigate, onAdd, onToggleAltSpeed }) {
  const { t } = useI18n();

  return (
    <aside className="sidebar">
      <button className="button button-primary sidebar-add" type="button" onClick={onAdd} title={t('common.add')}>
        <Plus size={17} /> <span>{t('common.add')}</span>
      </button>

      <nav className="main-nav">
        {FILTERS.map(({ value, labelKey }) => {
          const Icon = FILTER_ICONS[value];
          return (
            <NavItem
              key={value}
              active={route.page === 'dashboard' && route.filter === value}
              icon={<Icon size={18} />}
              label={t(labelKey)}
              trailing={counts[value]}
              onClick={() => onNavigate({ page: 'dashboard', filter: value })}
            />
          );
        })}
      </nav>

      <nav className="main-nav nav-secondary">
        <NavItem
          active={route.page === 'stats'}
          icon={<BarChart3 size={18} />}
          label={t('nav.stats')}
          onClick={() => onNavigate({ page: 'stats' })}
        />
        <NavItem
          active={route.page === 'settings'}
          icon={<Settings size={18} />}
          label={t('nav.settings')}
          onClick={() => onNavigate({ page: 'settings' })}
        />
      </nav>

      <button
        aria-pressed={Boolean(network.altSpeed)}
        className={network.altSpeed ? 'alt-speed active' : 'alt-speed'}
        onClick={onToggleAltSpeed}
        title={t('settings.altSpeedHint')}
        type="button"
      >
        <Turtle size={16} />
        <span>{t(network.altSpeed ? 'sidebar.altSpeedOn' : 'sidebar.altSpeedOff')}</span>
      </button>

      <div className="sidebar-status">
        <span
          className={network.online ? 'status-line' : 'status-line offline'}
          title={network.online ? t('network.online') : t('network.connecting')}
        >
          <span className="status-dot" />
          <span>{network.online ? t('network.online') : t('network.connecting')}</span>
        </span>
        {disk && <span className="sidebar-disk">{t('network.freeSpace', { size: formatBytes(disk.free) })}</span>}
      </div>
    </aside>
  );
}
