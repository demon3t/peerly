// Weekly transfer schedule (like µTorrent's scheduler): every hour of the week has a mode.
//   full    – normal limits
//   limited – the alternative limits ("turtle mode")
//   seed    – only finished torrents run (downloads wait)
//   off     – everything waits
// Stored as a 168-character string, one digit per hour: index = weekday (0 = Sunday) * 24 + hour.

const MODES = ['full', 'limited', 'seed', 'off'];
const HOURS_IN_WEEK = 7 * 24;
const EMPTY_SCHEDULE = '0'.repeat(HOURS_IN_WEEK);
const SCHEDULE_PATTERN = new RegExp(`^[0-${MODES.length - 1}]{${HOURS_IN_WEEK}}$`);

const LEGACY_DAY_SETS = {
  every: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
};

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0')
    .split(':')
    .map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** The mode of the hour `date` falls into ('full' when the schedule is off). */
function scheduleMode(settings, date = new Date()) {
  if (!settings.get('schedulerEnabled')) return 'full';
  const schedule = settings.get('schedule') || EMPTY_SCHEDULE;
  return MODES[Number(schedule[date.getDay() * 24 + date.getHours()])] || 'full';
}

/**
 * Converts the old single "from–to on these days" window into the weekly grid:
 * an hour is limited when its start falls inside the window (ranges over midnight included).
 */
function legacySchedule({ schedulerFrom = '08:00', schedulerTo = '20:00', schedulerDays = 'every' }) {
  const from = toMinutes(schedulerFrom);
  const to = toMinutes(schedulerTo);
  const days = LEGACY_DAY_SETS[schedulerDays] || LEGACY_DAY_SETS.every;
  const inWindow = (day, minutes) => {
    if (from === to) return days.includes(day);
    if (from < to) return days.includes(day) && minutes >= from && minutes < to;
    // Over midnight: the evening part belongs to today, the morning part to the previous day.
    if (minutes >= from) return days.includes(day);
    if (minutes < to) return days.includes((day + 6) % 7);
    return false;
  };
  let schedule = '';
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) schedule += inWindow(day, hour * 60) ? '1' : '0';
  }
  return schedule;
}

/** Limits in bytes/s (-1 = unlimited), whether the alternative pair is active, and the schedule mode. */
function effectiveLimits(settings, date = new Date()) {
  const mode = scheduleMode(settings, date);
  const alternative = Boolean(settings.get('altSpeedEnabled')) || mode === 'limited';
  const [down, up] = alternative
    ? [settings.get('altDownloadLimit'), settings.get('altUploadLimit')]
    : [settings.get('downloadLimit'), settings.get('uploadLimit')];
  const toRate = (kbps) => (kbps > 0 ? kbps * 1024 : -1);
  return { mode, alternative, download: toRate(down), upload: toRate(up) };
}

module.exports = { MODES, EMPTY_SCHEDULE, SCHEDULE_PATTERN, scheduleMode, legacySchedule, effectiveLimits };
