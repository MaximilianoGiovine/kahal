import { Body, Controller, Delete, Get, Param, ParseFilePipeBuilder, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { ArticleDto, ArticlesQuery } from './articles.dto';
import { ArticlesService } from './articles.service';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  list(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: ArticlesQuery) {
    return this.articles.list(churchId, user, q);
  }

  @RequirePermissions(Permission.ARTICLES_MANAGE)
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  import(@ChurchId() churchId: string, @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: true })) file: Express.Multer.File) {
    return this.articles.import(churchId, file);
  }

  @Get(':id')
  get(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articles.get(churchId, user, id);
  }

  @Get(':id/pdf')
  async pdf(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.articles.pdf(churchId, user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }

  @RequirePermissions(Permission.ARTICLES_MANAGE)
  @Post()
  create(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: ArticleDto) {
    return this.articles.create(churchId, user.id, dto);
  }

  @RequirePermissions(Permission.ARTICLES_MANAGE)
  @Patch(':id')
  update(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArticleDto) {
    return this.articles.update(churchId, user.id, id, dto);
  }

  @RequirePermissions(Permission.ARTICLES_MANAGE)
  @Delete(':id')
  remove(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articles.remove(churchId, user.id, id);
  }
}
