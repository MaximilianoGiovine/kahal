import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permission } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthUser, can } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { campusFilter } from '../common/campus-scope';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_FOLDER, StorageService } from './storage.service';

const KINDS = ['logo', 'image', 'receipt', 'photo'] as const;
type Kind = (typeof KINDS)[number];

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

@Controller('files')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind: Kind,
    @Query('scope') scope: string | undefined,
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: true })) file: Express.Multer.File,
  ) {
    if (!KINDS.includes(kind)) throw new BadRequestException('Tipo de archivo inválido');
    // Las imágenes de las noticias de Kahal van a una carpeta común que leen todas las iglesias.
    const platform = scope === 'platform';
    if (platform && (!user.isSuperAdmin || kind !== 'image')) throw new ForbiddenException();
    const churchId = platform ? PLATFORM_FOLDER : user.activeChurchId;
    if (!churchId) throw new BadRequestException('Selecciona una iglesia para operar');
    const ext = MIME_EXT[file.mimetype];
    if (!ext || (ext === 'pdf' && kind !== 'receipt')) {
      throw new BadRequestException(kind === 'receipt' ? 'Formato no soportado (usa imagen o PDF)' : 'Formato no soportado (usa JPG, PNG o WEBP)');
    }
    const key = `${churchId}/${kind}/${randomUUID()}.${ext}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    return { key, url: `/api/files/${key}` };
  }

  @Public()
  @Get(':churchId/:kind/:name')
  async download(
    @CurrentUser() user: AuthUser | undefined,
    @Param('churchId') churchId: string,
    @Param('kind') kind: Kind,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    if (kind !== 'logo') {
      if (!user) throw new ForbiddenException();
      const sameChurch = user.isSuperAdmin || user.churchId === churchId || (churchId === PLATFORM_FOLDER && kind === 'image');
      if (!sameChurch) throw new ForbiddenException();
      if (kind === 'receipt' && !can(user, Permission.FINANCE_VIEW)) {
        throw new ForbiddenException();
      }
      if (kind === 'receipt' && user.campusScopes.FINANCE) {
        // Con acceso limitado no alcanza con conocer la URL: el comprobante debe ser de un movimiento de sus sedes.
        // Uno recién subido todavía no tiene movimiento y solo lo conoce quien lo subió.
        const receiptKey = `${churchId}/receipt/${name}`;
        const linked = await this.prisma.transaction.findMany({ where: { churchId, receiptKey }, select: { account: { select: { campusId: true } } } });
        const allowed = campusFilter(user.campusScopes.FINANCE) as { in: string[] };
        if (linked.length && !linked.some((t) => t.account.campusId && allowed.in.includes(t.account.campusId))) {
          throw new ForbiddenException();
        }
      }
    }
    const ext = name.split('.').pop() ?? '';
    const mime = Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
    const stream = await this.storage.get(`${churchId}/${kind}/${name}`);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', kind === 'logo' ? 'public, max-age=86400' : 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(res);
  }
}
