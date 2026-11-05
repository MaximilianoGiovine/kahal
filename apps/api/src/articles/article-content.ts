import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import sanitizeHtml from 'sanitize-html';
import { StorageService } from '../files/storage.service';

/** Solo se permiten imágenes subidas a Kahal (las del editor y las extraídas de un .docx). */
const LOCAL_IMAGE = /^\/api\/files\/[\w-]+\/image\/[\w-]+\.(jpg|png|webp|gif)$/;

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'hr', 'img'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  transformTags: {
    h1: 'h2',
    h5: 'h4',
    h6: 'h4',
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
    div: 'p',
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  exclusiveFilter: (frame) =>
    (frame.tag === 'img' && !LOCAL_IMAGE.test(frame.attribs.src ?? '')) ||
    // Párrafos vacíos que dejan los editores y Word.
    (['p', 'h2', 'h3', 'h4', 'li'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren.length),
};

export function sanitizeArticle(html: string) {
  return sanitizeHtml(html, SANITIZE).trim();
}

export function htmlToText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export interface ImportedArticle {
  title: string;
  body: string;
}

/** Convierte un .docx o un PDF en un borrador de artículo (título + HTML saneado). */
export async function importDocument(file: Express.Multer.File, churchId: string, storage: StorageService): Promise<ImportedArticle> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return fromDocx(file.buffer, churchId, storage, file.originalname);
  }
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    return fromPdf(file.buffer, file.originalname);
  }
  throw new BadRequestException('Formato no soportado: sube un archivo .docx o .pdf');
}

const baseName = (filename: string) => filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

async function fromDocx(buffer: Buffer, churchId: string, storage: StorageService, filename: string): Promise<ImportedArticle> {
  let result: { value: string };
  try {
    result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote:fresh"],
        // Las imágenes del documento se guardan como archivos de la iglesia en vez de quedar en base64.
        convertImage: mammoth.images.imgElement(async (image) => {
          const ext = IMAGE_EXT[image.contentType];
          if (!ext) return { src: '' };
          const key = `${churchId}/image/${randomUUID()}.${ext}`;
          await storage.put(key, await image.readAsBuffer(), image.contentType);
          return { src: `/api/files/${key}` };
        }),
      },
    );
  } catch {
    throw new BadRequestException('No se pudo leer el documento de Word');
  }

  let html = result.value;
  let title = '';
  // El primer título del documento pasa a ser el título del artículo.
  const first = /^\s*<h1>([\s\S]*?)<\/h1>/.exec(html);
  if (first) {
    title = htmlToText(first[1]);
    html = html.slice(first[0].length);
  }
  const body = sanitizeArticle(html);
  if (!body) throw new BadRequestException('El documento no tiene texto para importar');
  return { title: (title || baseName(filename)).slice(0, 160), body };
}

async function fromPdf(buffer: Buffer, filename: string): Promise<ImportedArticle> {
  let text: string;
  const parser = new PDFParse({ data: buffer });
  try {
    text = withoutRunningLines((await parser.getText()).pages.map((p) => p.text));
  } catch {
    throw new BadRequestException('No se pudo leer el PDF');
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const blocks = pdfBlocks(text);
  if (!blocks.length) {
    throw new BadRequestException('El PDF no tiene texto seleccionable (puede ser una imagen escaneada)');
  }
  // Si el primer bloque es corto lo tomamos como título.
  let title = baseName(filename);
  if (blocks[0].text.length <= 120) title = blocks.shift()!.text;
  // Ítems consecutivos de lista se agrupan en <ul>/<ol>.
  let body = '';
  let list: 'ul' | 'ol' | null = null;
  for (const b of blocks) {
    const item = LIST_ITEM.exec(b.text);
    const kind = item ? (/\d/.test(item[1]) ? 'ol' : 'ul') : null;
    if (list && list !== kind) body += `</${list}>`;
    if (kind && list !== kind) body += `<${kind}>`;
    list = kind;
    if (item) body += `<li>${escape(b.text.slice(item[0].length))}</li>`;
    else body += b.heading ? `<h3>${escape(b.text)}</h3>` : `<p>${escape(b.text)}</p>`;
  }
  if (list) body += `</${list}>`;
  return { title: title.slice(0, 160), body: sanitizeArticle(body) };
}

const LIST_ITEM = /^(\d+[.)]|[•·\-–])\s+/;

/**
 * Quita encabezados, pies y números de página: líneas que se repiten en la mayoría
 * de las páginas (ignorando los dígitos). Las páginas se unen sin línea en blanco para
 * que un párrafo cortado por el salto de página siga siendo uno solo.
 */
function withoutRunningLines(pages: string[]) {
  const key = (line: string) => line.replace(/\s+/g, ' ').trim().replace(/\d+/g, '#');
  const isPageNumber = (line: string) => /^(p[aá]gina\s*)?#(\s*(\/|de)\s*#)?$/i.test(key(line));
  const seen = new Map<string, number>();
  for (const page of pages) {
    for (const k of new Set(page.split(/\r?\n/).map(key).filter(Boolean))) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  return pages
    .map((page) =>
      page
        .split(/\r?\n/)
        .filter((line) => !isPageNumber(line) && (pages.length < 2 || (seen.get(key(line)) ?? 0) < threshold || !key(line)))
        .join('\n'),
    )
    .join('\n');
}

/**
 * El texto de un PDF viene cortado por línea. Se reconstruyen párrafos uniendo líneas,
 * y se corta cuando hay una línea en blanco o una línea corta que termina en puntuación.
 * Una línea corta sin puntuación final después de un fin de oración se toma como subtítulo.
 */
function pdfBlocks(text: string): { text: string; heading?: boolean }[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const lengths = lines.filter(Boolean).map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.8)] ?? 0;

  const out: { text: string; heading?: boolean }[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) out.push({ text: current.trim() });
    current = '';
  };
  const endsSentence = /[.:!?»"”)]$/;
  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    const looksHeading =
      out.length > 0 && line.length < typical * 0.6 && !endsSentence.test(line) && /^\p{Lu}/u.test(line) && !LIST_ITEM.test(line);
    const last = out.at(-1);
    const afterSentence = current ? endsSentence.test(current) : !!last && (!!last.heading || endsSentence.test(last.text));
    if (looksHeading && afterSentence) {
      flush();
      out.push({ text: line, heading: true });
      continue;
    }
    // Cada ítem de lista empieza un bloque nuevo.
    if (LIST_ITEM.test(line)) flush();
    // Palabra cortada con guión al final de la línea.
    current = current.endsWith('-') ? current.slice(0, -1) + line : current ? `${current} ${line}` : line;
    // La primera línea corta suele ser el título aunque no termine en puntuación.
    const isTitle = !out.length && current === line;
    if (line.length < typical * 0.75 && (isTitle || endsSentence.test(line))) flush();
  }
  flush();
  return out;
}
