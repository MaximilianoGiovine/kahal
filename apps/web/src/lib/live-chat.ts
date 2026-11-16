import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, openEventStream } from './api';

export interface ChatMessage {
  id: string;
  userId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

interface ChatState {
  open: boolean;
  welcome: string | null;
  canModerate: boolean;
  messages: ChatMessage[];
}

type ChatEvent = { type: 'message'; message: ChatMessage } | { type: 'deleted'; id: string } | { type: 'closed' };

/** Mensajes que se conservan en pantalla: el resto queda en el registro. */
const MAX_MESSAGES = 300;

const sortByDate = (list: ChatMessage[]) => list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_MESSAGES);

/** Lee eventos SSE de un cuerpo de respuesta y llama a `onEvent` con cada uno. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (type: string, data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let type = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      onEvent(type, data.join('\n'));
    }
  }
}

/**
 * Chat de una transmisión en vivo: carga los mensajes y queda escuchando los nuevos.
 * Se reconecta solo si se corta la red; al terminar la transmisión el servidor manda `closed` y el chat se cierra.
 */
export function useLiveChat(streamId: string | null) {
  const qc = useQueryClient();
  const [state, setState] = useState<ChatState | null>(null);
  const [connected, setConnected] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    setState(null);
    setConnected(false);
    closedRef.current = false;
    if (!streamId) return;

    const abort = new AbortController();
    let retry = 0;

    const load = async () => {
      const fresh = await api<ChatState>(`/live-chat/streams/${streamId}`);
      if (abort.signal.aborted) return;
      // Lo que llegó por el canal mientras se cargaba el historial se conserva.
      setState((prev) => {
        const byId = new Map([...fresh.messages, ...(prev?.messages ?? [])].map((m) => [m.id, m]));
        return { ...fresh, messages: sortByDate([...byId.values()]) };
      });
      if (!fresh.open) closedRef.current = true;
    };

    const onEvent = (type: string, data: string) => {
      if (type === 'ready') {
        retry = 0;
        setConnected(true);
        void load().catch(() => {});
        return;
      }
      if (type === 'ping') return;
      let event: ChatEvent;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      if (event.type === 'message') {
        setState((prev) => prev && (prev.messages.some((m) => m.id === event.message.id) ? prev : { ...prev, messages: sortByDate([...prev.messages, event.message]) }));
      } else if (event.type === 'deleted') {
        setState((prev) => prev && { ...prev, messages: prev.messages.filter((m) => m.id !== event.id) });
      } else if (event.type === 'closed') {
        closedRef.current = true;
        setState((prev) => prev && { ...prev, open: false });
        qc.invalidateQueries({ queryKey: ['streams'] });
      }
    };

    (async () => {
      while (!abort.signal.aborted && !closedRef.current) {
        try {
          const res = await openEventStream(`/live-chat/events/${streamId}`, abort.signal);
          if (res.status === 404 || res.status === 403 || res.status === 401) {
            // Sin acceso o la transmisión ya no existe: no tiene sentido insistir.
            setState((prev) => prev ?? { open: false, welcome: null, canModerate: false, messages: [] });
            return;
          }
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          await readEvents(res.body, onEvent);
        } catch {
          if (abort.signal.aborted) return;
        }
        setConnected(false);
        if (closedRef.current) return;
        // Espera creciente entre intentos, hasta 30 segundos.
        retry += 1;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5))));
      }
    })();

    return () => abort.abort();
  }, [streamId, qc]);

  const send = useCallback(
    async (body: string) => {
      const message = await api<ChatMessage>(`/live-chat/streams/${streamId}/messages`, { method: 'POST', body: { body } });
      setState((prev) => prev && (prev.messages.some((m) => m.id === message.id) ? prev : { ...prev, messages: sortByDate([...prev.messages, message]) }));
    },
    [streamId],
  );

  const remove = useCallback(async (id: string) => {
    await api(`/live-chat/messages/${id}`, { method: 'DELETE' });
    setState((prev) => prev && { ...prev, messages: prev.messages.filter((m) => m.id !== id) });
  }, []);

  return { state, connected, send, remove };
}
