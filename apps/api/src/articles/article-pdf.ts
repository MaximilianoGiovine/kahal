import { Parser } from 'htmlparser2';
import PDFDocument from 'pdfkit';
import { LOCALE } from '../common/locale';

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}

type TextBlock = { type: 'h2' | 'h3' | 'h4' | 'p' | 'quote'; runs: Run[] } | { type: 'li'; runs: Run[]; marker: string; depth: number };
type Block = TextBlock | { type: 'hr' } | { type: 'img'; src: string };

/** Convierte el HTML saneado del artículo en bloques simples para maquetar. */
function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const style = { bold: 0, italic: 0, underline: 0, strike: 0 };
  const lists: { ordered: boolean; n: number }[] = [];
  let quote = 0;
  let link: string | undefined;
  let current: TextBlock | null = null;

  const start = (block: TextBlock) => {
    current = block;
    blocks.push(block);
  };
  const ensure = (): TextBlock => current ?? (start({ type: quote ? 'quote' : 'p', runs: [] }), current!);

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        switch (name) {
          case 'h2':
          case 'h3':
          case 'h4':
            start({ type: name, runs: [] });
            break;
          case 'p':
            // <li><p>…</p></li>: el párrafo pertenece al ítem.
            if (current?.type === 'li' && !current.runs.length) break;
            start({ type: quote ? 'quote' : 'p', runs: [] });
            break;
          case 'blockquote':
            quote++;
            current = null;
            break;
          case 'ul':
          case 'ol':
            lists.push({ ordered: name === 'ol', n: 0 });
            current = null;
            break;
          case 'li': {
            const list = lists.at(-1) ?? { ordered: false, n: 0 };
            list.n++;
            start({ type: 'li', runs: [], marker: list.ordered ? `${list.n}.` : '•', depth: Math.max(0, lists.length - 1) });
            break;
          }
          case 'strong':
            style.bold++;
            break;
          case 'em':
            style.italic++;
            break;
          case 'u':
            style.underline++;
            break;
          case 's':
            style.strike++;
            break;
          case 'a':
            link = attrs.href;
            break;
          case 'br':
            ensure().runs.push({ text: '\n' });
            break;
          case 'hr':
            blocks.push({ type: 'hr' });
            current = null;
            break;
          case 'img':
            blocks.push({ type: 'img', src: attrs.src });
            current = null;
            break;
        }
      },
      ontext(raw) {
        const text = raw.replace(/\s+/g, ' ');
        if (!text.trim() && !current) return;
        ensure().runs.push({
          text,
          bold: style.bold > 0,
          italic: style.italic > 0,
          underline: style.underline > 0,
          strike: style.strike > 0,
          link,
        });
      },
      onclosetag(name) {
        switch (name) {
          case 'h2':
          case 'h3':
          case 'h4':
          case 'p':
          case 'li':
            current = null;
            break;
          case 'blockquote':
            quote--;
            current = null;
            break;
          case 'ul':
          case 'ol':
            lists.pop();
            current = null;
            break;
          case 'strong':
            style.bold--;
            break;
          case 'em':
            style.italic--;
            break;
          case 'u':
            style.underline--;
            break;
          case 's':
            style.strike--;
            break;
          case 'a':
            link = undefined;
            break;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return blocks;
}

/** Las fuentes estándar de PDF solo cubren Windows-1252: el resto se reemplaza. */
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function pdfSafe(text: string) {
  return text
    .normalize('NFC')
    .replace(/[‐-‒]/g, '-')
    .replace(/[′‵]/g, "'")
    .replace(/[  -​ ]/g, ' ')
    .replace(/./gu, (c) => (c.charCodeAt(0) < 256 || CP1252_EXTRA.has(c) ? c : ''));
}

const COLOR = { text: '#1c1917', muted: '#78716c', rule: '#e7e5e4', link: '#1d4ed8', quote: '#57534e' };

function font(run: Run, base: 'Times' | 'Helvetica', forceBold = false) {
  const bold = run.bold || forceBold;
  if (base === 'Helvetica') return bold ? (run.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : run.italic ? 'Helvetica-Oblique' : 'Helvetica';
  return bold ? (run.italic ? 'Times-BoldItalic' : 'Times-Bold') : run.italic ? 'Times-Italic' : 'Times-Roman';
}

/** Quita espacios sobrantes al inicio/fin del bloque y runs vacíos. */
function tidy(runs: Run[]) {
  const out = runs.map((r) => ({ ...r, text: pdfSafe(r.text) }));
  while (out.length && !out[0].text.trim()) out.shift();
  while (out.length && !out.at(-1)!.text.trim()) out.pop();
  if (out.length) {
    out[0].text = out[0].text.trimStart();
    out.at(-1)!.text = out.at(-1)!.text.trimEnd();
  }
  return out.filter((r) => r.text);
}

const isPdfImage = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8) || b.subarray(0, 4).toString('hex') === '89504e47';

export interface ArticlePdfInput {
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date;
  churchName: string;
  timezone: string;
  body: string;
  /** Devuelve el contenido de una imagen /api/files/... o null si no está disponible. */
  loadImage: (src: string) => Promise<Buffer | null>;
}

/** PDF del artículo con marca de agua diagonal y pie de autoría en cada página. */
export async function renderArticlePdf(input: ArticlePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 72, left: 64, right: 64 },
    bufferPages: true,
    info: { Title: pdfSafe(input.title), Author: pdfSafe(input.churchName), Creator: 'Kahal' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  // Encabezado
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted).text(pdfSafe(input.churchName.toUpperCase()), left, doc.page.margins.top, { characterSpacing: 1.2, width });
  doc.moveDown(0.8);
  doc.font('Times-Bold').fontSize(26).fillColor(COLOR.text).text(pdfSafe(input.title), { width, lineGap: 2 });
  doc.moveDown(0.4);
  const date = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: input.timezone }).format(input.publishedAt);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted).text(pdfSafe([input.author && `Por ${input.author}`, date].filter(Boolean).join(' · ')), { width });
  if (input.summary) {
    doc.moveDown(0.8);
    doc.font('Times-Italic').fontSize(13).fillColor(COLOR.quote).text(pdfSafe(input.summary), { width, lineGap: 2 });
  }
  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.75).strokeColor(COLOR.rule).stroke();
  doc.moveDown(1);

  const writeRuns = (runs: Run[], opts: { size: number; base: 'Times' | 'Helvetica'; bold?: boolean; color: string; x: number; width: number; lineGap?: number }) => {
    const clean = tidy(runs);
    if (!clean.length) return;
    clean.forEach((r, i) => {
      doc
        .font(font(r, opts.base, opts.bold))
        .fontSize(opts.size)
        .fillColor(r.link ? COLOR.link : opts.color);
      const options = {
        continued: i < clean.length - 1,
        underline: !!r.underline || !!r.link,
        strike: !!r.strike,
        link: r.link ?? null,
        lineGap: opts.lineGap ?? 3,
      };
      if (i === 0) doc.text(r.text, opts.x, doc.y, { ...options, width: opts.width });
      else doc.text(r.text, options);
    });
  };

  const ensureSpace = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  for (const block of parseBlocks(input.body)) {
    switch (block.type) {
      case 'h2':
      case 'h3':
      case 'h4': {
        const size = { h2: 18, h3: 15, h4: 13 }[block.type];
        doc.moveDown(0.6);
        ensureSpace(size * 3);
        writeRuns(block.runs, { size, base: 'Times', bold: true, color: COLOR.text, x: left, width });
        doc.moveDown(0.4);
        break;
      }
      case 'p':
        writeRuns(block.runs, { size: 12, base: 'Times', color: COLOR.text, x: left, width, lineGap: 4 });
        doc.moveDown(0.7);
        break;
      case 'quote': {
        const top = doc.y;
        const page = doc.bufferedPageRange().count;
        writeRuns(block.runs.map((r) => ({ ...r, italic: true })), { size: 12, base: 'Times', color: COLOR.quote, x: left + 18, width: width - 18, lineGap: 4 });
        // La barra lateral solo si la cita no cambió de página.
        if (doc.bufferedPageRange().count === page) {
          doc.moveTo(left + 4, top).lineTo(left + 4, doc.y).lineWidth(2).strokeColor(COLOR.rule).stroke();
        }
        doc.moveDown(0.7);
        break;
      }
      case 'li': {
        const indent = left + 8 + block.depth * 18;
        ensureSpace(16);
        const y = doc.y;
        doc.font('Times-Roman').fontSize(12).fillColor(COLOR.text).text(block.marker, indent, y, { width: 18, lineBreak: false });
        doc.y = y;
        writeRuns(block.runs, { size: 12, base: 'Times', color: COLOR.text, x: indent + 18, width: width - (indent - left) - 18, lineGap: 4 });
        doc.moveDown(0.3);
        break;
      }
      case 'hr':
        doc.moveDown(0.5);
        doc.moveTo(left + width * 0.35, doc.y).lineTo(left + width * 0.65, doc.y).lineWidth(0.75).strokeColor(COLOR.rule).stroke();
        doc.moveDown(1);
        break;
      case 'img': {
        const buf = await input.loadImage(block.src).catch(() => null);
        if (!buf || !isPdfImage(buf)) break;
        try {
          // openImage existe en pdfkit pero no está en sus tipos.
          const img = (doc as unknown as { openImage(b: Buffer): { width: number; height: number } }).openImage(buf);
          const scale = Math.min(1, width / img.width, 380 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ensureSpace(h);
          doc.image(buf, left + (width - w) / 2, doc.y, { width: w, height: h });
          doc.y += h;
          doc.x = left;
          doc.moveDown(0.8);
        } catch {
          /* imagen corrupta: se omite */
        }
        break;
      }
    }
  }

  // Marca de agua y pie en todas las páginas (por encima del contenido, para que no se pueda tapar).
  const { start, count } = doc.bufferedPageRange();
  const mark = pdfSafe(input.churchName);
  const footer = pdfSafe(`© ${input.publishedAt.getFullYear()} ${input.churchName}. Contenido original de la iglesia, publicado en Kahal.`);
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const { width: pw, height: ph } = doc.page;
    const diagonal = Math.hypot(pw, ph) * 0.75;
    doc.font('Helvetica-Bold');
    const size = Math.min(72, diagonal / doc.fontSize(1).widthOfString(mark));
    doc.fontSize(size);
    const tw = doc.widthOfString(mark);

    doc.save();
    doc.rotate(-Math.atan2(ph, pw) * (180 / Math.PI), { origin: [pw / 2, ph / 2] });
    doc.fillColor('#000000').fillOpacity(0.07).text(mark, pw / 2 - tw / 2, ph / 2 - size / 2, { lineBreak: false });
    doc.restore();

    // El pie va dentro del margen inferior: se anula temporalmente para que no agregue páginas.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted).fillOpacity(1);
    doc.text(footer, left, ph - 40, { width: width - 60, lineBreak: false, ellipsis: true });
    doc.text(`${i - start + 1} / ${count}`, left + width - 60, ph - 40, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margin;
  }

  doc.end();
  return done;
}
