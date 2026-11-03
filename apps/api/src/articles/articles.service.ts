import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Permission, Prisma } from '@prisma/client';
import { ActivityService, changedFields } from '../activity/activity.service';
import { AuthUser, can } from '../common/auth-user';
import { paginate } from '../common/pagination';
import { StorageService } from '../files/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { importDocument, sanitizeArticle } from './article-content';
import { renderArticlePdf } from './article-pdf';
import { ArticleDto, ArticlesQuery } from './articles.dto';

const AUTHOR = { select: { id: true, firstName: true, lastName: true } };

export const isArticleEditor = (u: AuthUser) => can(u, Permission.ARTICLES_MANAGE);

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
  ) {}

  /** Los miembros solo ven los publicados. */
  private visible(churchId: string, user: AuthUser): Prisma.ArticleWhereInput {
    return { churchId, ...(!isArticleEditor(user) && { published: true, publishedAt: { lte: new Date() } }) };
  }

  async list(churchId: string, user: AuthUser, q: ArticlesQuery) {
    const where: Prisma.ArticleWhereInput = {
      ...this.visible(churchId, user),
      ...(q.q && {
        OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { summary: { contains: q.q, mode: 'insensitive' } }],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: { id: true, title: true, summary: true, coverKey: true, published: true, publishedAt: true, updatedAt: true, author: AUTHOR },
        orderBy: { publishedAt: 'desc' },
        ...paginate(q),
      }),
      this.prisma.article.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(churchId: string, user: AuthUser, id: string) {
    const article = await this.prisma.article.findFirst({ where: { ...this.visible(churchId, user), id }, include: { author: AUTHOR } });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    return article;
  }

  async create(churchId: string, userId: string, dto: ArticleDto) {
    const article = await this.prisma.article.create({
      data: { ...dto, body: this.cleanBody(dto.body), churchId, authorId: userId },
      include: { author: AUTHOR },
    });
    await this.track(churchId, userId, ActivityAction.CREATE, article);
    return article;
  }

  async update(churchId: string, userId: string, id: string, dto: ArticleDto) {
    const current = await this.prisma.article.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Artículo no encontrado');
    const data = { ...dto, body: this.cleanBody(dto.body) };
    // Al publicar un borrador, la fecha de publicación pasa a ser ahora.
    const publishedAt = dto.published && !current.published ? new Date() : undefined;
    const article = await this.prisma.article.update({ where: { id }, data: { ...data, publishedAt }, include: { author: AUTHOR } });
    await this.track(churchId, userId, ActivityAction.UPDATE, article, changedFields(current, data));
    return article;
  }

  async remove(churchId: string, userId: string, id: string) {
    const current = await this.prisma.article.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Artículo no encontrado');
    await this.prisma.article.delete({ where: { id } });
    await this.track(churchId, userId, ActivityAction.DELETE, current);
    return { ok: true };
  }

  /** Genera un borrador a partir de un .docx o PDF; no lo guarda. */
  import(churchId: string, file: Express.Multer.File) {
    return importDocument(file, churchId, this.storage);
  }

  async pdf(churchId: string, user: AuthUser, id: string) {
    const article = await this.get(churchId, user, id);
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { name: true, timezone: true } });
    const buffer = await renderArticlePdf({
      title: article.title,
      summary: article.summary,
      author: article.author ? `${article.author.firstName} ${article.author.lastName}` : null,
      publishedAt: article.publishedAt,
      churchName: church.name,
      timezone: church.timezone,
      body: article.body,
      loadImage: (src) => this.loadImage(churchId, src),
    });
    const slug = article.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return { buffer, filename: `${slug || 'articulo'}.pdf` };
  }

  private async loadImage(churchId: string, src: string) {
    const key = src.replace(/^\/api\/files\//, '');
    if (!key.startsWith(`${churchId}/image/`)) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of await this.storage.get(key)) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  private cleanBody(html: string) {
    const body = sanitizeArticle(html);
    if (!body) throw new BadRequestException('El artículo no tiene contenido');
    return body;
  }

  private track(churchId: string, userId: string, action: ActivityAction, article: { id: string; title: string }, detail?: string | null) {
    return this.activity.log({ churchId, userId, action, entity: ActivityEntity.ARTICLE, entityId: article.id, title: article.title, detail });
  }
}
