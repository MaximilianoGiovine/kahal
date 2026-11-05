/** Generación de iCalendar (RFC 5545) para las suscripciones de Google Calendar, Apple Calendar y Outlook. */

export interface IcsEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
}

/** Sin hora de fin cargada, el evento ocupa una hora en el calendario. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const escapeText = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?|\n/g, '\\n');

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Corta en líneas de hasta 75 bytes, sin partir un carácter multibyte (acentos, emojis). */
function fold(line: string) {
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > 75) {
      out.push(current);
      current = ' ';
      size = 1;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n');
}

export function buildCalendar(calendar: { name: string; timezone: string; events: IcsEvent[] }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kahal//Agenda de la iglesia//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `X-WR-TIMEZONE:${calendar.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const event of calendar.events) {
    const end = event.endsAt && event.endsAt > event.startsAt ? event.endsAt : new Date(event.startsAt.getTime() + DEFAULT_DURATION_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@kahal`,
      `DTSTAMP:${stamp(event.updatedAt)}`,
      `LAST-MODIFIED:${stamp(event.updatedAt)}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
