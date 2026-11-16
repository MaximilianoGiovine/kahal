'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Camera, Images, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/dialog';
import { Badge, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

interface InstagramStatus {
  available: boolean;
  account: { username: string; invalid: boolean } | null;
}

interface InstagramPost {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  permalink: string;
  timestamp: string;
}

const ERRORS: Record<string, string> = {
  cancelled: 'Cancelaste la conexión con Instagram.',
  provider_error: 'No se pudo conectar la cuenta de Instagram. Revisa que sea una cuenta profesional (de empresa o de creador) y vuelve a intentarlo.',
};

/** Configuración → Iglesia: conecta la cuenta de Instagram para mostrar sus últimas publicaciones en la página pública. */
export function InstagramConnection({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['instagram'], queryFn: () => api<InstagramStatus>('/church/instagram') });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Resultado de volver de Instagram. Se lee sin useSearchParams para no exigir un Suspense en toda la página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('instagram');
    const failed = params.get('instagram_error');
    if (!result && !failed) return;
    if (result === 'connected') {
      toast.success('Cuenta de Instagram conectada');
      qc.invalidateQueries({ queryKey: ['instagram'] });
    }
    if (failed) toast.error(ERRORS[failed] ?? ERRORS.provider_error);
    window.history.replaceState(null, '', window.location.pathname);
  }, [qc]);

  const disconnect = useAction(() => api('/church/instagram', { method: 'DELETE' }), {
    success: 'Cuenta de Instagram desconectada',
    invalidate: [['instagram'], ['instagram-posts']],
    onSuccess: () => setDisconnecting(false),
  });

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await api<{ url: string }>('/church/instagram/start', { method: 'POST' });
      window.location.assign(url);
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar');
    }
  }

  if (!data?.available) return null;
  const account = data.account;

  return (
    <div className={clsx('flex flex-col gap-2 rounded-xl border border-border p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Instagram</p>
          {account ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              @{account.username}
              {account.invalid ? <Badge tone="warning">Hay que volver a conectarla</Badge> : <Badge tone="success">Conectada</Badge>}
            </p>
          ) : (
            <p className="text-sm text-muted">Conéctala para mostrar tus últimas 4 publicaciones en la página pública de la iglesia.</p>
          )}
        </div>
        <div className="flex gap-2">
          {account && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDisconnecting(true)}>
              Desconectar
            </Button>
          )}
          {(!account || account.invalid) && (
            <Button type="button" size="sm" loading={connecting} onClick={connect}>
              {account ? 'Volver a conectar' : 'Conectar con Instagram'}
            </Button>
          )}
        </div>
      </div>
      {account?.invalid && <p className="text-xs text-warning">Instagram dejó de dar acceso a la cuenta: puede que se haya quitado el permiso o cambiado la contraseña. Vuelve a conectarla.</p>}
      {!account && <p className="text-xs text-muted">Tiene que ser una cuenta profesional (de empresa o de creador). Kahal solo lee tus publicaciones: no publica nada.</p>}
      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
        danger
        title="Desconectar Instagram"
        message="Las publicaciones dejarán de aparecer en la página pública de la iglesia."
        confirmLabel="Desconectar"
      />
    </div>
  );
}

/** Últimas publicaciones de Instagram de la iglesia, sea cual sea su formato. No muestra nada si no hay cuenta conectada. */
export function InstagramFeed({ slug, className }: { slug: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ['instagram-posts', slug],
    queryFn: () => api<{ username: string | null; posts: InstagramPost[] }>(`/public/churches/${slug}/instagram`),
    staleTime: 10 * 60_000,
  });
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const posts = (data?.posts ?? []).filter((p) => p.imageUrl && !broken.has(p.id));
  if (!data?.username || posts.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">En Instagram</h2>
        <a href={`https://www.instagram.com/${data.username}/`} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-fg">
          @{data.username}
        </a>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {posts.map((p) => (
          <InstagramTile key={p.id} post={p} onBroken={() => setBroken((prev) => new Set(prev).add(p.id))} />
        ))}
      </div>
    </section>
  );
}

function InstagramTile({ post, onBroken }: { post: InstagramPost; onBroken: () => void }) {
  const [playing, setPlaying] = useState(false);
  const label = post.caption?.slice(0, 120) || 'Publicación de Instagram';

  // Los videos se reproducen aquí mismo; las fotos y los carruseles abren la publicación en Instagram.
  if (post.type === 'VIDEO' && post.videoUrl && playing) {
    return (
      <div className="aspect-square overflow-hidden rounded-2xl bg-black">
        <video src={post.videoUrl} poster={post.imageUrl ?? undefined} controls autoPlay playsInline className="size-full object-cover" />
      </div>
    );
  }

  const Icon = post.type === 'VIDEO' ? Play : post.type === 'CAROUSEL_ALBUM' ? Images : Camera;
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.imageUrl!} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={onBroken} className="size-full object-cover transition duration-300 group-hover:scale-105" />
      <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
        <Icon className={clsx('size-3.5', post.type === 'VIDEO' && 'fill-current')} />
      </span>
      {post.caption && (
        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent px-3 pt-6 pb-2 text-left text-xs text-white opacity-0 transition group-hover:opacity-100">
          {post.caption}
        </span>
      )}
    </>
  );
  const tile = 'group relative block aspect-square overflow-hidden rounded-2xl bg-surface-2';

  return post.type === 'VIDEO' && post.videoUrl ? (
    <button type="button" onClick={() => setPlaying(true)} className={tile} aria-label={`Reproducir: ${label}`}>
      {inner}
    </button>
  ) : (
    <a href={post.permalink} target="_blank" rel="noreferrer" className={tile} aria-label={label}>
      {inner}
    </a>
  );
}
