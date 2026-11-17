'use client';

import { HandHeart, MessageCircle, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { time } from '@/lib/format';
import { useLiveChat, type ChatMessage } from '@/lib/live-chat';
import { useSession } from '@/lib/session';
import { clsx } from 'clsx';
import { Button, Card, Spinner } from './ui';

const MAX_LENGTH = 500;

/**
 * Chat de la transmisión en vivo. Solo aparece mientras la transmisión está en vivo y la iglesia lo tiene activado;
 * al terminar se cierra y la conversación pasa al Registro.
 */
export function LiveChat({ streamId, className }: { streamId: string; className?: string }) {
  const { me } = useSession();
  const { state, connected, send, remove } = useLiveChat(streamId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const count = state?.messages.length ?? 0;
  // Baja sola con cada mensaje nuevo, salvo que la persona haya subido a leer lo anterior.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [count, state?.welcome]);

  useEffect(() => {
    stickRef.current = true;
  }, [streamId]);

  if (state && !state.open) return null;

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await send(body);
      setText('');
      stickRef.current = true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const onRemove = (m: ChatMessage) =>
    remove(m.id).catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo quitar el mensaje'));

  return (
    <Card className={clsx('flex min-h-0 flex-col overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="size-4 text-accent-ink" />
        <p className="text-sm font-semibold">Chat en vivo</p>
        <span className={clsx('ml-auto flex items-center gap-1.5 text-xs', connected ? 'text-success' : 'text-muted')}>
          <span className={clsx('size-1.5 rounded-full', connected ? 'bg-current' : 'bg-muted')} />
          {connected ? 'Conectado' : 'Conectando…'}
        </span>
      </div>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {!state ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {state.welcome && (
              <div className="flex gap-2.5 rounded-xl bg-accent-soft px-3 py-2.5 text-sm">
                <HandHeart className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                <p className="whitespace-pre-line">{state.welcome}</p>
              </div>
            )}
            {state.messages.length === 0 && <p className="py-6 text-center text-sm text-muted">Sé la primera persona en saludar.</p>}
            {state.messages.map((m) => {
              const own = m.userId === me.id;
              return (
                <div key={m.id} className="group flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className={clsx('font-semibold', own ? 'text-accent-ink' : 'text-fg')}>{m.authorName}</span>
                      <span className="ml-1.5 text-subtle tabular">{time(m.createdAt)}</span>
                    </p>
                    <p className="text-sm break-words whitespace-pre-line">{m.body}</p>
                  </div>
                  {(own || state.canModerate) && (
                    <button
                      type="button"
                      onClick={() => onRemove(m)}
                      className="rounded-md p-1 text-subtle opacity-100 hover:bg-surface-2 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      aria-label="Quitar mensaje"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Escribe un mensaje…"
          aria-label="Mensaje"
          disabled={!state}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        <Button type="submit" loading={sending} disabled={!text.trim() || !state} aria-label="Enviar">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </Card>
  );
}
