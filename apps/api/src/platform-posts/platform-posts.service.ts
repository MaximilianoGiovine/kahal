import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformPostKind, Prisma } from '@prisma/client';
import { sanitizeArticle } from '../articles/article-content';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformPostDto, PlatformPostsQuery } from './platform-posts.dto';

const AUTHOR = { select: { id: true, firstName: true, lastName: true } };
const SUMMARY = { id: true, kind: true, title: true, summary: true, coverKey: true, published: true, publishedAt: true, expiresAt: true, updatedAt: true } satisfies Prisma.PlatformPostSelect;

@Injectable()
export class PlatformPostsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lo que ven las iglesias: publicado, ya en fecha y sin vencer. */
  private live(): Prisma.PlatformPostWhereInput {
    const now = new Date();
    return { published: true, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }

  /** Avisos vigentes y las últimas noticias, para la página de artículos. */
  async feed(q: PlatformPostsQuery) {
    const [notices, news, newsTotal] = await Promise.all([
      this.prisma.platformPost.findMany({ where: { ...this.live(), kind: PlatformPostKind.NOTICE }, select: SUMMARY, orderBy: { publishedAt: 'desc' }, take: 20 }),
      this.prisma.platformPost.findMany({ where: { ...this.live(), kind: PlatformPostKind.NEWS }, select: SUMMARY, orderBy: { publishedAt: 'desc' }, take: q.limit }),
      this.prisma.platformPost.count({ where: { ...this.live(), kind: PlatformPostKind.NEWS } }),
    ]);
    return { notices, news, newsTotal };
  }

  /** Todo, con borradores y vencidos, para la gestión del super admin. */
  manage() {
    return this.prisma.platformPost.findMany({ select: { ...SUMMARY, author: AUTHOR }, orderBy: { publishedAt: 'desc' } });
  }

  async get(user: AuthUser, id: string) {
    const post = await this.prisma.platformPost.findFirst({ where: { id, ...(!user.isSuperAdmin && this.live()) }, include: { author: AUTHOR } });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return post;
  }

  create(user: AuthUser, dto: PlatformPostDto) {
    return this.prisma.platformPost.create({ data: { ...this.data(dto), authorId: user.id }, include: { author: AUTHOR } });
  }

  async update(id: string, dto: PlatformPostDto) {
    const current = await this.prisma.platformPost.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Publicación no encontrada');
    // Al publicar un borrador, la fecha de publicación pasa a ser ahora.
    const publishedAt = dto.published && !current.published ? new Date() : undefined;
    return this.prisma.platformPost.update({ where: { id }, data: { ...this.data(dto), publishedAt }, include: { author: AUTHOR } });
  }

  async remove(id: string) {
    const { count } = await this.prisma.platformPost.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Publicación no encontrada');
    return { ok: true };
  }

  private data(dto: PlatformPostDto) {
    const body = sanitizeArticle(dto.body);
    if (!body) throw new BadRequestException('La publicación no tiene contenido');
    // Las imágenes del cuerpo también tienen que ser de la carpeta de Kahal.
    if (/<img[^>]+src="\/api\/files\/(?!platform\/)/.test(body)) throw new BadRequestException('Usa imágenes subidas desde esta pantalla');
    return { ...dto, body, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null };
  }
}
