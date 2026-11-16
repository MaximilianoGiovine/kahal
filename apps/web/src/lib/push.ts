import { api } from './api';

export type PushStatus = 'loading' | 'unsupported' | 'needs-install' | 'unconfigured' | 'denied' | 'off' | 'on';

export const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Estado de este dispositivo y clave pública del servidor, necesaria para activar. */
export async function readPushStatus(): Promise<{ status: PushStatus; publicKey: string | null }> {
  // En iPhone, Safari solo ofrece notificaciones a la app agregada a la pantalla de inicio.
  if (isIos() && !isInstalled()) return { status: 'needs-install', publicKey: null };
  if (!isSupported()) return { status: 'unsupported', publicKey: null };
  const { publicKey } = await api<{ publicKey: string | null }>('/push/config');
  if (!publicKey) return { status: 'unconfigured', publicKey };
  if (Notification.permission === 'denied') return { status: 'denied', publicKey };
  return { status: Notification.permission === 'granted' && (await currentSubscription()) ? 'on' : 'off', publicKey };
}

function keyToBytes(key: string) {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** La suscripción se creó con la clave pública que el servidor usa ahora. Si cambiaron las claves VAPID, ningún aviso le llegaría. */
function sameKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = keyToBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function subscribe(registration: ServiceWorkerRegistration, publicKey: string) {
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
}

/** Se llama directo desde el toque del usuario: iOS rechaza pedir el permiso de otra forma. */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  // Una suscripción anterior puede estar atada a otra clave del servidor.
  const previous = await registration.pushManager.getSubscription();
  if (previous) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: previous.endpoint } }).catch(() => {});
    await previous.unsubscribe();
  }
  await subscribe(registration, publicKey);
  return 'on';
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint } });
}

/**
 * Al abrir la app: el navegador puede renovar la suscripción, quizá entró otra persona en el mismo teléfono,
 * o el servidor cambió sus claves. Con el permiso concedido, el dispositivo queda siempre atado a quien tiene la sesión.
 */
export async function syncPush() {
  if (!isSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { publicKey } = await api<{ publicKey: string | null }>('/push/config');
  if (!publicKey) return;
  if (sameKey(subscription, publicKey)) {
    await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
    return;
  }
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe();
  await subscribe(registration, publicKey);
}

/**
 * Al cerrar sesión: el servidor deja de avisarle a esta cuenta en este dispositivo, pero el navegador conserva la suscripción.
 * Así, quien vuelva a ingresar sigue recibiendo avisos sin tener que activarlos de nuevo.
 */
export async function detachPush() {
  const subscription = await currentSubscription();
  if (subscription) await api('/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
}

/** Solo olvida la suscripción de este dispositivo: tras borrar la cuenta ya no hay sesión para avisarle a la API. */
export async function forgetPushOnDevice() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
