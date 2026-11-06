import { Injectable } from '@nestjs/common';
import { CampusScope } from '../common/campus-scope';
import { PrismaService } from '../prisma/prisma.service';
import { addTableSheet, DATE_FMT, newWorkbook } from '../common/excel';
import { MembersQuery } from './members.dto';
import { MembersService } from './members.service';

@Injectable()
export class MembersExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  async build(churchId: string, scope: CampusScope, query: Partial<MembersQuery>) {
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    const rows = await this.prisma.member.findMany({
      where: this.members.buildWhere(churchId, scope, query),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { campus: true, family: true, ministries: { include: { ministry: true } }, statuses: { include: { status: true } } },
    });
    const wb = newWorkbook();
    addTableSheet(
      wb,
      'Miembros',
      [
        { header: 'Apellido', key: 'lastName', width: 18 },
        { header: 'Nombre', key: 'firstName', width: 18 },
        ...(church.campusesEnabled ? [{ header: 'Sede', key: 'campus', width: 20 }] : []),
        { header: 'Estados', key: 'statuses', width: 22 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Teléfono', key: 'phone', width: 16 },
        { header: 'Documento', key: 'documentId', width: 14 },
        { header: 'Nacimiento', key: 'birthDate', width: 13, numFmt: DATE_FMT },
        { header: 'Ingreso', key: 'joinedAt', width: 13, numFmt: DATE_FMT },
        { header: 'Bautizado/a', key: 'baptized', width: 12 },
        { header: 'Bautismo', key: 'baptismDate', width: 13, numFmt: DATE_FMT },
        { header: 'Familia', key: 'family', width: 18 },
        { header: 'Ministerios', key: 'ministries', width: 30 },
        { header: 'Dirección', key: 'address', width: 30 },
      ],
      rows.map((m) => ({
        ...m,
        campus: m.campus?.name ?? '',
        statuses: m.statuses.map((x) => x.status.name).join(', '),
        baptized: m.baptized === null ? '' : m.baptized ? 'Sí' : 'No',
        family: m.family?.name ?? '',
        ministries: m.ministries.map((x) => x.ministry.name).join(', '),
      })),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return { wb, filename: `miembros-${church.slug}-${stamp}.xlsx` };
  }
}
