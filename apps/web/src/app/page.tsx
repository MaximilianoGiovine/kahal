import { CalendarClock, HandCoins, Megaphone, MonitorPlay, Users } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ButtonLink } from '@/components/ui';
import { ChurchDirectory } from './church-directory';

const FEATURES = [
  { icon: HandCoins, title: 'Finanzas claras', text: 'Ingresos, egresos, diezmos por miembro y reportes listos para exportar a Excel.' },
  { icon: Users, title: 'Membresía', text: 'Padrón de miembros, familias y ministerios, con aprobación de nuevos registros.' },
  { icon: Megaphone, title: 'Novedades y agenda', text: 'Anuncios y eventos que llegan a toda la congregación en su celular.' },
  { icon: MonitorPlay, title: 'Transmisiones', text: 'Los cultos en vivo de YouTube o Facebook, dentro de la app de la iglesia.' },
  { icon: CalendarClock, title: 'Citas pastorales', text: 'Los miembros reservan un horario con su pastor o líder, con recordatorios.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <div className="flex gap-2">
          <ButtonLink href="/registro" variant="ghost" className="hidden sm:inline-flex">
            Registrarme
          </ButtonLink>
          <ButtonLink href="/login">Ingresar</ButtonLink>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-14 sm:py-24">
          <p className="text-sm font-medium tracking-wide text-accent-ink uppercase">Gestión para iglesias</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-6xl">
            Tu congregación, ordenada y conectada.
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
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-6">
              <f.icon className="size-5 text-accent-ink" />
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="py-16">
          <h2 className="font-display text-2xl font-semibold">Iglesias en Kahal</h2>
          <p className="mt-1 text-sm text-muted">Conocé sus próximas actividades o registrate como miembro.</p>
          <ChurchDirectory />
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">Kahal · Gestión de iglesias</footer>
    </div>
  );
}
