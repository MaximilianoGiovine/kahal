import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { assertWholeChurch, CampusScope } from '../common/campus-scope';
import { ChurchId, CurrentUser, RequirePermissions, UserCampusScope } from '../common/decorators';
import { sendWorkbook } from '../common/excel';
import { FamilyDto, MemberDto, MembersQuery, MemberStatusDto, MinistryDto, ReorderDto } from './members.dto';
import { MembersExportService } from './members-export.service';
import { MembersService } from './members.service';

@RequirePermissions(Permission.MEMBERS_VIEW)
@Controller()
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly exporter: MembersExportService,
  ) {}

  @Get('members')
  list(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() query: MembersQuery) {
    return this.members.list(churchId, scope, query);
  }

  /** Búsqueda mínima (nombre y documento) para asociar diezmos: la usa también Tesorería. */
  @RequirePermissions(Permission.MEMBERS_VIEW, Permission.FINANCE_EDIT)
  @Get('members/lookup')
  lookup(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query('q') q = '') {
    return this.members.lookup(churchId, scope, q);
  }

  @Get('members/stats')
  stats(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() query: MembersQuery) {
    return this.members.stats(churchId, scope, query.campusId);
  }

  @Get('members/export')
  async export(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() query: MembersQuery, @Res() res: Response) {
    const { wb, filename } = await this.exporter.build(churchId, scope, query);
    await sendWorkbook(res, wb, filename);
  }

  @Get('members/:id')
  get(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.get(churchId, id, user);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('members')
  create(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Body() dto: MemberDto) {
    return this.members.create(churchId, scope, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('members/:id')
  update(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: MemberDto) {
    return this.members.update(churchId, scope, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_DELETE)
  @Delete('members/:id')
  remove(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string) {
    return this.members.remove(churchId, scope, id);
  }

  @Get('families')
  families(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope) {
    return this.members.families(churchId, scope);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('families')
  createFamily(@ChurchId() churchId: string, @Body() dto: FamilyDto) {
    return this.members.createFamily(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('families/:id')
  updateFamily(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: FamilyDto) {
    return this.members.updateFamily(churchId, scope, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Delete('families/:id')
  removeFamily(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string) {
    return this.members.removeFamily(churchId, scope, id);
  }

  @Get('member-statuses')
  memberStatuses(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope) {
    return this.members.memberStatuses(churchId, scope);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Post('member-statuses')
  createMemberStatus(@ChurchId() churchId: string, @Body() dto: MemberStatusDto) {
    return this.members.createMemberStatus(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Put('member-statuses/order')
  reorderMemberStatuses(@ChurchId() churchId: string, @Body() dto: ReorderDto) {
    return this.members.reorderMemberStatuses(churchId, dto.ids);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Patch('member-statuses/:id')
  updateMemberStatus(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MemberStatusDto) {
    return this.members.updateMemberStatus(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Delete('member-statuses/:id')
  removeMemberStatus(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeMemberStatus(churchId, id);
  }

  @Get('ministries')
  ministries(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope) {
    return this.members.ministries(churchId, scope);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('ministries')
  createMinistry(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Body() dto: MinistryDto) {
    assertWholeChurch(scope);
    return this.members.createMinistry(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('ministries/:id')
  updateMinistry(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: MinistryDto) {
    assertWholeChurch(scope);
    return this.members.updateMinistry(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Delete('ministries/:id')
  removeMinistry(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string) {
    assertWholeChurch(scope);
    return this.members.removeMinistry(churchId, id);
  }
}
