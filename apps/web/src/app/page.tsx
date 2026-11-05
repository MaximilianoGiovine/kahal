import { CalendarClock, HandCoins, Megaphone, MonitorPlay, Users } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { ButtonLink } from '@/components/ui';
import { ChurchDirectory } from './church-directory';

const FEATURES = [
  { icon: HandCoins, title: 'Finanzas claras', text: 'Ingresos, egresos, diezmos por miembro y reportes listos para exportar a Excel.' },
  { icon: Users, title: 'Membresía', text: 'Padrón de miembros, familias y ministerios; cada persona se registra sola escaneando el QR de su iglesia.' },
  { icon: Megaphone, title: 'Novedades y agenda', text: 'Anuncios y eventos que llegan a toda la congregación en su celular.' },
  { icon: MonitorPlay, title: 'Transmisiones', text: 'Los cultos en vivo de YouTube, Facebook o Twitch, dentro de la app de la iglesia.' },
  { icon: CalendarClock, title: 'Citas pastorales', text: 'Los miembros reservan un horario con su pastor o líder, con recordatorios.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/solicitar-iglesia" variant="ghost" className="hidden sm:inline-flex">
            Solicitar alta de iglesia
          </ButtonLink>
          <ButtonLink href="/registro" variant="ghost" className="hidden sm:inline-flex">
            Registrarme
          </ButtonLink>
          <ButtonLink href="/login">Ingresar</ButtonLink>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted">
              <span className="bg-accent-gradient size-1.5 rounded-full" /> Gestión para iglesias
            </p>
            <h1 className="font-display mt-5 max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
              Tu congregación, <span className="text-accent-gradient">ordenada y conectada.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Kahal reúne la administración de la iglesia y la vida de la comunidad en un solo lugar: tesorería, membresía, novedades, transmisiones y citas.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login">Ingresar a mi iglesia</ButtonLink>
              <ButtonLink href="/registro" variant="secondary">
                Soy miembro, quiero registrarme
              </ButtonLink>
            </div>
          </div>
          <Preview />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-accent-ink shadow-[inset_0_1px_0_var(--glass-highlight)]">
                <f.icon className="size-[18px]" />
              </span>
              <h2 className="font-display mt-5 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="py-16">
          <h2 className="font-display text-2xl font-bold">Iglesias en Kahal</h2>
          <p className="mt-1 text-sm text-muted">Conocé sus próximas actividades o registrate como miembro.</p>
          <ChurchDirectory />
        </section>

        <section className="glass mb-16 flex flex-col items-start justify-between gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold">¿Tu iglesia todavía no está en Kahal?</h2>
            <p className="mt-1 text-sm text-muted">Completá la solicitud y te avisamos por email cuando esté aprobada.</p>
          </div>
          <ButtonLink href="/solicitar-iglesia" variant="secondary">
            Solicitar el alta
          </ButtonLink>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">Kahal · Gestión de iglesias</footer>
    </div>
  );
}

/** Vista previa ilustrativa del panel (decorativa). */
function Preview() {
  return (
    <div aria-hidden className="glass relative hidden rounded-3xl p-4 lg:block">
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users, label: 'Miembros activos', value: '248' },
          { icon: HandCoins, label: 'Resultado del mes', value: '$1,3 M' },
          { icon: CalendarClock, label: 'Citas esta semana', value: '12' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-surface-2/60 p-3.5">
            <span className="flex size-7 items-center justify-center rounded-full border border-border text-muted">
              <s.icon className="size-3.5" />
            </span>
            <p className="mt-3 text-[11px] text-muted">{s.label}</p>
            <p className="font-display text-lg font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="hero-glow mt-3 rounded-2xl p-5">
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">En vivo ahora</span>
        <p className="font-display mt-6 text-xl font-semibold">Culto dominical</p>
        <p className="text-xs text-white/80">Domingo 10:00 hs · YouTube</p>
      </div>
      <div className="mt-3 space-y-2">
        {['Reunión de jóvenes', 'Ensayo del coro'].map((t, i) => (
          <div key={t} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className="bg-accent-soft font-display flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-accent-ink">{14 + i * 3}</span>
            <span className="flex-1">{t}</span>
            <span className="text-xs text-muted">{i ? '20:00' : '19:30'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
