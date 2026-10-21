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

let refreshing: Promise<boolean> | null = null;

function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
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
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return raw(path, opts, false);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await raw(path, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
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
