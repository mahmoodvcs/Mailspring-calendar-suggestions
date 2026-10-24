import { findMeetingLink } from './meeting-links';
import { findSchemaOrgEvents, EventDraft } from './schema-org';
import { findTextEvents } from './text-dates';
import { DetectInput, EventSuggestion } from './types';

export * from './types';
export { htmlToText, stripQuotedPlainText } from './html-to-text';

const MAX_SUGGESTIONS = 3;

export function cleanSubject(subject: string): string {
  return (subject || '')
    .replace(/^\s*((re|fwd?|aw|wg|sv|vs|tr|rif|antw)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .trim();
}

export function detectEvents(input: DetectInput & { dayFirst?: boolean }): EventSuggestion[] {
  const now = input.now || new Date();
  const fallbackTitle = cleanSubject(input.subject) || 'Event';
  const meeting = findMeetingLink(input.html);

  // Structured data is authoritative, and receipts that carry it are full of unrelated dates
  // (booking date, payment date) that the text scan would only add noise to.
  const structured = findSchemaOrgEvents(input.html).filter((d) => d.end > now);
  if (structured.length) {
    return dedupe(structured).slice(0, MAX_SUGGESTIONS).map((d, i) => ({
      key: `schema:${d.start.getTime()}:${i}`,
      source: 'schema.org' as const,
      title: d.title || fallbackTitle,
      start: d.start,
      end: d.end,
      isAllDay: d.isAllDay,
      location: d.location,
      description: d.description,
    }));
  }

  const found = findTextEvents(input.text, {
    sentAt: input.sentAt,
    now,
    hasMeetingLink: !!meeting,
    dayFirst: input.dayFirst,
  });

  return dedupe(found).slice(0, MAX_SUGGESTIONS).map((d) => ({
    key: `text:${d.start.getTime()}:${d.isAllDay ? 'day' : 'time'}`,
    source: 'text' as const,
    title: fallbackTitle,
    start: d.start,
    end: d.end,
    isAllDay: d.isAllDay,
    location: d.isAllDay ? undefined : meeting?.url,
    description: [d.context, meeting && `${meeting.provider}: ${meeting.url}`].filter(Boolean).join('\n\n'),
    context: d.context,
  }));
}

// An email often repeats its date ("Tuesday at 3pm … see you Tuesday at 3pm"); keep the first.
function dedupe<T extends EventDraft>(drafts: T[]): T[] {
  const seen = new Set<string>();
  return drafts.filter((d) => {
    const key = `${d.start.getTime()}:${d.isAllDay}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
