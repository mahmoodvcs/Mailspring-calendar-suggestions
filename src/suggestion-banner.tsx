import { ipcRenderer } from 'electron';
import { React, Actions, Calendar, Message, QuotedHTMLTransformer, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { detectEvents, htmlToText, stripQuotedPlainText, EventSuggestion } from './detect';
import { addToCalendar, EventFields } from './calendar';
import { AddEventPopover } from './add-event-popover';
import { formatWhen, localeIsDayFirst } from './format';
import { getMessageState, markAdded, markDismissed } from './suggestion-state';

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'added'; calendarName: string }
  | { kind: 'error'; message: string };

const detectionCache = new Map<string, EventSuggestion[]>();
const MAX_CACHE = 200;

function hasInvitation(message: Message) {
  // The events plugin already shows RSVP controls for messages carrying a real invitation.
  return (message.files || []).some(
    (f) => /\.(ics|vcs)$/i.test(f.filename || '') || f.contentType === 'text/calendar'
  );
}

function suggestionsFor(message: Message): EventSuggestion[] {
  const body = message.body;
  if (!body || message.draft || hasInvitation(message)) return [];

  const cacheKey = `${message.id}:${body.length}`;
  const cached = detectionCache.get(cacheKey);
  if (cached) return cached;

  let suggestions: EventSuggestion[] = [];
  try {
    const text = message.plaintext
      ? stripQuotedPlainText(body)
      : htmlToText(QuotedHTMLTransformer.removeQuotedHTML(body));
    suggestions = detectEvents({
      html: body,
      text,
      subject: message.subject,
      sentAt: message.date || new Date(),
      dayFirst: localeIsDayFirst(),
    });
  } catch (err) {
    console.warn('calendar-suggestions: detection failed', err);
  }

  if (detectionCache.size >= MAX_CACHE) {
    detectionCache.delete(detectionCache.keys().next().value);
  }
  detectionCache.set(cacheKey, suggestions);
  return suggestions;
}

function openCalendarWindow() {
  ipcRenderer.send('command', 'application:show-calendar');
}

interface BannerProps {
  message: Message;
  suggestions: EventSuggestion[];
}

interface BannerState {
  dismissed: boolean;
  statuses: { [key: string]: RowStatus };
}

class SuggestionBanner extends React.Component<BannerProps, BannerState> {
  static displayName = 'CalendarSuggestionBanner';

  _mounted = false;

  constructor(props: BannerProps) {
    super(props);
    const saved = getMessageState(props.message.id);
    const statuses: { [key: string]: RowStatus } = {};
    for (const key of saved.added || []) {
      statuses[key] = { kind: 'added', calendarName: '' };
    }
    this.state = { dismissed: !!saved.dismissed, statuses };
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _setStatus(key: string, status: RowStatus) {
    if (!this._mounted) return;
    this.setState((prev) => ({ statuses: { ...prev.statuses, [key]: status } }));
  }

  _onDismiss = () => {
    markDismissed(this.props.message.id);
    this.setState({ dismissed: true });
  };

  _onOpenEditor = (suggestion: EventSuggestion, e: React.MouseEvent<HTMLElement>) => {
    const fields: EventFields = {
      title: suggestion.title,
      start: suggestion.start,
      end: suggestion.end,
      isAllDay: suggestion.isAllDay,
      location: suggestion.location,
      description: suggestion.description,
    };
    Actions.openPopover(
      <AddEventPopover
        initial={fields}
        accountId={this.props.message.accountId}
        onSubmit={(edited, calendar) => this._save(suggestion.key, edited, calendar)}
      />,
      { originRect: e.currentTarget.getBoundingClientRect(), direction: 'down' }
    );
  };

  async _save(key: string, fields: EventFields, calendar: Calendar) {
    this._setStatus(key, { kind: 'saving' });
    try {
      await addToCalendar(fields, calendar);
      markAdded(this.props.message.id, key);
      this._setStatus(key, { kind: 'added', calendarName: calendar.name });
    } catch (err) {
      this._setStatus(key, { kind: 'error', message: err.message || String(err) });
    }
  }

  _renderAction(suggestion: EventSuggestion) {
    const status = this.state.statuses[suggestion.key] || { kind: 'idle' };
    switch (status.kind) {
      case 'saving':
        return <span className="cs-status">{localized('Adding…')}</span>;
      case 'added':
        return (
          <span className="cs-status cs-added">
            {status.calendarName
              ? localized('Added to %@', status.calendarName)
              : localized('Added to calendar')}
            {' · '}
            <a onClick={openCalendarWindow}>{localized('Open Calendar')}</a>
          </span>
        );
      case 'error':
        return (
          <span className="cs-status cs-error" title={status.message}>
            {localized("Couldn't add it.")}{' '}
            <a onClick={(e) => this._onOpenEditor(suggestion, e)}>{localized('Try again')}</a>
          </span>
        );
      default:
        return (
          <button className="btn cs-add" onClick={(e) => this._onOpenEditor(suggestion, e)}>
            {localized('Add to Calendar')}
          </button>
        );
    }
  }

  render() {
    if (this.state.dismissed) return null;
    const { suggestions } = this.props;

    return (
      <div className="calendar-suggestions">
        <div className="cs-header">
          <RetinaImg name="icon-RSVP-calendar-mini@2x.png" mode={RetinaImg.Mode.ContentPreserve} />
          <span className="cs-heading">
            {suggestions.length === 1
              ? localized('This email mentions an event')
              : localized('This email mentions %@ events', suggestions.length)}
          </span>
          <span className="cs-dismiss" title={localized('Dismiss')} onClick={this._onDismiss}>
            ×
          </span>
        </div>
        {suggestions.map((s) => (
          <div className="cs-row" key={s.key}>
            <div className="cs-details">
              <div className="cs-when">{formatWhen(s)}</div>
              <div className="cs-what">
                {s.title}
                {s.location ? <span className="cs-location"> · {s.location}</span> : null}
              </div>
              {s.context && s.context !== s.title && (
                <div className="cs-context" title={s.context}>
                  “{s.context}”
                </div>
              )}
            </div>
            <div className="cs-actions">{this._renderAction(s)}</div>
          </div>
        ))}
      </div>
    );
  }
}

export const SuggestionBannerContainer: React.FunctionComponent<{ message: Message }> = ({ message }) => {
  const suggestions = suggestionsFor(message);
  return suggestions.length ? (
    <SuggestionBanner key={message.id} message={message} suggestions={suggestions} />
  ) : null;
};

SuggestionBannerContainer.displayName = 'CalendarSuggestionBannerContainer';
