'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { fileUrl, upload } from '@/lib/api';

/** Campo de imagen: sube el archivo y guarda la key en un input hidden. */
export function ImageUpload({ name, defaultKey, kind = 'image', label = 'Imagen' }: { name: string; defaultKey?: string | null; kind?: 'image' | 'logo' | 'photo'; label?: string }) {
  const [key, setKey] = useState(defaultKey ?? '');
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      setKey((await upload(file, kind)).key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    } finally {
      setLoading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={key} />
      {key ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(key)} alt="" className="max-h-40 rounded-lg border border-border object-cover" />
          <button type="button" onClick={() => setKey('')} className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white" aria-label="Quitar imagen">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted hover:border-accent hover:text-accent-ink"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {loading ? 'Subiendo…' : 'Subir imagen'}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}
