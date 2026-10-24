import {
  Actions,
  Calendar,
  DatabaseStore,
  DateUtils,
  Event,
  ICSEventHelpers,
  SyncbackEventTask,
  TaskQueue,
} from 'mailspring-exports';

export interface EventFields {
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

const LAST_CALENDAR_KEY = 'calendar-suggestions.last-calendar';

/**
 * Calendars an event can be added to, the message's own account first. Calendars hidden in the
 * calendar window are left out, matching what the calendar's own "new event" offers.
 */
export async function loadWritableCalendars(preferredAccountId: string): Promise<Calendar[]> {
  const all = await DatabaseStore.findAll<Calendar>(Calendar);
  const disabled: string[] = AppEnv.config.get('mailspring.disabledCalendars') || [];
  return all
    .filter((c) => !c.readOnly && !disabled.includes(c.id))
    .sort((a, b) => Number(b.accountId === preferredAccountId) - Number(a.accountId === preferredAccountId));
}

export function defaultCalendar(calendars: Calendar[]): Calendar | undefined {
  let lastId: string | null = null;
  try {
    lastId = window.localStorage.getItem(LAST_CALENDAR_KEY);
  } catch {
    // storage unavailable; fall back to the first calendar
  }
  return calendars.find((c) => c.id === lastId) || calendars[0];
}

/**
 * Queues the event for the sync engine and resolves once the server has it. Rejects with the
 * sync engine's message if the server refused it.
 */
export async function addToCalendar(fields: EventFields, calendar: Calendar): Promise<void> {
  try {
    window.localStorage.setItem(LAST_CALENDAR_KEY, calendar.id);
  } catch {
    // remembering the choice is a convenience only
  }

  const icsuid = ICSEventHelpers.generateUID();
  const ics = ICSEventHelpers.createICSString({
    uid: icsuid,
    summary: fields.title,
    start: fields.start,
    end: fields.end,
    isAllDay: fields.isAllDay,
    timezone: DateUtils.timeZone,
    location: fields.location || undefined,
    description: fields.description || undefined,
  });

  const event = new Event({
    calendarId: calendar.id,
    accountId: calendar.accountId,
    ics,
    icsuid,
    recurrenceStart: Math.floor(fields.start.getTime() / 1000),
    recurrenceEnd: Math.floor(fields.end.getTime() / 1000),
  });
  event.title = fields.title;

  const task = SyncbackEventTask.forCreating({
    event,
    calendarId: calendar.id,
    accountId: calendar.accountId,
  });
  Actions.queueTask(task);

  const finished = await TaskQueue.waitForPerformRemote(task);
  if (finished && finished.error) {
    const { error } = finished;
    throw new Error(typeof error === 'string' ? error : error.message || JSON.stringify(error));
  }
}
