'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { BrandIcon } from '@/components/brand';
import { QrCode, registerLink } from '@/components/church-qr';
import { Button, ErrorState, Loading } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';

/** Cartel A4 para imprimir con el QR de registro de la iglesia. */
export default function ChurchPosterPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-church', slug],
    queryFn: () => api<{ name: string; slug: string; city: string | null; logoKey: string | null }>(`/public/churches/${slug}`),
  });

  useEffect(() => {
    if (data) document.title = `QR de registro · ${data.name}`;
  }, [data]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const url = registerLink(data.slug);
  return (
    <div className="min-h-dvh bg-surface-2 py-8 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 0 } @media print { html, body { background: #fff !important } }'}</style>
      <div className="mx-auto mb-6 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir
        </Button>
      </div>
      <article className="mx-auto flex aspect-[210/297] w-full max-w-[210mm] flex-col items-center justify-between bg-white px-[12%] py-[10%] text-center text-black shadow-lg print:h-[297mm] print:w-[210mm] print:max-w-none print:shadow-none">
        <header className="flex flex-col items-center">
          {data.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(data.logoKey)} alt="" className="mb-5 size-24 rounded-2xl object-cover" />
          ) : null}
          <h1 className="font-display text-[clamp(1.75rem,5vw,3rem)] leading-tight font-semibold">{data.name}</h1>
          {data.city && <p className="mt-1 text-lg text-neutral-600">{data.city}</p>}
        </header>
        <div className="flex w-full flex-col items-center">
          <p className="font-display text-[clamp(1.25rem,3.5vw,2rem)] font-semibold">¡Sumate a nuestra comunidad!</p>
          <p className="mt-2 text-neutral-600">Escaneá el código con la cámara de tu celular y creá tu cuenta.</p>
          <QrCode value={url} className="mt-6 w-[70%]" />
          <p className="mt-3 font-mono text-sm break-all text-neutral-600">{url}</p>
        </div>
        <footer className="flex items-center gap-2 text-sm text-neutral-500">
          <BrandIcon className="size-6" /> Kahal
        </footer>
      </article>
    </div>
  );
}
