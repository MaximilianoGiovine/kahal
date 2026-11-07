import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { AnnouncementDto, AnnouncementsQuery, EventDto, EventsQuery, LiveDto, StreamDto, StreamsQuery } from './content.dto';
import { ContentService } from './content.service';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('announcements')
  announcements(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: AnnouncementsQuery) {
    return this.content.announcements(churchId, user, q);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Post('announcements')
  createAnnouncement(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: AnnouncementDto) {
    return this.content.createAnnouncement(churchId, user, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Patch('announcements/:id')
  updateAnnouncement(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnnouncementDto) {
    return this.content.updateAnnouncement(churchId, user, id, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Delete('announcements/:id')
  removeAnnouncement(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.content.removeAnnouncement(churchId, user, id);
  }

  @Get('events')
  events(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: EventsQuery) {
    return this.content.events(churchId, user, q);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Post('events')
  createEvent(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: EventDto) {
    return this.content.createEvent(churchId, user, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Patch('events/:id')
  updateEvent(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EventDto) {
    return this.content.updateEvent(churchId, user, id, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Delete('events/:id')
  removeEvent(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.content.removeEvent(churchId, user, id);
  }

  @Get('streams')
  streams(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: StreamsQuery) {
    return this.content.streams(churchId, user, q);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Post('streams')
  createStream(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: StreamDto) {
    return this.content.createStream(churchId, user, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Patch('streams/:id')
  updateStream(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StreamDto) {
    return this.content.updateStream(churchId, user, id, dto);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Post('streams/:id/live')
  setLive(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LiveDto) {
    return this.content.setLive(churchId, user, id, dto.isLive);
  }

  @RequirePermissions(Permission.CONTENT_MANAGE)
  @Delete('streams/:id')
  removeStream(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.content.removeStream(churchId, user, id);
  }
}
