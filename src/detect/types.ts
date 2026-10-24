export type SuggestionSource = 'schema.org' | 'text';

export interface EventSuggestion {
  /** Stable within one message, so "added" state can be remembered per suggestion. */
  key: string;
  source: SuggestionSource;
  title: string;
  start: Date;
  /** Exclusive. For all-day events this is midnight after the last covered day. */
  end: Date;
  isAllDay: boolean;
  location?: string;
  description?: string;
  /** The sentence the date was found in, shown so the user can judge the guess. */
  context?: string;
}

export interface DetectInput {
  /** The message body, quoted replies included; structured data can sit anywhere in it. */
  html: string;
  /** Text of the message with quoted replies and signatures already removed. */
  text: string;
  subject: string;
  /** Relative dates ("tomorrow at 3") are read relative to when the message was sent. */
  sentAt: Date;
  now?: Date;
}
