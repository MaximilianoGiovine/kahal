'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/dialog';
import { Button, Card, CardHeader, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { oauthErrorMessage, type ProviderSlug } from '@/lib/oauth';
import { useSession } from '@/lib/session';

export const PROVIDER_NAMES = { GOOGLE: 'Google', APPLE: 'Apple' } as const;

const PROVIDERS: { slug: ProviderSlug; key: keyof typeof PROVIDER_NAMES; Icon: () => React.JSX.Element }[] = [
  { slug: 'google', key: 'GOOGLE', Icon: GoogleIcon },
  { slug: 'apple', key: 'APPLE', Icon: AppleIcon },
];

function useProviders() {
  return useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => api<Record<ProviderSlug, boolean>>('/auth/oauth/providers'),
    staleTime: 5 * 60_000,
  });
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8L20 3.2A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.8 1.3 10.35.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.14ZM14.47 4.9c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45Z" />
    </svg>
  );
}

/** Acceso con Google y Apple. Solo aparece lo que la instalación tiene configurado. */
export function SocialButtons({ next, iglesia }: { next?: string | null; iglesia?: string | null }) {
  const { data } = useProviders();
  const enabled = PROVIDERS.filter((p) => data?.[p.slug]);
  if (enabled.length === 0) return null;

  const query = new URLSearchParams({ ...(next && { next }), ...(iglesia && { iglesia }) }).toString();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
      </div>
      {enabled.map(({ slug, key, Icon }) => (
        // Navegación completa: la API redirige al proveedor.
        <a key={slug} href={`/api/auth/oauth/${slug}/start${query ? `?${query}` : ''}`} className={buttonClass('secondary', 'md', 'w-full')}>
          <Icon /> Continuar con {PROVIDER_NAMES[key]}
        </a>
      ))}
    </div>
  );
}

/** Cuentas de Google/Apple conectadas a la sesión actual (en Mi perfil). */
export function ConnectedAccounts() {
  const { me } = useSession();
  const qc = useQueryClient();
  const { data } = useProviders();
  const [unlinking, setUnlinking] = useState<(typeof PROVIDERS)[number] | null>(null);
  const [connecting, setConnecting] = useState<ProviderSlug | null>(null);

  const unlink = useAction((slug: ProviderSlug) => api(`/auth/identities/${slug}`, { method: 'DELETE' }), {
    success: 'Cuenta desconectada',
    invalidate: [['me']],
    onSuccess: () => setUnlinking(null),
  });

  // Resultado de volver del proveedor. Se lee sin useSearchParams para no exigir un Suspense en toda la página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('oauth_linked');
    const failed = oauthErrorMessage(params.get('oauth_error'));
    if (!linked && !failed) return;
    if (linked) {
      toast.success('Cuenta conectada');
      qc.invalidateQueries({ queryKey: ['me'] });
    }
    if (failed) toast.error(failed);
    window.history.replaceState(null, '', window.location.pathname);
  }, [qc]);

  async function connect(slug: ProviderSlug) {
    setConnecting(slug);
    try {
      // Si el access token venció, esto lo renueva: la API necesita la sesión para saber a quién conectar.
      await api('/auth/me');
      window.location.assign(`/api/auth/oauth/${slug}/start?mode=link`);
    } catch (err) {
      setConnecting(null);
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar');
    }
  }

  const rows = PROVIDERS.map((p) => ({ ...p, identity: me.identities.find((i) => i.provider === p.key) })).filter((p) => p.identity || data?.[p.slug]);
  if (rows.length === 0) return null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Cuentas conectadas" />
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.slug} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <row.Icon />
              <div className="min-w-0">
                <p className="text-sm font-medium">{PROVIDER_NAMES[row.key]}</p>
                <p className="truncate text-xs text-muted">{row.identity ? (row.identity.email ?? 'Conectada') : 'Sin conectar'}</p>
              </div>
            </div>
            {row.identity ? (
              <Button variant="ghost" size="sm" onClick={() => setUnlinking(row)}>
                Desconectar
              </Button>
            ) : (
              <Button variant="secondary" size="sm" loading={connecting === row.slug} onClick={() => connect(row.slug)}>
                Conectar
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!unlinking}
        onClose={() => setUnlinking(null)}
        onConfirm={() => unlinking && unlink.mutate(unlinking.slug)}
        loading={unlink.isPending}
        danger
        title="Desconectar cuenta"
        message={`Ya no vas a poder ingresar a Kahal con ${unlinking ? PROVIDER_NAMES[unlinking.key] : ''}.`}
        confirmLabel="Desconectar"
      />
    </Card>
  );
}
