import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CONTENT_ROLES } from '../common/auth-user';
import { ChurchId, CurrentUser, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { AnnouncementDto, EventDto, EventsQuery, LiveDto, StreamDto } from './content.dto';
import { ContentService } from './content.service';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('announcements')
  announcements(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.content.announcements(churchId, user, q);
  }

  @Roles(...CONTENT_ROLES)
  @Post('announcements')
  createAnnouncement(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: AnnouncementDto) {
    return this.content.createAnnouncement(churchId, user.id, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Patch('announcements/:id')
  updateAnnouncement(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: AnnouncementDto) {
    return this.content.updateAnnouncement(churchId, id, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Delete('announcements/:id')
  removeAnnouncement(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.content.removeAnnouncement(churchId, id);
  }

  @Get('events')
  events(@ChurchId() churchId: string, @Query() q: EventsQuery) {
    return this.content.events(churchId, q);
  }

  @Roles(...CONTENT_ROLES)
  @Post('events')
  createEvent(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: EventDto) {
    return this.content.createEvent(churchId, user.id, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Patch('events/:id')
  updateEvent(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: EventDto) {
    return this.content.updateEvent(churchId, id, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Delete('events/:id')
  removeEvent(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.content.removeEvent(churchId, id);
  }

  @Get('streams')
  streams(@ChurchId() churchId: string) {
    return this.content.streams(churchId);
  }

  @Roles(...CONTENT_ROLES)
  @Post('streams')
  createStream(@ChurchId() churchId: string, @Body() dto: StreamDto) {
    return this.content.createStream(churchId, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Patch('streams/:id')
  updateStream(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: StreamDto) {
    return this.content.updateStream(churchId, id, dto);
  }

  @Roles(...CONTENT_ROLES)
  @Post('streams/:id/live')
  setLive(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: LiveDto) {
    return this.content.setLive(churchId, id, dto.isLive);
  }

  @Roles(...CONTENT_ROLES)
  @Delete('streams/:id')
  removeStream(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.content.removeStream(churchId, id);
  }
}
