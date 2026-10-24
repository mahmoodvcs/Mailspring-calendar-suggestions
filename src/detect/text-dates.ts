// Finds dates in free text with chrono-node, then keeps only the ones that read like a plan.
// chrono matches every date it sees ("ordered on Oct 3", "© 2026", "updated Monday"), so a match
// needs both a day and a time plus a meeting word or link nearby, or a day plus an event noun for
// an all-day suggestion. A day and a time on neighbouring lines ("Date: …" / "Time: …") are read
// as one.
import * as chrono from 'chrono-node';
import type { EventDraft } from './schema-org';

const DEFAULT_DURATION_MIN = 60;
const MAX_TEXT_LENGTH = 30000;
const MAX_DAYS_AHEAD = 2 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const MEETING_WORDS =
  /\b(meet(ing|ings|up)?|call|calls|chat|sync|catch[- ]?up|stand-?up|1:1|one[- ]on[- ]one|interview|appointment|appt|reservation|booking|booked|schedul(e|ed)|reschedul(e|ed)|webinar|conference|seminar|workshop|session|class|lecture|training|demo|presentation|kick-?off|review|party|dinner|lunch|breakfast|brunch|coffee|drinks|event|ceremony|wedding|birthday|concert|show|game|tour|visit|check-?in|check-?out|flight|departs?|departure|arriv(e|es|al)|pick-?up|join|invite|invitation|rsvp|agenda|zoom|teams|hangout|google meet|webex|see you)\b/i;

const EVENT_NOUNS =
  /\b(conference|summit|festival|wedding|birthday|party|ceremony|graduation|holiday|vacation|trip|offsite|off-site|retreat|exam|concert|tournament|fair|expo|convention|appointment|reservation|check-?in|check-?out)\b/i;

// Dates introduced by these words record when something happened or lapses, not a plan.
const NON_EVENT_PREFIX =
  /\b(sent|date|posted|published|updated|modified|created|expires?|expir(y|ed|ation)|valid (until|through|thru)|due|deadline|delivered|delivery|shipped|ships|arriving|ordered|order date|invoice|statement|billed|charged|paid|payment|renews?|renewal|born|since|as of|effective|last (login|signed in)|joined|member since|received|copyright|©)\b[^.\n]{0,12}$/i;

export interface TextDateOptions {
  sentAt: Date;
  now: Date;
  hasMeetingLink: boolean;
  /** Read "03/04" as 3 April rather than March 4. */
  dayFirst?: boolean;
}

export interface TextDraft extends EventDraft {
  context: string;
}

// A chrono result, or a day-only and a time-only result joined into one.
interface DateMatch {
  index: number;
  text: string;
  start: chrono.ParsedComponents;
  end?: chrono.ParsedComponents | null;
  paired?: boolean;
}

export function findTextEvents(text: string, opts: TextDateOptions): TextDraft[] {
  const input = text.slice(0, MAX_TEXT_LENGTH);
  const parser = opts.dayFirst ? chrono.en.GB : chrono.casual;
  // chrono reads a bare length of time ("for 45 minutes", "within 2 hours") as that long after the
  // sent date, which is never the plan being described.
  const results = parser
    .parse(input, opts.sentAt, { forwardDate: true })
    .filter((r) => !r.tags().has('result/relativeDateAndTime'));
  const drafts: TextDraft[] = [];

  for (const match of pairDaysWithTimes(input, results)) {
    const draft = toDraft(input, match, opts);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

function toDraft(text: string, result: DateMatch, opts: TextDateOptions): TextDraft | null {
  const { start } = result;
  const hasTime = start.isCertain('hour');
  const hasDay = hasCertainDay(start);
  if (!hasDay) return null;
  if (looksLikePartOfToken(text, result.index, result.text.length)) return null;

  const lastIndex = result.index + result.text.length - 1;
  const line = lineAround(text, result.index);
  const lastLine = lineAround(text, lastIndex);
  const before = text.slice(line.start, result.index);
  const after = text.slice(lastIndex + 1, lastLine.end);
  // "Date:" heads receipts and quoted headers, but a "Time:" line paired with it reads as a plan.
  const dateLabel = result.paired && /^\s*date\s*:\s*$/i.test(before);
  if ((NON_EVENT_PREFIX.test(before) && !dateLabel) || /\bwrote:/i.test(after)) return null;

  let neighborhood = linesAround(text, result.index, 1);
  if (result.paired) neighborhood += '\n' + linesAround(text, lastIndex, 1);
  const hasMeetingWord = MEETING_WORDS.test(neighborhood);

  let startDate: Date;
  let endDate: Date;
  let isAllDay: boolean;

  if (hasTime) {
    if (!hasMeetingWord && !opts.hasMeetingLink) return null;
    isAllDay = false;
    startDate = start.date();
    if (result.end && result.end.date() > startDate) {
      endDate = result.end.date();
    } else {
      const minutes = durationMinutes(text.slice(line.start, lastLine.end)) ?? DEFAULT_DURATION_MIN;
      endDate = new Date(startDate.getTime() + minutes * 60 * 1000);
    }
  } else {
    if (!EVENT_NOUNS.test(neighborhood)) return null;
    isAllDay = true;
    startDate = startOfDay(start.date());
    const lastDay = result.end ? startOfDay(result.end.date()) : startDate;
    endDate = new Date(Math.max(lastDay.getTime(), startDate.getTime()) + DAY_MS);
  }

  if (endDate <= opts.now) return null;
  if (startDate.getTime() - opts.now.getTime() > MAX_DAYS_AHEAD * DAY_MS) return null;

  return {
    start: startDate,
    end: endDate,
    isAllDay,
    context: text.slice(line.start, lastLine.end).trim(),
  };
}

function hasCertainDay(c: chrono.ParsedComponents) {
  return c.isCertain('day') || c.isCertain('weekday');
}

// Invitations often put the day and the time on separate lines, which chrono returns as two
// results: one with no time and one with no day. Join them when only a label or a few separator
// characters sit between them.
function pairDaysWithTimes(text: string, results: chrono.ParsedResult[]): DateMatch[] {
  const matches: DateMatch[] = [];
  for (let i = 0; i < results.length; i++) {
    const a = results[i];
    const b = results[i + 1];
    if (b && isShortGap(text.slice(a.index + a.text.length, b.index))) {
      const dayOnly = (r: chrono.ParsedResult) => hasCertainDay(r.start) && !r.start.isCertain('hour');
      const timeOnly = (r: chrono.ParsedResult) => r.start.isCertain('hour') && !hasCertainDay(r.start);
      const [day, time] = dayOnly(a) && timeOnly(b) ? [a, b] : timeOnly(a) && dayOnly(b) ? [b, a] : [];
      if (day && time) {
        matches.push({
          index: a.index,
          text: text.slice(a.index, b.index + b.text.length),
          start: onDay(day.start, time.start),
          end: time.end && onDay(day.start, time.end),
          paired: true,
        });
        i++;
        continue;
      }
    }
    matches.push(a);
  }
  return matches;
}

function isShortGap(gap: string) {
  return gap.length <= 40 && (gap.match(/\n/g) || []).length <= 2 && !/[\d.!?]/.test(gap);
}

// The calendar day of `day` at the clock time (and time zone, if stated) of `time`.
function onDay(day: chrono.ParsedComponents, time: chrono.ParsedComponents): chrono.ParsedComponents {
  const owner = (c: chrono.Component) => (c === 'year' || c === 'month' || c === 'day' || c === 'weekday' ? day : time);
  return {
    isCertain: (c) => owner(c).isCertain(c),
    get: (c) => owner(c).get(c),
    tags: () => new Set([...day.tags(), ...time.tags()]),
    date: () => {
      const y = day.get('year')!;
      const mo = day.get('month')! - 1;
      const d = day.get('day')!;
      const h = time.get('hour') ?? 0;
      const mi = time.get('minute') ?? 0;
      const sec = time.get('second') ?? 0;
      if (!time.isCertain('timezoneOffset')) return new Date(y, mo, d, h, mi, sec);
      return new Date(Date.UTC(y, mo, d, h, mi, sec) - time.get('timezoneOffset')! * 60 * 1000);
    },
  };
}

// chrono will happily read digits inside URLs, tracking codes and phone numbers as dates.
function looksLikePartOfToken(text: string, index: number, length: number) {
  const prev = text[index - 1] || ' ';
  const next = text[index + length] || ' ';
  return /[/=&#_\w-]/.test(prev) || /[/=&#_\w]/.test(next);
}

function lineAround(text: string, index: number) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const newline = text.indexOf('\n', index);
  const end = newline === -1 ? text.length : newline;
  // Text from HTML without block markup can be one enormous line; keep the window sentence-sized.
  return { start: Math.max(start, index - 160), end: Math.min(end, index + 200) };
}

function linesAround(text: string, index: number, extraLines: number) {
  let start = index;
  let end = index;
  for (let i = 0; i <= extraLines; i++) {
    const prev = text.lastIndexOf('\n', start - 2);
    start = prev === -1 ? 0 : prev + 1;
    const next = text.indexOf('\n', end + 1);
    end = next === -1 ? text.length : next;
  }
  return text.slice(Math.max(start, index - 300), Math.min(end, index + 300));
}

function durationMinutes(line: string): number | null {
  if (/\bhalf an hour\b/i.test(line)) return 30;
  if (/\b(an|one) hour and a half\b/i.test(line)) return 90;
  if (/\b(an|one)[- ]hour\b/i.test(line)) return 60;

  const hours = /\b(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?|h)\b/i.exec(line);
  const minutes = /\b(\d+)\s*-?\s*(?:minutes?|mins?)\b/i.exec(line);
  const total = (hours ? parseFloat(hours[1]) * 60 : 0) + (minutes ? parseInt(minutes[1], 10) : 0);
  return total >= 5 && total <= 12 * 60 ? Math.round(total) : null;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
