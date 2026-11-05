'use client';

import { Copy, Download, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { isIos } from '@/lib/push';
import { deliverFile, posterFile, QR_OPTIONS, qrPngFile, type PosterChurch } from '@/lib/qr-files';

/**
 * Link fijo de registro de una iglesia: el slug no se puede cambiar, así que el QR
 * impreso sigue funcionando para siempre (mientras no cambie el dominio).
 */
export const registerLink = (slug: string) => (typeof window !== 'undefined' ? `${window.location.origin}/r/${slug}` : `/r/${slug}`);

/** Código QR en SVG (nítido a cualquier tamaño de impresión). */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { ...QR_OPTIONS, type: 'svg' }).then((s) => !cancelled && setSvg(s));
    return () => {
      cancelled = true;
    };
  }, [value]);
  return <div role="img" aria-label={`Código QR: ${value}`} className={`aspect-square [&>svg]:size-full ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const deliver = (file: File) => deliverFile(file).catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo compartir el archivo'));

/** Genera un archivo de antemano, para tenerlo listo en el momento del toque. */
function usePreparedFile(prepare: (() => Promise<File>) | null, key: string) {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFile(null);
    prepare?.()
      .then((f) => !cancelled && setFile(f))
      .catch(() => !cancelled && toast.error('No se pudo preparar el archivo'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return file;
}

/** Cartel listo para imprimir; solo se genera en iPhone, donde no se puede imprimir la página. */
export function usePosterFile(church: PosterChurch | null | undefined) {
  return usePreparedFile(church && isIos() ? () => posterFile(church, registerLink(church.slug)) : null, church?.slug ?? '');
}

export const printPoster = deliver;

export function ChurchQrDialog({ church, onClose }: { church: { name: string; slug: string }; onClose: () => void }) {
  const url = registerLink(church.slug);
  const png = usePreparedFile(() => qrPngFile(url, church.slug), url);
  const poster = usePreparedFile(
    isIos()
      ? async () => {
          // El logo y la ciudad están en la ficha pública; sin ellos el cartel sale igual.
          const details = await api<PosterChurch>(`/public/churches/${church.slug}`).catch(() => church);
          return posterFile(details, url);
        }
      : null,
    url,
  );

  async function downloadSvg() {
    const svg = await QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
    deliver(new File([svg], `qr-registro-${church.slug}.svg`, { type: 'image/svg+xml' }));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Código QR · ${church.name}`}
      description="Es fijo: imprímelo una vez y quien lo escanee se registra directamente en esta iglesia."
      footer={
        <>
          <Button variant="secondary" onClick={downloadSvg} className="max-sm:hidden">
            <Download className="size-4" /> SVG
          </Button>
          <Button variant="secondary" loading={!png} onClick={() => png && deliver(png)}>
            <Download className="size-4" /> PNG
          </Button>
          <Button loading={isIos() && !poster} onClick={() => (isIos() ? poster && deliver(poster) : window.open(`/i/${church.slug}/cartel`, '_blank'))}>
            <Printer className="size-4" /> Imprimir cartel
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <QrCode value={url} className="w-64 rounded-xl border border-border bg-white p-2" />
        <div className="flex w-full gap-2">
          <Input readOnly value={url} className="text-xs" onFocus={(e) => e.target.select()} aria-label="Enlace de registro" />
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Enlace copiado'))} aria-label="Copiar enlace">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
