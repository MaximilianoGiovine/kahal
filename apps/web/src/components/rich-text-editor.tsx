'use client';

import clsx from 'clsx';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fileUrl, upload } from '@/lib/api';

const ALLOWED = new Set(['H2', 'H3', 'H4', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'HR', 'IMG']);
const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'SVG']);

/**
 * Limpia el HTML pegado (Word, Google Docs, páginas web) para que el editor muestre
 * lo mismo que va a guardar la API, que vuelve a sanear en el servidor.
 */
function cleanPasted(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toUpperCase();
      if (DROP.has(tag)) {
        child.remove();
        continue;
      }
      walk(child);
      if (tag === 'H1') {
        const h2 = doc.createElement('h2');
        h2.append(...Array.from(child.childNodes));
        child.replaceWith(h2);
        continue;
      }
      if (!ALLOWED.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const keep = (tag === 'A' && attr.name === 'href') || (tag === 'IMG' && attr.name === 'src' && attr.value.startsWith('/api/files/'));
        if (!keep) child.removeAttribute(attr.name);
      }
      if (tag === 'IMG' && !child.getAttribute('src')) child.remove();
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const isEmpty = (el: HTMLElement) => !el.textContent?.trim() && !el.querySelector('img,hr');

interface Tool {
  label: string;
  icon: LucideIcon;
  run: () => void;
  state?: string;
}

/**
 * Editor de texto enriquecido liviano (contentEditable). No es controlado:
 * para reemplazar el contenido (p. ej. al importar un archivo) se cambia su `key`.
 */
export function RichTextEditor({ initialHtml, onChange, placeholder }: { initialHtml: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(true);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initialHtml;
    setEmpty(isEmpty(el));
    document.execCommand('defaultParagraphSeparator', false, 'p');
    // Solo al montar: el contenido inicial no se vuelve a aplicar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEmpty(isEmpty(el));
    onChange(el.innerHTML);
  }, [onChange]);

  // Estado de los botones según la selección.
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      const sel = document.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      const block = String(document.queryCommandValue('formatBlock')).toLowerCase();
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        h2: block === 'h2',
        h3: block === 'h3',
        blockquote: block === 'blockquote',
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const exec = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  };
  const block = (tag: string) => exec('formatBlock', active[tag] ? 'p' : tag);

  function addLink() {
    const url = window.prompt('Dirección del enlace (https://…)');
    if (!url) return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    exec('createLink', href);
  }

  async function addImage(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const { key } = await upload(file, 'image');
      exec('insertImage', fileUrl(key));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const groups: Tool[][] = [
    [
      { label: 'Párrafo', icon: Pilcrow, run: () => exec('formatBlock', 'p') },
      { label: 'Título', icon: Heading2, run: () => block('h2'), state: 'h2' },
      { label: 'Subtítulo', icon: Heading3, run: () => block('h3'), state: 'h3' },
    ],
    [
      { label: 'Negrita', icon: Bold, run: () => exec('bold'), state: 'bold' },
      { label: 'Cursiva', icon: Italic, run: () => exec('italic'), state: 'italic' },
      { label: 'Subrayado', icon: Underline, run: () => exec('underline'), state: 'underline' },
      { label: 'Tachado', icon: Strikethrough, run: () => exec('strikeThrough'), state: 'strikeThrough' },
    ],
    [
      { label: 'Lista', icon: List, run: () => exec('insertUnorderedList'), state: 'insertUnorderedList' },
      { label: 'Lista numerada', icon: ListOrdered, run: () => exec('insertOrderedList'), state: 'insertOrderedList' },
      { label: 'Cita', icon: Quote, run: () => block('blockquote'), state: 'blockquote' },
      { label: 'Separador', icon: Minus, run: () => exec('insertHorizontalRule') },
    ],
    [
      { label: 'Enlace', icon: Link2, run: addLink },
      { label: 'Imagen', icon: ImagePlus, run: () => fileRef.current?.click() },
      { label: 'Quitar formato', icon: RemoveFormatting, run: () => exec('removeFormat') },
    ],
  ];

  return (
    <div className="rounded-lg border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <div role="toolbar" aria-label="Formato" className="sticky top-14 z-10 flex flex-wrap items-center gap-1 rounded-t-lg border-b border-border bg-surface-solid px-2 py-1.5 lg:top-0">
        {groups.map((tools, i) => (
          <div key={i} className={clsx('flex items-center gap-0.5', i > 0 && 'border-l border-border pl-1')}>
            {tools.map((t) => (
              <button
                key={t.label}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={t.state ? !!active[t.state] : undefined}
                // mousedown + preventDefault conserva la selección del texto.
                onMouseDown={(e) => {
                  e.preventDefault();
                  t.run();
                }}
                className={clsx(
                  'rounded-md p-1.5 transition-colors',
                  t.state && active[t.state] ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.label === 'Imagen' && uploading ? <Loader2 className="size-4 animate-spin" /> : <t.icon className="size-4" />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="Contenido del artículo"
        data-placeholder={placeholder}
        data-empty={empty}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          const html = e.clipboardData.getData('text/html');
          if (!html) return;
          e.preventDefault();
          document.execCommand('insertHTML', false, cleanPasted(html));
          emit();
        }}
        className="rich-editor article-body relative min-h-[50vh] px-4 py-4 sm:px-6"
      />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => addImage(e.target.files?.[0])} />
    </div>
  );
}
