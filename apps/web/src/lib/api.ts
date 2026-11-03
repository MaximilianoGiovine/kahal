export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

const CHURCH_KEY = 'kahal:church';

/** Iglesia elegida por el super admin (se envía como x-church-id). */
export function getActiveChurch(): string | null {
  try {
    return localStorage.getItem(CHURCH_KEY);
  } catch {
    return null;
  }
}

export function setActiveChurch(id: string | null) {
  try {
    if (id) localStorage.setItem(CHURCH_KEY, id);
    else localStorage.removeItem(CHURCH_KEY);
  } catch {
    /* sin storage */
  }
}

/** Endpoints de auth que no usan la sesión: un 401 ahí no se resuelve renovándola. */
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/change-password'];

/** ok: renovada · expired: hay que volver a ingresar · error: falla transitoria (sin red, servidor caído). */
type RefreshResult = 'ok' | 'expired' | 'error';

let refreshing: Promise<RefreshResult> | null = null;
let lastRefresh = 0;

function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r): RefreshResult => (r.ok ? 'ok' : r.status === 401 ? 'expired' : 'error'))
    .catch((): RefreshResult => 'error')
    .then((r) => {
      if (r === 'ok') lastRefresh = Date.now();
      return r;
    })
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

const KEEPALIVE_MS = 10 * 60_000;

/**
 * Mantiene la sesión viva mientras la app está abierta: renueva antes de que venza el
 * access token (15 min) y al volver a la app (PWA reabierta, pestaña en segundo plano).
 * Cada renovación extiende también la sesión recordada. Devuelve la función de limpieza.
 */
export function keepSessionAlive() {
  const tick = () => {
    if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastRefresh >= KEEPALIVE_MS) void refreshSession();
  };
  const timer = setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('online', tick);
  };
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, unknown> };

function buildUrl(path: string, query?: Record<string, unknown>) {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function headers(extra?: HeadersInit, json = true) {
  const h = new Headers(extra);
  if (json) h.set('Content-Type', 'application/json');
  const church = getActiveChurch();
  if (church) h.set('x-church-id', church);
  return h;
}

async function raw(path: string, opts: Options = {}, retry = true): Promise<Response> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(buildUrl(path, opts.query), {
    ...opts,
    credentials: 'include',
    headers: headers(opts.headers, !isForm && opts.body !== undefined),
    body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && retry && !NO_REFRESH.includes(path)) {
    const result = await refreshSession();
    if (result === 'ok') return raw(path, opts, false);
    // Ante una falla transitoria no se manda al login: el pedido falla y se puede reintentar.
    if (result === 'expired' && typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      // "expired" evita que el middleware rebote a /app si quedó la cookie kahal_session.
      window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await raw(path, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Respuesta que no es JSON: típicamente la API caída y el proxy devolviendo "Internal Server Error".
    throw new ApiError(res.status, res.ok ? 'Respuesta inválida del servidor' : 'No se pudo conectar con el servidor. Probá de nuevo en unos minutos.');
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(res.status, msg || 'Ocurrió un error inesperado', data);
  }
  return data as T;
}

/** Descarga un archivo (Excel) respetando la sesión. */
export async function download(path: string, query?: Record<string, unknown>) {
  const res = await raw(path, { query });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo generar el archivo');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'export.xlsx';
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function upload(file: File, kind: 'logo' | 'image' | 'receipt' | 'photo') {
  const fd = new FormData();
  fd.append('file', file);
  return api<{ key: string; url: string }>('/files', { method: 'POST', body: fd, query: { kind } });
}

export const fileUrl = (key?: string | null) => (key ? `/api/files/${key}` : undefined);
