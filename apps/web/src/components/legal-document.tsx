'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dayLabel } from '@/lib/format';
import { legalDocumentQuery, type LegalDocument } from '@/lib/legal';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { ErrorState, Loading } from './ui';

export function LegalSections({ document }: { document: LegalDocument }) {
  return (
    <div className="space-y-6">
      {document.sections.map((s) => (
        <section key={s.title}>
          <h2 className="font-display font-semibold">{s.title}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-2 text-sm leading-relaxed text-muted">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function LegalPage({ documentKey }: { documentKey: LegalDocument['key'] }) {
  const { data, isLoading, error, refetch } = useQuery(legalDocumentQuery(documentKey));
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Brand />
        <ThemeToggle />
      </div>
      <main className="glass mt-8 rounded-3xl p-6 sm:p-8">
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">{data.title}</h1>
            <p className="mt-1 mb-6 text-sm text-muted">
              Versión {data.version}, vigente desde el {dayLabel(data.effectiveDate, 'long')}
            </p>
            <LegalSections document={data} />
          </>
        )}
      </main>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/" className="hover:underline">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
