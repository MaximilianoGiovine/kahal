import QRCode from 'qrcode';
import { fileUrl } from './api';
import { isIos } from './push';

export const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } } as const;

export interface PosterChurch {
  name: string;
  slug: string;
  city?: string | null;
  logoKey?: string | null;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
  });
}

export async function qrPngFile(url: string, slug: string) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, { ...QR_OPTIONS, width: 1200 });
  return canvasToFile(canvas, `qr-registro-${slug}.png`);
}

async function loadLogo(key: string) {
  const img = new Image();
  img.src = fileUrl(key)!;
  try {
    await img.decode();
    return img;
  } catch {
    return null; // El cartel sigue siendo útil sin el logo.
  }
}

/** Parte el texto en líneas que entran en el ancho; lo que no tiene espacios, como un link, se corta por letra. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, byChar = false) {
  const lines: string[] = [];
  let line = '';
  for (const part of byChar ? [...text] : text.split(' ')) {
    const next = line && !byChar ? `${line} ${part}` : line + part;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = part;
    } else {
      line = next;
    }
  }
  return line ? [...lines, line] : lines;
}

/** El mismo cartel de /i/[slug]/cartel como imagen A4, para los teléfonos donde no se puede imprimir la página. */
export async function posterFile(church: PosterChurch, url: string) {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo generar la imagen');

  const styles = getComputedStyle(document.documentElement);
  const display = `${styles.getPropertyValue('--font-poppins')}, sans-serif`;
  const body = `${styles.getPropertyValue('--font-inter')}, sans-serif`;
  await Promise.all([document.fonts.load(`600 40px ${display}`), document.fonts.load(`400 40px ${body}`)]).catch(() => {});

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const center = W / 2;
  const inner = W * 0.76;
  let y = 120;

  const logo = church.logoKey ? await loadLogo(church.logoKey) : null;
  if (logo) {
    const size = 170;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(center - size / 2, y, size, size, 28);
    ctx.clip();
    ctx.drawImage(logo, center - size / 2, y, size, size);
    ctx.restore();
    y += size + 36;
  }

  ctx.fillStyle = '#000000';
  ctx.font = `600 76px ${display}`;
  for (const line of wrap(ctx, church.name, inner)) {
    ctx.fillText(line, center, y);
    y += 92;
  }
  if (church.city) {
    ctx.fillStyle = '#525252';
    ctx.font = `400 38px ${body}`;
    ctx.fillText(church.city, center, y + 4);
    y += 60;
  }

  // Abajo primero: el QR ocupa el espacio que queda entre los textos.
  ctx.fillStyle = '#737373';
  ctx.font = `400 26px ${body}`;
  ctx.fillText('Kahal', center, H - 90);

  ctx.font = `400 26px ui-monospace, Menlo, monospace`;
  const urlLines = wrap(ctx, url, inner, true);
  const urlTop = H - 150 - urlLines.length * 34;
  ctx.fillStyle = '#525252';
  urlLines.forEach((line, i) => ctx.fillText(line, center, urlTop + i * 34));

  y += 60;
  ctx.fillStyle = '#000000';
  ctx.font = `600 54px ${display}`;
  ctx.fillText('¡Únete a nuestra comunidad!', center, y);
  y += 78;
  ctx.fillStyle = '#525252';
  ctx.font = `400 32px ${body}`;
  for (const line of wrap(ctx, 'Escanea el código con la cámara de tu teléfono y crea tu cuenta.', inner)) {
    ctx.fillText(line, center, y);
    y += 44;
  }

  const size = Math.min(inner, urlTop - y - 40);
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { ...QR_OPTIONS, width: size });
  ctx.drawImage(qr, center - size / 2, y + 16, size, size);

  return canvasToFile(canvas, `cartel-qr-${church.slug}.png`);
}

/**
 * Entrega el archivo: en iPhone abre el menú de Compartir (Guardar imagen, Imprimir…), porque
 * ahí la descarga por link no es confiable y la app instalada no puede imprimir la página.
 * Hay que llamarla directo desde el toque, con el archivo ya generado: iOS rechaza compartir más tarde.
 */
export async function deliverFile(file: File) {
  if (isIos() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err; // Cerrar el menú no es un error.
    }
    return;
  }
  const href = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari todavía lee el archivo después del clic.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
