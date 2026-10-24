import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectEvents, htmlToText, stripQuotedPlainText, cleanSubject } from '../src/detect';

// Thursday, 1 October 2026, 09:00 local time.
const SENT = new Date(2026, 9, 1, 9, 0);

function detectText(text: string, extra: { html?: string; subject?: string; now?: Date; dayFirst?: boolean } = {}) {
  return detectEvents({
    html: extra.html ?? text,
    text,
    subject: extra.subject ?? 'Budget review',
    sentAt: SENT,
    now: extra.now ?? SENT,
    dayFirst: extra.dayFirst,
  });
}

function ldJson(data: unknown, escape = false) {
  const json = JSON.stringify(data);
  return `<html><head><script type="application/ld+json">${escape ? json.replace(/"/g, '&quot;') : json}</script></head><body>Thanks for booking.</body></html>`;
}

describe('schema.org markup', () => {
  it('reads a flight reservation', () => {
    const html = ldJson({
      '@context': 'http://schema.org',
      '@type': 'FlightReservation',
      reservationNumber: 'RXJ34P',
      reservationStatus: 'http://schema.org/ReservationConfirmed',
      reservationFor: {
        '@type': 'Flight',
        flightNumber: '110',
        airline: { '@type': 'Airline', name: 'United', iataCode: 'UA' },
        departureAirport: { '@type': 'Airport', name: 'San Francisco Airport', iataCode: 'SFO' },
        departureTime: '2026-10-20T20:15:00-07:00',
        arrivalAirport: { '@type': 'Airport', name: 'John F. Kennedy International Airport', iataCode: 'JFK' },
        arrivalTime: '2026-10-21T04:30:00-04:00',
      },
    });
    const [s, ...rest] = detectText('Thanks for booking.', { html });
    assert.equal(rest.length, 0);
    assert.equal(s.source, 'schema.org');
    assert.equal(s.title, 'Flight UA 110 SFO → JFK');
    assert.equal(s.start.toISOString(), '2026-10-21T03:15:00.000Z');
    assert.equal(s.end.toISOString(), '2026-10-21T08:30:00.000Z');
    assert.equal(s.isAllDay, false);
    assert.match(s.description, /RXJ34P/);
  });

  it('treats date-only events as all-day, with an exclusive end', () => {
    const html = ldJson({
      '@context': 'https://schema.org',
      '@type': 'MusicEvent',
      name: 'Jazz in the Park',
      startDate: '2026-10-24',
      endDate: '2026-10-25',
      location: { '@type': 'Place', name: 'Central Park', address: { addressLocality: 'New York' } },
    });
    const [s] = detectText('', { html });
    assert.equal(s.title, 'Jazz in the Park');
    assert.equal(s.isAllDay, true);
    assert.deepEqual(s.start, new Date(2026, 9, 24));
    assert.deepEqual(s.end, new Date(2026, 9, 26));
    assert.equal(s.location, 'Central Park, New York');
  });

  it('accepts HTML-escaped JSON and @graph wrappers', () => {
    const html = ldJson(
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'FoodEstablishmentReservation',
            startTime: '2026-10-09T19:30:00',
            partySize: 4,
            reservationFor: { '@type': 'FoodEstablishment', name: 'Chez Panisse' },
          },
        ],
      },
      true
    );
    const [s] = detectText('', { html });
    assert.equal(s.title, 'Reservation at Chez Panisse');
    assert.deepEqual(s.start, new Date(2026, 9, 9, 19, 30));
    assert.match(s.description, /Party of 4/);
  });

  it('ignores cancelled reservations and past events', () => {
    const cancelled = ldJson({
      '@type': 'EventReservation',
      reservationStatus: 'http://schema.org/ReservationCancelled',
      reservationFor: { '@type': 'Event', name: 'Gala', startDate: '2026-11-01T19:00:00' },
    });
    const past = ldJson({ '@type': 'Event', name: 'Old', startDate: '2026-09-01T19:00:00' });
    assert.equal(detectText('', { html: cancelled }).length, 0);
    assert.equal(detectText('', { html: past }).length, 0);
  });

  it('skips the text scan when structured data is present', () => {
    const html = ldJson({ '@type': 'Event', name: 'Launch', startDate: '2026-10-15T10:00:00' });
    const found = detectText('Booked on Oct 1. Call us Friday at 3pm with questions about the meeting.', { html });
    assert.equal(found.length, 1);
    assert.equal(found[0].title, 'Launch');
  });
});

describe('dates in text', () => {
  it('finds a weekday and time near a meeting word, relative to the sent date', () => {
    const [s, ...rest] = detectText('Hi Sam,\nCan we meet Tuesday at 3pm to go over the numbers?\nThanks');
    assert.equal(rest.length, 0);
    assert.equal(s.source, 'text');
    assert.equal(s.title, 'Budget review');
    assert.deepEqual(s.start, new Date(2026, 9, 6, 15, 0));
    assert.deepEqual(s.end, new Date(2026, 9, 6, 16, 0));
    assert.equal(s.context, 'Can we meet Tuesday at 3pm to go over the numbers?');
  });

  it('uses a meeting link as the location and honors an explicit time zone', () => {
    const text = 'Topic: Design sync\nTime: Oct 13, 2026 10:00 AM Eastern Time (US and Canada)\nJoin: https://us02web.zoom.us/j/81234567890?pwd=abc';
    const [s] = detectText(text, { html: `<p>${text.replace(/\n/g, '</p><p>')}</p>` });
    assert.ok(s, 'expected a suggestion');
    assert.equal(s.location, 'https://us02web.zoom.us/j/81234567890?pwd=abc');
    assert.match(s.description, /Zoom: https:\/\/us02web\.zoom\.us/);
  });

  it('converts a time given in another zone', () => {
    const [s] = detectText('Interview on October 14 at 10:00 AM EST.');
    assert.equal(s.start.toISOString(), '2026-10-14T15:00:00.000Z');
  });

  it('reads a time range and a stated duration', () => {
    const [range] = detectText('Lunch Friday 12-1:30pm?');
    assert.deepEqual(range.start, new Date(2026, 9, 2, 12, 0));
    assert.deepEqual(range.end, new Date(2026, 9, 2, 13, 30));

    const [call] = detectText('Quick 30-minute call tomorrow at 9am?');
    assert.deepEqual(call.start, new Date(2026, 9, 2, 9, 0));
    assert.deepEqual(call.end, new Date(2026, 9, 2, 9, 30));
  });

  it('suggests an all-day event for a dated event noun', () => {
    const [s] = detectText('The conference is on November 12, hope to see you there.');
    assert.equal(s.isAllDay, true);
    assert.deepEqual(s.start, new Date(2026, 10, 12));
    assert.deepEqual(s.end, new Date(2026, 10, 13));
  });

  it('honors day-first dates when the locale writes them that way', () => {
    const [s] = detectText('Meeting on 03/11 at 14:00 in room 4.', { dayFirst: true });
    assert.deepEqual(s.start, new Date(2026, 10, 3, 14, 0));
  });

  it('joins a day and a time given on separate lines', () => {
    const text = [
      'I am writing to confirm the details of your next interview.',
      '',
      'Date: Monday, 26 October 2026',
      'Time: 1:00 PM - 2:00 PM (AEDT)',
      'Mode: MS Teams',
    ].join('\n');
    const [s, ...rest] = detectText(text);
    assert.equal(rest.length, 0);
    assert.equal(s.isAllDay, false);
    assert.equal(s.start.toISOString(), '2026-10-26T02:00:00.000Z');
    assert.equal(s.end.toISOString(), '2026-10-26T03:00:00.000Z');
    assert.equal(s.context, 'Date: Monday, 26 October 2026\nTime: 1:00 PM - 2:00 PM (AEDT)');

    const [local] = detectText('When: Tuesday\nAt: 3pm\nLet me know if the call still works.');
    assert.deepEqual(local.start, new Date(2026, 9, 6, 15, 0));
  });

  it('dedupes a repeated date', () => {
    const found = detectText('Meeting Tuesday at 3pm.\nReminder: see you Tuesday at 3pm!');
    assert.equal(found.length, 1);
  });

  for (const [label, text] of [
    ['a date with no time and no event noun', "I'll send the draft on Friday."],
    ['a date and time with nothing meeting-like nearby', 'Sale ends Friday at midnight. Shop now!'],
    ['a shipping notice', 'Your order shipped on Oct 5 at 3pm and the meeting point is the front desk.'],
    ['a dated receipt line', 'Date: Monday, 26 October 2026\nThanks for your booking.'],
    ['a reply attribution','On Mon, Oct 5, 2026 at 3:00 PM Alice <a@b.com> wrote:'],
    ['digits inside a URL', 'Join the meeting notes at https://example.com/2026/10/12/agenda'],
    ['a date that has passed', 'Meeting yesterday at 3pm went well.'],
  ]) {
    it(`ignores ${label}`, () => {
      assert.deepEqual(detectText(text), []);
    });
  }
});

describe('text helpers', () => {
  it('turns HTML into readable lines', () => {
    const text = htmlToText(
      '<style>p{}</style><div>Hello&nbsp;there</div><p>Tea at <b>4pm</b> &amp; cake</p><table><tr><td>A</td><td>B</td></tr></table>'
    );
    assert.equal(text, 'Hello there\nTea at 4pm & cake\nA B');
  });

  it('drops quoted plain-text replies', () => {
    const text = stripQuotedPlainText('Sounds good.\n\nOn Mon, Oct 5, 2026 at 3:00 PM Alice <a@b.com>\nwrote:\n> Lunch Tuesday at noon?');
    assert.equal(text, 'Sounds good.');
  });

  it('cleans reply prefixes from subjects', () => {
    assert.equal(cleanSubject('Re: Fwd: RE: Quarterly planning'), 'Quarterly planning');
  });
});
