'use client';

import { Copy, Download, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { Button, Input } from '@/components/ui';

/**
 * Link fijo de registro de una iglesia: el slug no se puede cambiar, así que el QR
 * impreso sigue funcionando para siempre (mientras no cambie el dominio).
 */
export const registerLink = (slug: string) => (typeof window !== 'undefined' ? `${window.location.origin}/r/${slug}` : `/r/${slug}`);

const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } } as const;

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

function save(href: string, name: string) {
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ChurchQrDialog({ church, onClose }: { church: { name: string; slug: string }; onClose: () => void }) {
  const url = registerLink(church.slug);

  async function downloadPng() {
    save(await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1200 }), `qr-registro-${church.slug}.png`);
  }
  async function downloadSvg() {
    const svg = await QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    save(href, `qr-registro-${church.slug}.svg`);
    URL.revokeObjectURL(href);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Código QR · ${church.name}`}
      description="Es fijo: imprimilo una vez y quien lo escanee se registra directamente en esta iglesia."
      footer={
        <>
          <Button variant="secondary" onClick={downloadSvg}>
            <Download className="size-4" /> SVG
          </Button>
          <Button variant="secondary" onClick={downloadPng}>
            <Download className="size-4" /> PNG
          </Button>
          <Button onClick={() => window.open(`/i/${church.slug}/cartel`, '_blank')}>
            <Printer className="size-4" /> Imprimir cartel
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <QrCode value={url} className="w-64 rounded-xl border border-border bg-white p-2" />
        <div className="flex w-full gap-2">
          <Input readOnly value={url} className="text-xs" onFocus={(e) => e.target.select()} aria-label="Link de registro" />
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copiado'))} aria-label="Copiar link">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
