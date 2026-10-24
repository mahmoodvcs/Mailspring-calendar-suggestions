import { React, Actions, Calendar, localized } from 'mailspring-exports';
import { EventFields, defaultCalendar, loadWritableCalendars } from './calendar';
import { addDays, fromInput, toDateInput, toDateTimeInput } from './format';

interface AddEventPopoverProps {
  initial: EventFields;
  accountId: string;
  onSubmit: (fields: EventFields, calendar: Calendar) => void;
}

interface AddEventPopoverState {
  title: string;
  isAllDay: boolean;
  // Raw input values, so a half-typed date doesn't get reformatted under the cursor.
  start: string;
  end: string;
  location: string;
  description: string;
  calendars: Calendar[] | null;
  calendarId: string;
  error: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The suggestion, editable before it's saved. All-day end dates show the last day, inclusive. */
export class AddEventPopover extends React.Component<AddEventPopoverProps, AddEventPopoverState> {
  static displayName = 'CalendarSuggestionsAddEventPopover';

  _mounted = false;

  constructor(props: AddEventPopoverProps) {
    super(props);
    const { initial } = props;
    this.state = {
      title: initial.title,
      isAllDay: initial.isAllDay,
      start: initial.isAllDay ? toDateInput(initial.start) : toDateTimeInput(initial.start),
      end: initial.isAllDay
        ? toDateInput(new Date(initial.end.getTime() - DAY_MS))
        : toDateTimeInput(initial.end),
      location: initial.location || '',
      description: initial.description || '',
      calendars: null,
      calendarId: '',
      error: null,
    };
  }

  async componentDidMount() {
    this._mounted = true;
    const calendars = await loadWritableCalendars(this.props.accountId);
    if (!this._mounted) return;
    this.setState({ calendars, calendarId: defaultCalendar(calendars)?.id || '' });
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _onToggleAllDay = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isAllDay = e.target.checked;
    const start = fromInput(this.state.start);
    const end = fromInput(this.state.end);
    if (!start || !end) {
      this.setState({ isAllDay });
      return;
    }
    if (isAllDay) {
      this.setState({ isAllDay, start: toDateInput(start), end: toDateInput(end) });
    } else {
      const timedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9, 0);
      this.setState({
        isAllDay,
        start: toDateTimeInput(timedStart),
        end: toDateTimeInput(new Date(timedStart.getTime() + 60 * 60 * 1000)),
      });
    }
  };

  _onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { title, isAllDay, location, description, calendars, calendarId } = this.state;
    const start = fromInput(this.state.start);
    let end = fromInput(this.state.end);
    const calendar = (calendars || []).find((c) => c.id === calendarId);

    if (!start || !end) {
      this.setState({ error: localized('Enter a start and end.') });
      return;
    }
    if (isAllDay) end = addDays(end, 1);
    if (end <= start) {
      this.setState({ error: localized('The end must be after the start.') });
      return;
    }
    if (!calendar) {
      this.setState({ error: localized('Choose a calendar.') });
      return;
    }

    Actions.closePopover();
    this.props.onSubmit(
      { title: title.trim() || localized('Event'), start, end, isAllDay, location, description },
      calendar
    );
  };

  _renderCalendarPicker() {
    const { calendars, calendarId } = this.state;
    if (calendars === null) {
      return <div className="cs-field-note">{localized('Loading calendars…')}</div>;
    }
    if (calendars.length === 0) {
      return (
        <div className="cs-field-note cs-error">
          {localized('None of your accounts has a calendar you can add events to.')}
        </div>
      );
    }
    return (
      <select value={calendarId} onChange={(e) => this.setState({ calendarId: e.target.value })}>
        {calendars.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  render() {
    const { title, isAllDay, start, end, location, description, calendars, error } = this.state;
    const inputType = isAllDay ? 'date' : 'datetime-local';

    return (
      <form className="calendar-suggestions-popover" onSubmit={this._onSubmit}>
        <input
          className="cs-title-input"
          type="text"
          value={title}
          autoFocus
          placeholder={localized('Title')}
          onChange={(e) => this.setState({ title: e.target.value })}
        />

        <label className="cs-checkbox">
          <input type="checkbox" checked={isAllDay} onChange={this._onToggleAllDay} />
          {localized('All day')}
        </label>

        <div className="cs-row-pair">
          <label>
            <span>{localized('Starts')}</span>
            <input type={inputType} value={start} onChange={(e) => this.setState({ start: e.target.value })} />
          </label>
          <label>
            <span>{localized('Ends')}</span>
            <input type={inputType} value={end} onChange={(e) => this.setState({ end: e.target.value })} />
          </label>
        </div>

        <label>
          <span>{localized('Location')}</span>
          <input type="text" value={location} onChange={(e) => this.setState({ location: e.target.value })} />
        </label>

        <label>
          <span>{localized('Notes')}</span>
          <textarea rows={3} value={description} onChange={(e) => this.setState({ description: e.target.value })} />
        </label>

        <label>
          <span>{localized('Calendar')}</span>
          {this._renderCalendarPicker()}
        </label>

        {error && <div className="cs-field-note cs-error">{error}</div>}

        <div className="cs-buttons">
          <button type="button" className="btn" onClick={() => Actions.closePopover()}>
            {localized('Cancel')}
          </button>
          <button type="submit" className="btn btn-emphasis" disabled={!calendars || calendars.length === 0}>
            {localized('Add to Calendar')}
          </button>
        </div>
      </form>
    );
  }
}
