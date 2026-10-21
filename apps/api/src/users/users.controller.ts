import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, Roles } from '../common/decorators';
import { CreateUserDto, UpdateProfileDto, UpdateUserDto, UsersQuery } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN, Role.SECRETARY)
  @Get()
  list(@ChurchId() churchId: string, @Query() query: UsersQuery) {
    return this.users.list(churchId, query);
  }

  @Roles(Role.ADMIN, Role.SECRETARY, Role.PASTOR)
  @Get('pending-count')
  async pendingCount(@ChurchId() churchId: string) {
    return { count: await this.users.pendingCount(churchId) };
  }

  @Get('hosts')
  hosts(@ChurchId() churchId: string) {
    return this.users.hosts(churchId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@ChurchId() churchId: string, @Body() dto: CreateUserDto) {
    return this.users.create(churchId, dto);
  }

  @Roles(Role.ADMIN, Role.SECRETARY)
  @Post(':id/approve')
  approve(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.users.approve(churchId, id);
  }

  @Roles(Role.ADMIN, Role.SECRETARY)
  @Post(':id/reject')
  reject(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.users.reject(churchId, id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(churchId, user.id, id, dto);
  }
}
