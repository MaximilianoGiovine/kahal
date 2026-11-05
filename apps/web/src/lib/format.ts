import type { ActivityAction, ActivityEntity, AppointmentStatus, Currency, UserRoles, UserStatus } from './types';

let tz = 'America/Argentina/Buenos_Aires';
export const setTimezone = (t: string) => (tz = t);
export const getTimezone = () => tz;

const moneyFmt = new Map<string, Intl.NumberFormat>();
export function money(value: string | number, currency: Currency = 'ARS', opts: { compact?: boolean } = {}) {
  const key = `${currency}:${opts.compact}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      // Sin compactar, cada moneda usa sus propios decimales: el yen o el guaraní no tienen.
      ...(opts.compact && { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
      notation: opts.compact ? 'compact' : 'standard',
    });
    moneyFmt.set(key, f);
  }
  return f.format(Number(value));
}

export const number = (n: number) => new Intl.NumberFormat('es-AR').format(n);

/** Fechas "solo día" (columnas DATE): se formatean en UTC para no correrse un día. */
export function dayLabel(iso: string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium') {
  if (!iso) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : style === 'long' ? { dateStyle: 'long' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('es-AR', { ...opts, timeZone: 'UTC' }).format(new Date(iso));
}

export function dateTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-AR', { hourCycle: 'h23', ...opts, timeZone: tz }).format(new Date(iso));
}

export const time = (iso: string) => dateTime(iso, { hour: '2-digit', minute: '2-digit' });
export const weekdayLong = (iso: string) => dateTime(iso, { weekday: 'long', day: 'numeric', month: 'long' });

export function relative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return 'recién';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return dayLabel(iso);
}

/** "YYYY-MM-DD" de hoy en la zona de la iglesia. */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

export function monthRange(offset = 0) {
  const [y, m] = todayISO().split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export const monthLabel = (ym: string, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('es-AR', { month: style, year: style === 'long' ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));

export const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');
export const initials = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();

/** Nombres de los roles de un usuario; sin roles es un miembro con acceso básico. */
export const roleNames = (u?: { isSuperAdmin?: boolean; roles?: UserRoles } | null) =>
  u?.isSuperAdmin ? 'Super admin' : u?.roles?.length ? u.roles.map((r) => r.role.name).join(', ') : 'Miembro';

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Activo',
  REJECTED: 'Rechazado',
  DISABLED: 'Deshabilitado',
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Realizada',
};

export const ACTIVITY_ACTION_LABEL: Record<ActivityAction, string> = {
  CREATE: 'Creó',
  UPDATE: 'Modificó',
  DELETE: 'Eliminó',
};

export const ACTIVITY_ENTITY_LABEL: Record<ActivityEntity, string> = {
  ANNOUNCEMENT: 'Novedad',
  EVENT: 'Evento',
  STREAM: 'Transmisión',
  ARTICLE: 'Artículo',
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function tzOffsetMs(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - date.getTime();
}

/** ISO UTC → valor para <input type="datetime-local"> en la zona de la iglesia. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() + tzOffsetMs(d, tz)).toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (zona de la iglesia) → ISO UTC. */
export function fromLocalInput(value: string) {
  if (!value) return null;
  const guess = new Date(`${value}:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, tz)).toISOString();
}

/** Identificador de URL a partir del nombre de una iglesia. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^iglesia\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
