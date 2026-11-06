'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PROVIDER_NAMES, SocialButtons } from '@/components/social-auth';
import { Button, ButtonLink, Checkbox, Field, Input, Loading, Select } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { oauthErrorMessage, type PendingIdentity } from '@/lib/oauth';

export function RegisterForm() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const preset = params.get('iglesia') ?? '';
  const { data: churches = [], isLoading: loadingChurches } = useQuery({
    queryKey: ['public-churches'],
    queryFn: () => api<{ name: string; slug: string; city: string | null; logoKey: string | null }[]>('/public/churches'),
  });
  // Viene de Google o Apple sin cuenta en Kahal: esa cuenta aporta el email y reemplaza a la contraseña.
  const social = !!params.get('social');
  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ['oauth-pending'],
    queryFn: () => api<{ pending: PendingIdentity | null }>('/auth/oauth/pending'),
    enabled: social,
  });
  const pending = pendingData?.pending ?? null;
  // Llegando desde el QR (o el link) de una iglesia, queda fija y no se elige de la lista.
  const [changing, setChanging] = useState(false);
  const fixed = changing ? undefined : churches.find((c) => c.slug === preset);
  const [step, setStep] = useState<1 | 2>(1);
  const [account, setAccount] = useState<{ church: string; email: string; password?: string } | null>(null);
  const [error, setError] = useState<string | null>(() => oauthErrorMessage(params.get('oauth_error')));
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { data: registering } = useQuery({
    queryKey: ['public-church', account?.church],
    queryFn: () => api<{ campuses: { id: string; name: string; city: string | null }[] }>(`/public/churches/${account?.church}`),
    enabled: !!account?.church,
  });
  const campuses = registering?.campuses ?? [];

  /** Paso 1: cuenta (iglesia, email y contraseña). Se valida el email antes de pedir el resto. */
  async function onAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') !== fd.get('password2')) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const email = pending?.email ?? String(fd.get('email')).trim();
    setLoading(true);
    setError(null);
    try {
      const { available } = await api<{ available: boolean }>('/auth/email-available', { query: { email } });
      if (!available) {
        setError('Ya existe una cuenta con ese email. Si es tuya, ingresa con tu contraseña.');
        return;
      }
      setAccount({ church: String(fd.get('church')), email, password: pending ? undefined : String(fd.get('password')) });
      setStep(2);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar el email');
    } finally {
      setLoading(false);
    }
  }

  /** Paso 2: datos personales; crea la cuenta y deja la sesión iniciada. */
  async function onProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: {
          churchSlug: account.church,
          email: account.email,
          password: account.password,
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          documentId: fd.get('documentId'),
          birthDate: fd.get('birthDate'),
          baptized: fd.get('baptized') === 'skip' ? undefined : fd.get('baptized') === 'yes',
          phone: fd.get('phone'),
          address: fd.get('address'),
          campusId: fd.get('campusId') || undefined,
          consent: fd.get('consent') === 'on',
        },
      });
      qc.clear();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
    } finally {
      setLoading(false);
    }
  }

  const back = () => (setError(null), setStep(1));
  const errorBox = error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>;
  const today = new Date().toISOString().slice(0, 10);

  if (social && loadingPending) return <Loading />;

  if (done) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <p className="mt-4 font-medium">¡Tu cuenta está lista!</p>
        <p className="mt-1 text-sm text-muted">Ya iniciaste sesión: vas a seguir conectado/a en este dispositivo.</p>
        <ButtonLink href="/app" className="mt-6">
          Entrar a la app
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-xs font-medium tracking-wide text-muted uppercase">
        Paso {step} de 2 · {step === 1 ? 'Tu cuenta' : 'Tus datos'}
      </p>

      {/* Ambos pasos quedan montados: al volver atrás no se pierde lo escrito. */}
      <form onSubmit={onAccount} className={step === 1 ? 'flex flex-col gap-4' : 'hidden'}>
        {fixed ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <input type="hidden" name="church" value={fixed.slug} />
            {fixed.logoKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(fixed.logoKey)} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <span className="font-display flex size-10 items-center justify-center rounded-lg bg-accent font-semibold text-accent-fg">{fixed.name[0]}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Te vas a registrar en</p>
              <p className="truncate font-medium">{fixed.name}</p>
            </div>
            <button type="button" onClick={() => setChanging(true)} className="text-xs text-muted hover:text-fg hover:underline">
              Cambiar
            </button>
          </div>
        ) : preset && loadingChurches ? null : (
          <Field label="Iglesia">
            <Select name="church" required defaultValue={preset} key={churches.length}>
              <option value="" disabled>
                Elige tu iglesia
              </option>
              {churches.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                  {c.city ? ` · ${c.city}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {pending ? (
          <Field label="Correo electrónico" hint={`Vas a ingresar con tu cuenta de ${PROVIDER_NAMES[pending.provider]}, sin contraseña.`}>
            <Input value={pending.email} disabled />
          </Field>
        ) : (
          <>
            <Field label="Correo electrónico">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres.">
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repetir contraseña">
              <Input name="password2" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
          </>
        )}
        {step === 1 && errorBox}
        <Button type="submit" loading={loading} className="mt-2">
          Continuar
        </Button>
        {!pending && <SocialButtons iglesia={preset} />}
      </form>

      <form onSubmit={onProfile} className={step === 2 ? 'flex flex-col gap-4' : 'hidden'}>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Nombre completo</legend>
          <div className="grid grid-cols-2 gap-3">
            <Input name="firstName" required minLength={2} maxLength={60} defaultValue={pending?.firstName} placeholder="Nombre(s)" aria-label="Nombre(s)" autoComplete="given-name" />
            <Input name="lastName" required minLength={2} maxLength={60} defaultValue={pending?.lastName} placeholder="Apellido(s)" aria-label="Apellido(s)" autoComplete="family-name" />
          </div>
        </fieldset>
        <Field label="Número de documento">
          <Input name="documentId" required minLength={4} maxLength={30} inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input name="birthDate" type="date" required max={today} autoComplete="bday" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">¿Estás bautizado/a?</legend>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
              { value: 'skip', label: 'No responder' },
            ].map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input type="radio" name="baptized" value={o.value} required className="peer sr-only" />
                <span className="flex h-10 items-center justify-center rounded-lg border border-border text-sm transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
                  {o.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Número de teléfono">
          <Input name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel" />
        </Field>
        <Field label="Dirección del domicilio">
          <Input name="address" required minLength={4} maxLength={200} autoComplete="street-address" />
        </Field>
        {campuses.length > 0 && (
          <Field label="¿A qué sede asistes?">
            <Select name="campusId" defaultValue="">
              <option value="">Todavía no lo sé</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? ` · ${c.city}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Checkbox
          name="consent"
          required
          label={
            <span className="text-muted">
              Leí y acepto la{' '}
              <Link href="/privacidad" target="_blank" className="font-medium text-accent-ink underline">
                Política de Privacidad
              </Link>
              . Autorizo a la iglesia y a Kahal a tratar mis datos, incluidos los que revelan mi pertenencia religiosa, para gestionar mi membresía y comunicar actividades.
            </span>
          }
        />
        {step === 2 && errorBox}
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-3">
          <Button type="button" variant="secondary" onClick={back}>
            <ArrowLeft className="size-4" /> Volver
          </Button>
          <Button type="submit" loading={loading}>
            Crear cuenta
          </Button>
        </div>
      </form>
    </>
  );
}
