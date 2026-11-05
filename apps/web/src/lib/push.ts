import { api } from './api';

export type PushStatus = 'loading' | 'unsupported' | 'needs-install' | 'unconfigured' | 'denied' | 'off' | 'on';

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

/** Se llama directo desde el toque del usuario: iOS rechaza pedir el permiso de otra forma. */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  // Una suscripción anterior puede estar atada a otra clave del servidor.
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
  return 'on';
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint } });
}

/** Al abrir la app: el navegador puede renovar la suscripción, o quizá entró otra persona en el mismo teléfono. */
export async function syncPush() {
  if (!isSupported() || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (subscription) await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
}
