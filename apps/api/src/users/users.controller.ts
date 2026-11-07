import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { AllowWhenBlocked, ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { CreateUserDto, UpdateProfileDto, UpdateUserDto, UsersQuery } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions(Permission.USERS_VIEW)
  @Get()
  list(@ChurchId() churchId: string, @Query() query: UsersQuery) {
    return this.users.list(churchId, query);
  }

  @Get('hosts')
  hosts(@ChurchId() churchId: string, @CurrentUser() user: AuthUser) {
    return this.users.hosts(churchId, user);
  }

  @AllowWhenBlocked()
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @RequirePermissions(Permission.USERS_MANAGE)
  @Post()
  create(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(churchId, user, dto);
  }

  @RequirePermissions(Permission.USERS_MANAGE)
  @Patch(':id')
  update(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(churchId, user, id, dto);
  }
}
