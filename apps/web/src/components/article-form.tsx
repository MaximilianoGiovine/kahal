'use client';

import { ArrowLeft, FileUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/dialog';
import { ImageUpload } from '@/components/image-upload';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Button, Card, Checkbox, Field, Input, PageHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { formValues, useAction } from '@/lib/hooks';
import type { Article } from '@/lib/types';

const hasText = (html: string) => !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img|<hr/i.test(html);

/** Alta y edición de artículos: se redactan en el editor o se generan desde un .docx o PDF. */
export function ArticleForm({ item }: { item: Article | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  // Cambiar la versión remonta el editor con el contenido importado.
  const [version, setVersion] = useState(0);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useAction(
    (data: Record<string, unknown>) =>
      item ? api<Article>(`/articles/${item.id}`, { method: 'PATCH', body: data }) : api<Article>('/articles', { method: 'POST', body: data }),
    {
      success: item ? 'Artículo actualizado' : 'Artículo guardado',
      invalidate: [['articles']],
      onSuccess: (a) => router.push(`/app/articulos/${a.id}`),
    },
  );

  function pickFile() {
    if (hasText(body)) setConfirmImport(true);
    else fileRef.current?.click();
  }

  async function onFile(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api<{ title: string; body: string }>('/articles/import', { method: 'POST', body: fd });
      setBody(result.body);
      if (result.title) setTitle(result.title);
      setVersion((v) => v + 1);
      toast.success('Documento importado. Revisalo antes de guardar.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo importar el archivo');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasText(body)) {
      toast.error('Escribí el contenido del artículo o importá un documento');
      return;
    }
    save.mutate({ ...formValues(e.currentTarget), title, body });
  }

  return (
    <>
      <Link href={item ? `/app/articulos/${item.id}` : '/app/articulos'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {item ? 'Volver al artículo' : 'Artículos'}
      </Link>
      <PageHeader
        title={item ? 'Editar artículo' : 'Nuevo artículo'}
        description="Redactalo acá o generalo a partir de un documento de Word (.docx) o PDF."
        actions={
          <Button variant="secondary" onClick={pickFile} disabled={importing}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {importing ? 'Importando…' : 'Importar .docx o PDF'}
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Field label="Título">
            <Input name="title" required minLength={2} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 text-base" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Contenido</span>
            <RichTextEditor key={version} initialHtml={body} onChange={setBody} placeholder="Empezá a escribir…" />
          </div>
        </div>

        <Card className="flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-6">
          <Field label="Resumen" hint="Se muestra en el listado y al inicio del PDF.">
            <Textarea name="summary" rows={4} maxLength={500} defaultValue={item?.summary ?? ''} />
          </Field>
          <ImageUpload name="coverKey" label="Imagen de portada" defaultKey={item?.coverKey} />
          <Checkbox name="published" label="Publicado (visible para la congregación)" defaultChecked={item?.published ?? true} />
          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={save.isPending} disabled={importing} className="flex-1">
              Guardar
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </Card>
      </form>

      <ConfirmDialog
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={() => {
          setConfirmImport(false);
          fileRef.current?.click();
        }}
        title="Reemplazar contenido"
        message="El contenido del documento va a reemplazar el título y el texto que escribiste. ¿Continuar?"
        confirmLabel="Elegir archivo"
      />
    </>
  );
}
