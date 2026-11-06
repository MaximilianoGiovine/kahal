import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { LOCALE } from '../common/locale';
import { PrismaService } from '../prisma/prisma.service';
import { CONTRACT, documentText, PRIVACY, sha256 } from './documents';

export interface AgreementInput {
  requestId: string;
  churchName: string;
  churchSlug: string;
  churchCity?: string | null;
  timezone?: string | null;
  currency?: Currency | null;
  signerFirstName: string;
  signerLastName: string;
  signerEmail: string;
  signerPhone: string;
  signerDocument: string;
  signerRole: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type Signed = Omit<AgreementInput, 'requestId'> & {
  contractVersion: string;
  contractText: string;
  contractHash: string;
  privacyVersion: string;
  acceptedAt: Date;
};

/** Huella de lo aceptado. El orden es fijo: cambiar cualquier dato después cambia el resultado. */
function recordHash(a: Signed) {
  return sha256(
    JSON.stringify([
      a.churchName,
      a.churchSlug,
      a.churchCity ?? null,
      a.timezone ?? null,
      a.currency ?? null,
      a.signerFirstName,
      a.signerLastName,
      a.signerEmail,
      a.signerPhone,
      a.signerDocument,
      a.signerRole,
      a.contractVersion,
      a.contractHash,
      a.privacyVersion,
      a.ipAddress ?? null,
      a.userAgent ?? null,
      a.acceptedAt.toISOString(),
    ]),
  );
}

const LIST_SELECT = {
  id: true,
  churchId: true,
  churchName: true,
  churchSlug: true,
  signerFirstName: true,
  signerLastName: true,
  signerEmail: true,
  contractVersion: true,
  acceptedAt: true,
  churchEndedAt: true,
  retainUntil: true,
} satisfies Prisma.ChurchAgreementSelect;

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Guarda el texto íntegro aceptado: la constancia no depende de que el documento siga igual. */
  create(tx: Prisma.TransactionClient, input: AgreementInput) {
    const contractText = documentText(CONTRACT);
    const { requestId, ...fields } = input;
    const signed: Signed = {
      ...fields,
      contractVersion: CONTRACT.version,
      contractText,
      contractHash: sha256(contractText),
      privacyVersion: PRIVACY.version,
      acceptedAt: new Date(),
    };
    return tx.churchAgreement.create({ data: { ...signed, requestId, recordHash: recordHash(signed) } });
  }

  async list() {
    const [items, withoutAgreement] = await Promise.all([
      this.prisma.churchAgreement.findMany({ select: LIST_SELECT, orderBy: { acceptedAt: 'desc' } }),
      this.prisma.church.findMany({
        where: { agreements: { none: {} } },
        select: { id: true, name: true, slug: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { items, withoutAgreement };
  }

  async get(id: string) {
    const a = await this.prisma.churchAgreement.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Constancia no encontrada');
    const intact = a.recordHash === recordHash(a) && a.contractHash === sha256(a.contractText);
    return { ...a, intact };
  }

  async sendPdf(id: string, res: Response) {
    const a = await this.get(id);
    const when = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'medium', timeZone: 'UTC' }).format(a.acceptedAt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="aval-${a.churchSlug}.pdf"`);
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    doc.pipe(res);
    doc.font('Helvetica-Bold').fontSize(16).text('Constancia de aceptación del contrato');
    doc.moveDown();
    const rows: [string, string | null][] = [
      ['Iglesia', a.churchName],
      ['Identificador', a.churchSlug],
      ['Ciudad', a.churchCity],
      ['Zona horaria', a.timezone],
      ['Moneda', a.currency],
      ['Firmante', `${a.signerFirstName} ${a.signerLastName}`],
      ['Documento', a.signerDocument],
      ['Cargo', a.signerRole],
      ['Correo', a.signerEmail],
      ['Teléfono', a.signerPhone],
      ['Fecha de aceptación (UTC)', when],
      ['Dirección IP', a.ipAddress],
      ['Navegador', a.userAgent],
      ['Versión del contrato', a.contractVersion],
      ['Versión de la política', a.privacyVersion],
      ['Huella del contrato (SHA-256)', a.contractHash],
      ['Huella del registro (SHA-256)', a.recordHash],
      ['Comprobación de integridad', a.intact ? 'Coincide con lo guardado' : 'NO COINCIDE: el registro cambió después de aceptarse'],
    ];
    doc.fontSize(10);
    for (const [label, value] of rows) {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value ?? '—');
    }
    doc.addPage().font('Helvetica-Bold').fontSize(13).text('Texto aceptado');
    doc.moveDown().font('Helvetica').fontSize(10).text(a.contractText, { lineGap: 2 });
    doc.end();
  }
}
