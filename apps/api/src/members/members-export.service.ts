import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addTableSheet, DATE_FMT, newWorkbook } from '../common/excel';
import { MEMBER_STATUS_LABEL } from '../common/labels';
import { MembersQuery } from './members.dto';
import { MembersService } from './members.service';

@Injectable()
export class MembersExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  async build(churchId: string, query: Partial<MembersQuery>) {
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    const rows = await this.prisma.member.findMany({
      where: this.members.buildWhere(churchId, query),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { family: true, ministries: { include: { ministry: true } } },
    });
    const wb = newWorkbook();
    addTableSheet(
      wb,
      'Miembros',
      [
        { header: 'Apellido', key: 'lastName', width: 18 },
        { header: 'Nombre', key: 'firstName', width: 18 },
        { header: 'Estado', key: 'status', width: 14 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Teléfono', key: 'phone', width: 16 },
        { header: 'Documento', key: 'documentId', width: 14 },
        { header: 'Nacimiento', key: 'birthDate', width: 13, numFmt: DATE_FMT },
        { header: 'Ingreso', key: 'joinedAt', width: 13, numFmt: DATE_FMT },
        { header: 'Bautismo', key: 'baptismDate', width: 13, numFmt: DATE_FMT },
        { header: 'Familia', key: 'family', width: 18 },
        { header: 'Ministerios', key: 'ministries', width: 30 },
        { header: 'Dirección', key: 'address', width: 30 },
      ],
      rows.map((m) => ({
        ...m,
        status: MEMBER_STATUS_LABEL[m.status],
        family: m.family?.name ?? '',
        ministries: m.ministries.map((x) => x.ministry.name).join(', '),
      })),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return { wb, filename: `miembros-${church.slug}-${stamp}.xlsx` };
  }
}
