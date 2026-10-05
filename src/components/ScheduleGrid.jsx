import { useEffect, useMemo, useRef, useState } from 'react';

export const SCHEDULE_MODES = ['full', 'limited', 'seed', 'off'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first; values are Date#getDay()
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hh = (hour) => `${String(hour % 24).padStart(2, '0')}:00`;

/**
 * Week × 24 hours grid. Pick a mode, then click or drag across hours; a click on a day
 * or an hour paints the whole row or column. `value` is 168 digits (index = day * 24 + hour).
 */
export function ScheduleGrid({ value, onChange, language, t }) {
  const [brush, setBrush] = useState(1);
  const [draft, setDraft] = useState(value);
  const [hovered, setHovered] = useState(null);
  const painting = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!painting.current) setDraft(value);
  }, [value]);

  // Finish a drag even when the pointer is released outside the grid.
  useEffect(() => {
    const stop = () => {
      if (!painting.current) return;
      painting.current = false;
      onChange(draftRef.current);
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [onChange]);

  const dayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(language || undefined, { weekday: 'short' });
    // 2026-10-04 is a Sunday, so 4 + day gives that weekday.
    return Object.fromEntries(DAY_ORDER.map((day) => [day, format.format(new Date(2026, 9, 4 + day))]));
  }, [language]);

  const paint = (indexes) => {
    const cells = draftRef.current.split('');
    indexes.forEach((index) => {
      cells[index] = String(brush);
    });
    const next = cells.join('');
    draftRef.current = next;
    setDraft(next);
    return next;
  };

  const now = new Date();
  const nowIndex = now.getDay() * 24 + now.getHours();
  const modeLabel = (digit) => t(`settings.schedule.modes.${SCHEDULE_MODES[Number(digit)]}`);
  const caption =
    hovered === null
      ? t('settings.schedule.gridHint')
      : t('settings.schedule.cell', {
          day: dayNames[Math.floor(hovered / 24)],
          from: hh(hovered % 24),
          to: hh((hovered % 24) + 1),
          mode: modeLabel(draft[hovered]),
        });

  return (
    <div className="schedule">
      <div className="schedule-brushes" role="radiogroup" aria-label={t('settings.schedule.brush')}>
        {SCHEDULE_MODES.map((mode, index) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={brush === index}
            className={brush === index ? 'schedule-brush active' : 'schedule-brush'}
            onClick={() => setBrush(index)}
            title={t(`settings.schedule.modeHints.${mode}`)}
          >
            <i className={`schedule-swatch mode-${mode}`} />
            {t(`settings.schedule.modes.${mode}`)}
          </button>
        ))}
      </div>

      <div className="schedule-grid" onPointerLeave={() => setHovered(null)}>
        <span />
        {HOURS.map((hour) => (
          <button
            key={hour}
            type="button"
            className="schedule-hour"
            onClick={() => onChange(paint(DAY_ORDER.map((day) => day * 24 + hour)))}
            title={`${hh(hour)}–${hh(hour + 1)}`}
          >
            {hour}
          </button>
        ))}
        {DAY_ORDER.map((day) => (
          <Row
            key={day}
            day={day}
            label={dayNames[day]}
            draft={draft}
            nowIndex={nowIndex}
            onDay={() => onChange(paint(HOURS.map((hour) => day * 24 + hour)))}
            onStart={(index) => {
              painting.current = true;
              paint([index]);
            }}
            onEnter={(index) => {
              setHovered(index);
              if (painting.current) paint([index]);
            }}
          />
        ))}
      </div>

      <p className="schedule-caption">{caption}</p>
    </div>
  );
}

function Row({ day, label, draft, nowIndex, onDay, onStart, onEnter }) {
  return (
    <>
      <button type="button" className="schedule-day" onClick={onDay}>
        {label}
      </button>
      {HOURS.map((hour) => {
        const index = day * 24 + hour;
        const mode = SCHEDULE_MODES[Number(draft[index])] || 'full';
        return (
          <span
            key={hour}
            className={index === nowIndex ? `schedule-cell mode-${mode} now` : `schedule-cell mode-${mode}`}
            onPointerDown={(event) => {
              event.preventDefault();
              onStart(index);
            }}
            onPointerEnter={() => onEnter(index)}
          />
        );
      })}
    </>
  );
}
