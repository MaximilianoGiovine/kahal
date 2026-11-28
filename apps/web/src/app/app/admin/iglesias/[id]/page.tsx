'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  FileSignature,
  HeartHandshake,
  Mail,
  MessageSquareText,
  Phone,
  QrCode,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ChurchQrDialog } from '@/components/church-qr';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, Stat, Tabs } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { ACTIVITY_ACTION_LABEL, ACTIVITY_ENTITY_LABEL, dateTime, fullName, money, number, relative, USER_STATUS_LABEL } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { UserStatus } from '@/lib/types';
import { AgreementDialog } from '../../avales/agreement-dialog';
import { ManageDonations } from '../../donaciones/manage';
import { STATE, type AdminDonation } from '../../donaciones/types';
import { DailyChart, type DayPoint } from '../../metricas/daily-chart';
import type { AdminChurchDetail } from '../../types';
import { CardLink, Row } from '../../widgets';

const day = (iso: string | null | undefined) => dateTime(iso, { dateStyle: 'medium' });

const USER_TONE: Record<UserStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  DISABLED: 'neutral',
};

const USAGE: { key: keyof AdminChurchDetail['counts']; label: string }[] = [
  { key: 'events', label: 'Eventos' },
  { key: 'announcements', label: 'Novedades' },
  { key: 'articles', label: 'Artículos' },
  { key: 'streams', label: 'Transmisiones' },
  { key: 'transactions', label: 'Movimientos' },
  { key: 'appointments', label: 'Citas' },
  { key: 'prayerRequests', label: 'Peticiones' },
  { key: 'ministries', label: 'Ministerios' },
  { key: 'families', label: 'Familias' },
  { key: 'campuses', label: 'Sedes' },
];

export default function AdminChurchPage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin, selectChurch, me } = useSession();
  const [qr, setQr] = useState(false);
  const [managing, setManaging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [agreement, setAgreement] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'churches', id],
    queryFn: () => api<AdminChurchDetail>(`/admin/churches/${id}`),
    enabled: isSuperAdmin,
  });
  const invalidate = [['admin']];
  const toggle = useAction((active: boolean) => api(`/admin/churches/${id}`, { method: 'PATCH', body: { active } }), { success: 'Iglesia actualizada', invalidate });
  const schedule = useAction((body: { confirm: string; password?: string }) => api(`/admin/churches/${id}/deletion`, { method: 'POST', body }), {
    success: 'Baja programada',
    invalidate,
    onSuccess: () => setClosing(false),
  });
  const cancelClosing = useAction(() => api(`/admin/churches/${id}/deletion`, { method: 'DELETE' }), { success: 'Baja cancelada', invalidate });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const { church: c, counts, billing } = data;
  const state = STATE[billing.state];
  const channels: [string, string][] = [];
  for (const [name, url] of [
    ['YouTube', c.youtubeUrl],
    ['Facebook', c.facebookUrl],
    ['Twitch', c.twitchUrl],
  ] as const)
    if (url) channels.push([name, url]);

  return (
    <>
      <Link href="/app/admin/iglesias" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Iglesias
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {c.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(c.logoKey)} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
          ) : (
            <Avatar name={{ firstName: c.name, lastName: c.name.split(' ')[1] ?? '' }} size={56} />
          )}
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-bold tracking-tight sm:text-[2rem]">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>
                /{c.slug}
                {c.city && ` · ${c.city}`}
              </span>
              <Badge tone={state.tone} title={state.help}>
                {state.label}
              </Badge>
              {!c.active && <Badge tone="danger">Deshabilitada</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setQr(true)}>
            <QrCode className="size-4" /> QR
          </Button>
          <Link href={`/i/${c.slug}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2">
            <ExternalLink className="size-4" /> Página pública
          </Link>
          <Button variant="secondary" size="sm" loading={toggle.isPending} onClick={() => toggle.mutate(!c.active)}>
            {c.active ? 'Deshabilitar' : 'Habilitar'}
          </Button>
          {c.deletionScheduledFor ? (
            <Button variant="secondary" size="sm" loading={cancelClosing.isPending} onClick={() => cancelClosing.mutate()}>
              Cancelar baja
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setClosing(true)}>
              Dar de baja
            </Button>
          )}
          <Link href="/app" onClick={() => selectChurch(c.id)} className="bg-accent-gradient inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-accent-fg">
            Operar
          </Link>
        </div>
      </div>

      {c.deletionScheduledFor && (
        <p className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Tiene la baja programada: sus datos se borran el {day(c.deletionScheduledFor)}. Puedes cancelarla hasta entonces.
        </p>
      )}

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Users />} label="Miembros" value={number(counts.members)} hint={c.campusesEnabled ? `${number(counts.campuses)} sedes` : 'Sin sedes'} />
          <Stat
            icon={<UserRound />}
            label="Cuentas de usuario"
            value={number(counts.users)}
            hint={data.usersByStatus.PENDING ? `${number(data.usersByStatus.PENDING)} esperan aprobación` : `${number(data.usersByStatus.ACTIVE)} activas`}
          />
          <Stat icon={<Activity />} label="Último ingreso" value={data.lastLoginAt ? relative(data.lastLoginAt) : 'Nunca'} hint={data.lastLoginAt ? day(data.lastLoginAt) : 'Nadie ingresó todavía'} />
          <Stat
            icon={<CalendarClock />}
            label="Activación"
            value={billing.access.until ? day(billing.access.until) : state.label}
            hint={billing.access.until ? (billing.access.blocked ? 'Venció' : 'Activa hasta esa fecha') : state.help}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <RegistrationsCard churchId={c.id} />
          <BillingCard data={data} onManage={() => setManaging(true)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader title="Uso de la app" description="Lo que la iglesia registró en Kahal." />
            <div className="grid grid-cols-2 gap-2 p-4">
              {USAGE.map((u) => (
                <div key={u.key} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <p className="text-xs text-muted">{u.label}</p>
                  <p className="font-display tabular text-lg font-semibold">{number(counts[u.key])}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Datos de la iglesia" />
            <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2.5 p-5 text-sm">
              <Info label="Correo" value={c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>} />
              <Info label="Teléfono" value={c.phone && <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>} />
              <Info label="Dirección" value={c.address} />
              <Info label="Zona horaria" value={c.timezone.replace(/_/g, ' ').replace(/\//g, ' / ')} />
              <Info label="Moneda" value={c.defaultCurrency} />
              <Info
                label="Canales"
                value={
                  channels.length > 0 &&
                  channels.map(([name, url], i) => (
                    <span key={name}>
                      {i > 0 && ' · '}
                      <a href={url} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
                        {name}
                      </a>
                    </span>
                  ))
                }
              />
              <Info label="Alta" value={day(c.createdAt)} />
              <Info
                label="Aval"
                value={
                  data.agreement && (
                    <button type="button" onClick={() => setAgreement(true)} className="inline-flex items-center gap-1 text-left text-accent-ink hover:underline">
                      <FileSignature className="size-3.5 shrink-0" />
                      {data.agreement.signerFirstName} {data.agreement.signerLastName} · contrato {data.agreement.contractVersion}
                    </button>
                  )
                }
              />
            </dl>
            {data.request?.message && (
              <div className="mx-5 mb-5 rounded-xl bg-surface-2 p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <MessageSquareText className="size-3.5" /> Mensaje de la solicitud · {day(data.request.createdAt)}
                </p>
                <p className="whitespace-pre-line">{data.request.message}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Administración" description="Quienes tienen el rol de administración." />
            {data.admins.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="size-5" />} title="Sin administradores" description="Nadie tiene el rol de administración en esta iglesia." />
            ) : (
              <ul className="divide-y divide-border">
                {data.admins.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={u} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(u)}</p>
                      <p className="truncate text-xs text-muted">{u.lastLoginAt ? `Ingresó ${relative(u.lastLoginAt)}` : 'Nunca ingresó'}</p>
                    </div>
                    <a href={`mailto:${u.email}`} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Escribir a ${u.email}`} title={u.email}>
                      <Mail className="size-4" />
                    </a>
                    {u.phone && (
                      <a href={`tel:${u.phone}`} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Llamar a ${u.phone}`} title={u.phone}>
                        <Phone className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Últimas cuentas" description={`${number(counts.users)} en total`} />
            {data.recentUsers.length === 0 ? (
              <EmptyState icon={<UserPlus className="size-5" />} title="Todavía no hay cuentas" />
            ) : (
              <ul className="p-3">
                {data.recentUsers.map((u) => (
                  <li key={u.id}>
                    <Row title={fullName(u)} subtitle={`${u.email} · ${relative(u.createdAt)}`} meta={<Badge tone={USER_TONE[u.status]}>{USER_STATUS_LABEL[u.status]}</Badge>} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Actividad reciente" description="Novedades, eventos, transmisiones y artículos." />
            {data.activity.length === 0 ? (
              <EmptyState icon={<Activity className="size-5" />} title="Sin actividad registrada" />
            ) : (
              <ul className="p-3">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <Row
                      title={a.title}
                      subtitle={`${a.user ? fullName(a.user) : 'Alguien'} · ${ACTIVITY_ACTION_LABEL[a.action].toLowerCase()} ${ACTIVITY_ENTITY_LABEL[a.entity].toLowerCase()}`}
                      meta={relative(a.createdAt)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {qr && <ChurchQrDialog church={c} onClose={() => setQr(false)} />}
      {managing && <ManageDonations church={billing} onClose={() => setManaging(false)} />}
      {agreement && data.agreement && <AgreementDialog id={data.agreement.id} onClose={() => setAgreement(false)} />}
      {closing && (
        <DeleteConfirm
          title={`Dar de baja ${c.name}`}
          description="Se avisa a quienes la administran y hay 30 días para cancelar. Después se borran sus usuarios, miembros, finanzas y archivos. Su aval se conserva."
          word={c.slug}
          askPassword={me.hasPassword}
          confirmLabel="Programar la baja"
          loading={schedule.isPending}
          onClose={() => setClosing(false)}
          onConfirm={(values) => schedule.mutate(values)}
        />
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-subtle">—</span>}</dd>
    </>
  );
}

const PERIODS = ['30', '90'] as const;

function RegistrationsCard({ churchId }: { churchId: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('90');
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'registrations', period, churchId],
    queryFn: () => api<{ current: number; previous: number; daily: DayPoint[] }>('/admin/registrations', { query: { days: period, churchId } }),
    placeholderData: (previous) => previous,
  });
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Cuentas nuevas por día"
        description={data ? `${number(data.current)} en ${period} días · ${number(data.previous)} en los ${period} anteriores` : undefined}
        action={<Tabs value={period} onChange={setPeriod} items={PERIODS.map((p) => ({ value: p, label: `${p} días` }))} />}
      />
      <div className="p-5">{isLoading ? <Loading /> : error || !data ? <ErrorState error={error} /> : <DailyChart data={data.daily} />}</div>
    </Card>
  );
}

function BillingCard({ data, onManage }: { data: AdminChurchDetail; onManage: () => void }) {
  const { billing } = data;
  const history = useQuery({
    queryKey: ['admin', 'billing', billing.id, 'donations'],
    queryFn: () => api<AdminDonation[]>(`/admin/billing/churches/${billing.id}/donations`),
  });
  const state = STATE[billing.state];
  return (
    <Card className="flex flex-col">
      <CardHeader title="Donaciones" action={<CardLink href="/app/admin/donaciones">Todas</CardLink>} />
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <Badge tone={state.tone}>{state.label}</Badge>
          <p className="mt-2 text-muted">{state.help}</p>
          {billing.billingExemptNote && <p className="mt-1 text-xs text-muted">Nota: {billing.billingExemptNote}</p>}
        </div>
        <Button className="w-full" onClick={onManage}>
          <HeartHandshake className="size-4" /> Registrar o gestionar
        </Button>
      </div>
      <div className="border-t border-border p-3">
        {history.isLoading ? (
          <Loading />
        ) : !history.data?.length ? (
          <p className="px-2 py-3 text-sm text-muted">Todavía no tiene donaciones registradas.</p>
        ) : (
          <ul>
            {history.data.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Row
                  title={d.amount !== null && d.currency ? money(d.amount, d.currency) : 'Sin importe'}
                  subtitle={`${day(d.receivedAt)} · cubre hasta el ${day(d.coversUntil)}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
