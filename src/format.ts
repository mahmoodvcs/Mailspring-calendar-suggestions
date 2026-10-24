const DAY_MS = 24 * 60 * 60 * 1000;

function hourCycle(): 'h23' | 'h12' {
  return AppEnv.config.get('core.workspace.use24HourClock') ? 'h23' : 'h12';
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function formatWhen({ start, end, isAllDay }: { start: Date; end: Date; isAllDay: boolean }) {
  const day = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hourCycle: hourCycle() });

  if (isAllDay) {
    const lastDay = new Date(end.getTime() - DAY_MS);
    return lastDay > start && !sameDay(lastDay, start) ? `${day(start)} – ${day(lastDay)}` : day(start);
  }
  if (sameDay(start, end)) {
    return `${day(start)} · ${time(start)} – ${time(end)}`;
  }
  return `${day(start)} ${time(start)} – ${day(end)} ${time(end)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Value for an <input type="date">, in local time. */
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Value for an <input type="datetime-local">, in local time. */
export function toDateTimeInput(d: Date) {
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses either input format as local time; `new Date('YYYY-MM-DD')` would read it as UTC. */
export function fromInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes());
}

/** Whether the user's locale writes the day before the month, which decides how "03/04" reads. */
export function localeIsDayFirst(): boolean {
  const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2000, 11, 31));
  const dayIndex = parts.findIndex((p) => p.type === 'day');
  const monthIndex = parts.findIndex((p) => p.type === 'month');
  return dayIndex !== -1 && monthIndex !== -1 && dayIndex < monthIndex;
}
