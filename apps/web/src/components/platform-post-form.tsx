'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/image-upload';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { PlatformPost } from '@/lib/types';

const hasText = (html: string) => !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img|<hr/i.test(html);

/** Alta y edición de noticias y avisos de Kahal (solo super admin). */
export function PlatformPostForm({ item }: { item: PlatformPost | null }) {
  const router = useRouter();
  const [body, setBody] = useState(item?.body ?? '');

  const save = useAction(
    (data: Record<string, unknown>) =>
      item ? api<PlatformPost>(`/platform-posts/${item.id}`, { method: 'PATCH', body: data }) : api<PlatformPost>('/platform-posts', { method: 'POST', body: data }),
    {
      success: item ? 'Publicación actualizada' : 'Publicación guardada',
      invalidate: [['platform-posts']],
      onSuccess: () => router.push('/app/admin/noticias'),
    },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasText(body)) {
      toast.error('Escribe el contenido de la publicación');
      return;
    }
    const v = formValues(e.currentTarget);
    save.mutate({ ...v, body, expiresAt: v.expiresAt ? fromLocalInput(v.expiresAt as string) : null });
  }

  return (
    <>
      <Link href="/app/admin/noticias" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Noticias y avisos
      </Link>
      <PageHeader
        title={item ? 'Editar publicación' : 'Nueva publicación'}
        description="Se muestra en la página de Artículos de todas las iglesias."
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Field label="Título">
            <Input name="title" required minLength={2} maxLength={160} defaultValue={item?.title ?? ''} className="h-11 text-base" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Contenido</span>
            <RichTextEditor initialHtml={body} onChange={setBody} placeholder="Empieza a escribir…" uploadScope="platform" />
          </div>
        </div>

        <Card className="flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-6">
          <Field label="Tipo" hint="Los avisos se destacan arriba de todo; las noticias se listan como artículos.">
            <Select name="kind" defaultValue={item?.kind ?? 'NEWS'}>
              <option value="NEWS">Noticia</option>
              <option value="NOTICE">Aviso</option>
            </Select>
          </Field>
          <Field label="Resumen" hint="Se muestra en el listado.">
            <Textarea name="summary" rows={4} maxLength={500} defaultValue={item?.summary ?? ''} />
          </Field>
          <ImageUpload name="coverKey" label="Imagen de portada" defaultKey={item?.coverKey} scope="platform" />
          <Field label="Deja de mostrarse el" hint="Opcional. Útil para avisos con fecha, como un mantenimiento.">
            <Input name="expiresAt" type="datetime-local" defaultValue={toLocalInput(item?.expiresAt)} />
          </Field>
          <Checkbox name="published" label="Publicado (visible en todas las iglesias)" defaultChecked={item?.published ?? true} />
          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={save.isPending} className="flex-1">
              Guardar
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
