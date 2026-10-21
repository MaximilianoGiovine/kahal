import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthUser, FINANCE_ROLES, PEOPLE_ROLES } from '../common/auth-user';
import { ChurchId, CurrentUser, Roles } from '../common/decorators';
import { sendWorkbook } from '../common/excel';
import { FamilyDto, MemberDto, MembersQuery, MinistryDto } from './members.dto';
import { MembersExportService } from './members-export.service';
import { MembersService } from './members.service';

@Roles(...PEOPLE_ROLES)
@Controller()
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly exporter: MembersExportService,
  ) {}

  @Get('members')
  list(@ChurchId() churchId: string, @Query() query: MembersQuery) {
    return this.members.list(churchId, query);
  }

  /** Búsqueda mínima (nombre y documento) para asociar diezmos: la usa también Tesorería. */
  @Roles(...PEOPLE_ROLES, ...FINANCE_ROLES)
  @Get('members/lookup')
  lookup(@ChurchId() churchId: string, @Query('q') q = '') {
    return this.members.lookup(churchId, q);
  }

  @Get('members/stats')
  stats(@ChurchId() churchId: string) {
    return this.members.stats(churchId);
  }

  @Get('members/export')
  async export(@ChurchId() churchId: string, @Query() query: MembersQuery, @Res() res: Response) {
    const { wb, filename } = await this.exporter.build(churchId, query);
    await sendWorkbook(res, wb, filename);
  }

  @Get('members/:id')
  get(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.get(churchId, id, user.role);
  }

  @Post('members')
  create(@ChurchId() churchId: string, @Body() dto: MemberDto) {
    return this.members.create(churchId, dto);
  }

  @Patch('members/:id')
  update(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MemberDto) {
    return this.members.update(churchId, id, dto);
  }

  @Roles(Role.ADMIN, Role.SECRETARY)
  @Delete('members/:id')
  remove(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.remove(churchId, id);
  }

  @Get('families')
  families(@ChurchId() churchId: string) {
    return this.members.families(churchId);
  }

  @Post('families')
  createFamily(@ChurchId() churchId: string, @Body() dto: FamilyDto) {
    return this.members.createFamily(churchId, dto);
  }

  @Patch('families/:id')
  updateFamily(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: FamilyDto) {
    return this.members.updateFamily(churchId, id, dto);
  }

  @Delete('families/:id')
  removeFamily(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeFamily(churchId, id);
  }

  @Get('ministries')
  ministries(@ChurchId() churchId: string) {
    return this.members.ministries(churchId);
  }

  @Post('ministries')
  createMinistry(@ChurchId() churchId: string, @Body() dto: MinistryDto) {
    return this.members.createMinistry(churchId, dto);
  }

  @Patch('ministries/:id')
  updateMinistry(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MinistryDto) {
    return this.members.updateMinistry(churchId, id, dto);
  }

  @Delete('ministries/:id')
  removeMinistry(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeMinistry(churchId, id);
  }
}
