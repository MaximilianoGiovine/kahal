import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { setupChurchDefaults } from './church-defaults';
import { AdminUpdateChurchDto, CreateChurchDto, UpdateChurchDto } from './churches.dto';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  slug: true,
  description: true,
  city: true,
  address: true,
  phone: true,
  email: true,
  logoKey: true,
  primaryColor: true,
  timezone: true,
} as const;

@Injectable()
export class ChurchesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.church.findMany({
      where: { active: true },
      select: { name: true, slug: true, city: true, logoKey: true },
      orderBy: { name: 'asc' },
    });
  }

  async getPublic(slug: string) {
    const church = await this.prisma.church.findFirst({ where: { slug, active: true }, select: PUBLIC_FIELDS });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    const [events, live] = await Promise.all([
      this.prisma.event.findMany({
        where: { churchId: church.id, isPublic: true, startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 6,
        select: { id: true, title: true, description: true, location: true, startsAt: true, endsAt: true, imageKey: true },
      }),
      this.prisma.liveStream.findFirst({
        where: { churchId: church.id, isLive: true },
        select: { id: true, title: true, url: true, platform: true },
      }),
    ]);
    return { ...church, events, live };
  }

  async get(churchId: string) {
    const church = await this.prisma.church.findUnique({ where: { id: churchId } });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    return church;
  }

  update(churchId: string, dto: UpdateChurchDto) {
    return this.prisma.church.update({ where: { id: churchId }, data: dto });
  }

  adminList() {
    return this.prisma.church.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true, users: true } } },
    });
  }

  async adminCreate(dto: CreateChurchDto) {
    if (await this.prisma.church.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException('Ya existe una iglesia con ese identificador');
    }
    const email = dto.admin.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const passwordHash = await bcrypt.hash(dto.admin.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const church = await tx.church.create({ data: { name: dto.name, slug: dto.slug, city: dto.city } });
      await setupChurchDefaults(tx, church.id);
      const admin = await tx.user.create({
        data: {
          churchId: church.id,
          email,
          passwordHash,
          firstName: dto.admin.firstName,
          lastName: dto.admin.lastName,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });
      await tx.member.create({
        data: {
          churchId: church.id,
          userId: admin.id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email,
          status: 'MEMBER',
        },
      });
      return church;
    });
  }

  adminUpdate(id: string, dto: AdminUpdateChurchDto) {
    return this.prisma.church.update({ where: { id }, data: dto });
  }
}
