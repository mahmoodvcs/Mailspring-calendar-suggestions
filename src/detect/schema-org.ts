// Reads schema.org JSON-LD that airlines, hotels, ticketing sites and restaurants embed in their
// emails (https://developers.google.com/workspace/gmail/markup/reference). When present it is
// exact, so it takes priority over anything guessed from the text.
import { decodeEntities } from './html-to-text';

export interface EventDraft {
  title?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

interface SchemaDate {
  date: Date;
  dateOnly: boolean;
}

type Node = { [key: string]: any };

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LD_JSON_SCRIPT =
  /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

export function findSchemaOrgEvents(html: string): EventDraft[] {
  const drafts: EventDraft[] = [];
  for (const node of extractJsonLdNodes(html)) {
    for (const draft of interpret(node)) {
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

export function extractJsonLdNodes(html: string): Node[] {
  const nodes: Node[] = [];
  for (const match of html.matchAll(LD_JSON_SCRIPT)) {
    const parsed = parseJson(match[1]);
    if (parsed !== undefined) flatten(parsed, nodes);
  }
  return nodes;
}

// Some senders HTML-escape the JSON inside the script tag, so retry with entities decoded.
function parseJson(raw: string): unknown {
  for (const candidate of [raw, decodeEntities(raw)]) {
    try {
      return JSON.parse(candidate.trim().replace(/^<!--|-->$/g, ''));
    } catch {
      // try the next form
    }
  }
  return undefined;
}

function flatten(value: unknown, out: Node[]) {
  if (Array.isArray(value)) {
    value.forEach((v) => flatten(v, out));
  } else if (value && typeof value === 'object') {
    const node = value as Node;
    if (Array.isArray(node['@graph'])) flatten(node['@graph'], out);
    if (node['@type']) out.push(node);
  }
}

function typesOf(node: Node): string[] {
  const raw = node && node['@type'];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((t) => typeof t === 'string')
    .map((t: string) => t.replace(/^https?:\/\/schema\.org\//, ''));
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function isCancelled(status: unknown) {
  return typeof status === 'string' && /cancel/i.test(status);
}

function parseSchemaDate(value: unknown): SchemaDate | null {
  const s = str(value);
  if (!s) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return { date: new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]), dateOnly: true };
  }
  const date = new Date(s);
  return isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

function addressText(address: unknown): string | undefined {
  if (typeof address === 'string') return str(address);
  if (!address || typeof address !== 'object') return undefined;
  const a = address as Node;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
    .map((p) => str(typeof p === 'object' && p ? p.name : p))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function placeText(place: unknown): string | undefined {
  const first = toArray(place)[0];
  if (typeof first === 'string') return str(first);
  if (!first || typeof first !== 'object') return undefined;
  const p = first as Node;
  if (typesOf(p).includes('VirtualLocation')) return str(p.url) || str(p.name);
  const name = str(p.name);
  const address = addressText(p.address);
  if (name && address && !address.includes(name)) return `${name}, ${address}`;
  return name || address || str(p.url);
}

function joinLines(...lines: (string | undefined)[]): string | undefined {
  const kept = lines.filter(Boolean);
  return kept.length ? kept.join('\n') : undefined;
}

function draft(opts: {
  title?: string;
  start: SchemaDate | null;
  end?: SchemaDate | null;
  location?: string;
  description?: string;
}): EventDraft | null {
  const { start, end } = opts;
  if (!start) return null;

  const isAllDay = start.dateOnly && (!end || end.dateOnly);
  let endDate: Date;
  if (isAllDay) {
    // schema.org end dates are the last day covered; calendar ends are exclusive.
    endDate = new Date((end || start).date.getTime() + DAY_MS);
  } else if (end && end.date > start.date) {
    endDate = end.date;
  } else {
    endDate = new Date(start.date.getTime() + DEFAULT_DURATION_MS);
  }

  return {
    title: opts.title,
    start: start.date,
    end: endDate,
    isAllDay,
    location: opts.location,
    description: opts.description,
  };
}

function interpret(node: Node): (EventDraft | null)[] {
  const types = typesOf(node);
  const reservationType = types.find((t) => t.endsWith('Reservation'));
  if (reservationType) return interpretReservation(node, reservationType);
  if (types.some((t) => t.endsWith('Event'))) return [interpretEvent(node)];
  return [];
}

function interpretEvent(e: Node, extraDescription?: string): EventDraft | null {
  if (!e || typeof e !== 'object' || isCancelled(e.eventStatus)) return null;
  return draft({
    title: str(e.name),
    start: parseSchemaDate(e.startDate),
    end: parseSchemaDate(e.endDate),
    location: placeText(e.location),
    description: joinLines(extraDescription, str(e.url)),
  });
}

function code(entity: Node | undefined): string | undefined {
  if (!entity || typeof entity !== 'object') return str(entity);
  return str(entity.iataCode) || str(entity.name);
}

function route(from: string | undefined, to: string | undefined) {
  return from && to ? ` ${from} → ${to}` : '';
}

function interpretReservation(r: Node, type: string): (EventDraft | null)[] {
  if (isCancelled(r.reservationStatus)) return [];
  const targets: Node[] = toArray(r.reservationFor);
  const confirmation = str(r.reservationNumber) && `Confirmation: ${str(r.reservationNumber)}`;

  switch (type) {
    case 'FlightReservation':
      // One reservation per leg is the norm, but some senders list every leg in reservationFor.
      return targets.map((f) => {
        const flightNumber = [code(f.airline), str(f.flightNumber)].filter(Boolean).join(' ');
        return draft({
          title: `Flight ${flightNumber}${route(code(f.departureAirport), code(f.arrivalAirport))}`.trim(),
          start: parseSchemaDate(f.departureTime),
          end: parseSchemaDate(f.arrivalTime),
          location: placeText(f.departureAirport),
          description: confirmation,
        });
      });

    case 'TrainReservation':
    case 'BusReservation':
    case 'BoatReservation': {
      const label = { TrainReservation: 'Train', BusReservation: 'Bus', BoatReservation: 'Ferry' }[type];
      return targets.map((t) => {
        const from = t.departureStation || t.departureBusStop || t.departureBoatTerminal;
        const to = t.arrivalStation || t.arrivalBusStop || t.arrivalBoatTerminal;
        const number = str(t.trainNumber) || str(t.busNumber) || '';
        return draft({
          title: `${label} ${number}${route(placeText(from), placeText(to))}`.replace(/\s+/g, ' ').trim(),
          start: parseSchemaDate(t.departureTime),
          end: parseSchemaDate(t.arrivalTime),
          location: placeText(from),
          description: confirmation,
        });
      });
    }

    case 'LodgingReservation': {
      const hotel = targets[0] || {};
      return [
        draft({
          title: str(hotel.name) ? `Stay at ${str(hotel.name)}` : 'Hotel stay',
          start: parseSchemaDate(r.checkinTime ?? r.checkinDate),
          end: parseSchemaDate(r.checkoutTime ?? r.checkoutDate),
          location: placeText(hotel),
          description: confirmation,
        }),
      ];
    }

    case 'FoodEstablishmentReservation': {
      const restaurant = targets[0] || {};
      const party = str(r.partySize) && `Party of ${str(r.partySize)}`;
      return [
        draft({
          title: str(restaurant.name) ? `Reservation at ${str(restaurant.name)}` : 'Restaurant reservation',
          start: parseSchemaDate(r.startTime),
          end: parseSchemaDate(r.endTime),
          location: placeText(restaurant),
          description: joinLines(party, confirmation),
        }),
      ];
    }

    case 'RentalCarReservation': {
      const company = str(r.provider?.name) || str(targets[0]?.brand?.name);
      return [
        draft({
          title: company ? `Car rental: ${company}` : 'Car rental',
          start: parseSchemaDate(r.pickupTime),
          end: parseSchemaDate(r.dropoffTime),
          location: placeText(r.pickupLocation),
          description: confirmation,
        }),
      ];
    }

    case 'EventReservation':
      return targets.map((e) => interpretEvent(e, confirmation));

    default:
      return targets.map((t) =>
        draft({
          title: str(t.name),
          start: parseSchemaDate(r.startTime ?? t.startDate ?? t.startTime),
          end: parseSchemaDate(r.endTime ?? t.endDate ?? t.endTime),
          location: placeText(t.location) || addressText(t.address),
          description: confirmation,
        })
      );
  }
}
