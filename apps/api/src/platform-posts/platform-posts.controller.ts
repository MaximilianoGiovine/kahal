import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, SuperAdminOnly } from '../common/decorators';
import { PlatformPostDto, PlatformPostsQuery } from './platform-posts.dto';
import { PlatformPostsService } from './platform-posts.service';

/** Noticias y avisos de Kahal para todas las iglesias. Las lee cualquier usuario con sesión. */
@Controller('platform-posts')
export class PlatformPostsController {
  constructor(private readonly posts: PlatformPostsService) {}

  @Get()
  feed(@Query() q: PlatformPostsQuery) {
    return this.posts.feed(q);
  }

  @SuperAdminOnly()
  @Get('manage')
  manage() {
    return this.posts.manage();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.get(user, id);
  }

  @SuperAdminOnly()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: PlatformPostDto) {
    return this.posts.create(user, dto);
  }

  @SuperAdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PlatformPostDto) {
    return this.posts.update(id, dto);
  }

  @SuperAdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.posts.remove(id);
  }
}
