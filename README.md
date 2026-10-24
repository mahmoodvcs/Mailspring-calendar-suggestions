# Calendar Suggestions for Mailspring

A Mailspring plugin that notices when an email mentions a meeting, reservation or other dated
plan and shows a bar above the message offering to add it to your calendar. It doesn't use AI;
everything runs locally from rules.

- **Structured data first.** Airlines, hotels, ticketing sites and restaurant booking services
  often embed [schema.org](https://developers.google.com/workspace/gmail/markup/reference) data
  in their emails (the same data Gmail reads for its cards). Flights, trains, buses, hotel stays,
  restaurant and car reservations, and events are read from it exactly.
- **Dates in the text otherwise.** [chrono](https://github.com/wanasit/chrono) finds dates and
  times like "Tuesday at 3pm", "Oct 14, 10:00 AM EST" or "Friday 12–1:30pm". Relative dates are
  read from when the email was sent, so "tomorrow" means the day after it arrived.
- **Meeting links.** Zoom, Google Meet, Teams, Webex, Whereby, Jitsi, GoTo and Chime links become
  the event's location.

Clicking **Add to Calendar** opens an editable form (title, time, location, notes, calendar), so
nothing is saved without your say. Once added, the bar says so and links to the calendar. The ×
hides the bar for that message.

Requires Mailspring 1.26 or later, with at least one account that has a calendar you can add
events to.

## What gets suggested

To avoid a bar on every receipt and newsletter, a date found in the text is only suggested when:

- it has a day **and** a time, and a meeting word ("meet", "call", "interview", "lunch",
  "webinar"…) is on the same or a neighboring line, or the email has a meeting link; or
- it has a day but no time and an event noun ("conference", "wedding", "appointment",
  "check-in"…) is nearby, in which case it's suggested as an all-day event.

Dates are skipped when they've already passed, sit inside a URL, follow words like "shipped",
"ordered", "due", "expires" or "posted", or are part of an "On … wrote:" reply line. Quoted
replies are ignored. Messages with a real `.ics` invitation are skipped too, because Mailspring
already shows RSVP buttons for those. At most three suggestions are shown per email.

Limits:

- English only, for text. Structured data works whatever the language.
- Vague wording ("let's sync after the launch") isn't recognized.
- Numeric dates like `03/04` follow your system locale's day/month order.

## Install

```bash
npm install
npm run install-plugin       # builds, then copies into Mailspring's packages folder
```

Then restart Mailspring. To install by hand instead, run `npm run build` and choose
**Developer > Install a Plugin...** in Mailspring, selecting `dist/calendar-suggestions`.

To try it against a development build of Mailspring (`npm start` in a Mailspring checkout), use
`npm run install-plugin:dev`, which installs into the `Mailspring-dev` config folder.

To remove it, delete the `calendar-suggestions` folder from Mailspring's `packages` folder
(`%APPDATA%\Mailspring\packages` on Windows, `~/Library/Application Support/Mailspring/packages`
on macOS, `~/.config/Mailspring/packages` on Linux) and restart.

## Develop

| Command | Does |
| --- | --- |
| `npm run build` | Bundles `src/` into `dist/calendar-suggestions/` |
| `npm run watch` | Rebuilds on change |
| `npm test` | Runs the detection tests in `spec/` |
| `npm run typecheck` | Type-checks without emitting |

`src/detect/` has no Mailspring dependencies, so it can be tested in plain Node. To tune what
gets suggested, change the word lists in `src/detect/text-dates.ts` and add a case to
`spec/detect.spec.ts`.

Packaged Mailspring can't compile TypeScript, so the plugin ships as one bundled JavaScript file.
`mailspring-exports`, `mailspring-component-kit` and `electron` come from the running app and are
left out of the bundle. `chrono-node` is bundled because the app doesn't expose it to plugins.

`types/mailspring.d.ts` declares only the parts of Mailspring's API this plugin uses. Extend it
when you reach for something new.
