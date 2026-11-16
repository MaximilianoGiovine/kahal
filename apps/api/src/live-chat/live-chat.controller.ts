import { Body, Controller, Delete, Get, HttpCode, MessageEvent, Param, Post, Query, Req, Res, Sse } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Permission } from '@prisma/client';
import { Request, Response } from 'express';
import { finalize, interval, map, merge, Observable, of, takeWhile } from 'rxjs';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { ChatLogsQuery, ChatMessageDto } from './live-chat.dto';
import { LiveChatService } from './live-chat.service';

/** Evita que un proxy o el teléfono corten la conexión por inactividad. */
const PING_MS = 25_000;

@Controller('live-chat')
export class LiveChatController {
  constructor(private readonly chat: LiveChatService) {}

  @Get('streams/:streamId')
  open(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('streamId') streamId: string) {
    return this.chat.open(churchId, user, streamId);
  }

  /**
   * Eventos en tiempo real (SSE). Caddy enruta este camino sin comprimir: la compresión retiene los eventos.
   * Primero llega `ready`: la web carga los mensajes recién entonces, para no perder los que lleguen en el medio.
   */
  @SkipThrottle()
  @Sse('events/:streamId')
  async events(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('streamId') streamId: string, @Req() req: Request): Promise<Observable<MessageEvent>> {
    const { events, leave } = await this.chat.join(churchId, user, streamId);
    req.on('close', leave);
    const chat = events.pipe(map((e): MessageEvent => ({ type: e.type, data: e })));
    const ping = interval(PING_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: '' })));
    return merge(of<MessageEvent>({ type: 'ready', data: '' }), chat, ping).pipe(
      // Tras `closed` se corta la conexión: la web deja de mostrar el chat.
      takeWhile((e) => e.type !== 'closed', true),
      finalize(leave),
    );
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('streams/:streamId/messages')
  send(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('streamId') streamId: string, @Body() dto: ChatMessageDto) {
    return this.chat.send(churchId, user, streamId, dto.body);
  }

  @Delete('messages/:id')
  @HttpCode(200)
  remove(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.remove(churchId, user, id);
  }

  @RequirePermissions(Permission.ACTIVITY_VIEW)
  @Get('logs')
  logs(@ChurchId() churchId: string, @Query() q: ChatLogsQuery) {
    return this.chat.logs(churchId, q);
  }

  @RequirePermissions(Permission.ACTIVITY_VIEW)
  @Get('logs/:id')
  log(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.chat.log(churchId, id);
  }

  @RequirePermissions(Permission.ACTIVITY_VIEW)
  @Get('logs/:id/download')
  async download(@ChurchId() churchId: string, @Param('id') id: string, @Res() res: Response) {
    const log = await this.chat.log(churchId, id);
    const day = log.startedAt.toISOString().slice(0, 10);
    const slug =
      log.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .slice(0, 50) || 'transmision';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${day}-${slug}.txt"`);
    // Con BOM, el Bloc de notas de Windows muestra bien los acentos.
    res.send(`﻿${log.transcript}\n`);
  }
}
