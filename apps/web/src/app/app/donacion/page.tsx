'use client';

import { useQuery } from '@tanstack/react-query';
import { ChurchClosure } from '@/components/church-closure';
import { Badge, Card, CardHeader, ErrorState, Loading, PageHeader, td, th } from '@/components/ui';
import { WhatsappButton } from '@/components/whatsapp-button';
import { billingQuery, WHATSAPP_MESSAGES, type BillingAccess } from '@/lib/billing';
import { dayLabel, money } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';

function status(access: BillingAccess): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string } {
  if (!access.activated) return { label: 'Pendiente de activación', tone: 'warning', text: 'Escríbenos por WhatsApp para coordinar la donación: cuando la recibamos, activamos todas las funciones de tu iglesia.' };
  if (!access.until) return { label: 'Activa', tone: 'success', text: 'Tu iglesia no necesita donación para usar Kahal.' };
  if (access.blocked) return { label: 'Vencida', tone: 'danger', text: `La donación venció el ${dayLabel(access.until, 'long')}. El acceso se restablece al registrar la próxima, y los datos se conservan.` };
  if (access.reminder) return { label: 'Por vencer', tone: 'warning', text: `Tu iglesia está activa hasta el ${dayLabel(access.until, 'long')}. Prepara la próxima donación para que siga activa.` };
  return { label: 'Activa', tone: 'success', text: `Tu iglesia está activa hasta el ${dayLabel(access.until, 'long')}.` };
}

export default function DonationPage() {
  const { me, church } = useSession();
  const allowed = can.churchSettings(me);
  const { data, isLoading, error, refetch } = useQuery({ ...billingQuery, enabled: allowed && !!church });

  if (!allowed) return <ErrorState error={new Error('No tienes permisos para gestionar la donación')} />;

  const name = church?.name ?? '';
  return (
    <>
      <PageHeader title="Donación" description="Kahal se sostiene con la donación mensual de cada iglesia. Todas las iglesias tienen acceso a las mismas funciones." />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="mx-auto max-w-2xl space-y-5">
          <Card>
            <CardHeader title="Estado de tu iglesia" action={<Badge tone={status(data.access).tone}>{status(data.access).label}</Badge>} />
            <div className="space-y-4 p-5 text-sm">
              <p className="text-muted">{status(data.access).text}</p>
              {/* Las exentas no tienen fecha ni necesitan coordinar nada. */}
              {(data.access.until !== null || !data.access.activated) && (
                <WhatsappButton
                  phone={data.supportWhatsapp}
                  message={data.access.activated ? WHATSAPP_MESSAGES.renewal(name) : WHATSAPP_MESSAGES.activation(name)}
                  label="Coordinar por WhatsApp"
                />
              )}
            </div>
          </Card>

          {data.donations.length > 0 && (
            <Card>
              <CardHeader title="Donaciones recibidas" />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>Fecha</th>
                      <th className={th}>Importe</th>
                      <th className={th}>Activa hasta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.donations.map((d) => (
                      <tr key={d.id}>
                        <td className={`${td} text-muted`}>{dayLabel(d.receivedAt)}</td>
                        <td className={`${td} tabular`}>{d.amount !== null && d.currency ? money(d.amount, d.currency) : '—'}</td>
                        <td className={`${td} text-muted`}>{dayLabel(d.coversUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {data.access.blocked && data.access.activated && church && <ChurchClosure church={{ slug: church.slug, deletionScheduledFor: null }} />}
        </div>
      )}
    </>
  );
}
