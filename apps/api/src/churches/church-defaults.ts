import { Currency, Permission, Prisma, TransactionType, UserStatus } from '@prisma/client';

export const DEFAULT_CATEGORIES: { name: string; type: TransactionType; color: string; isTithe?: boolean }[] = [
  { name: 'Diezmos', type: 'INCOME', color: '#16a34a', isTithe: true },
  { name: 'Ofrendas', type: 'INCOME', color: '#22c55e' },
  { name: 'Ofrendas especiales', type: 'INCOME', color: '#4ade80' },
  { name: 'Donaciones', type: 'INCOME', color: '#0d9488' },
  { name: 'Eventos', type: 'INCOME', color: '#0ea5e9' },
  { name: 'Otros ingresos', type: 'INCOME', color: '#64748b' },
  { name: 'Alquiler', type: 'EXPENSE', color: '#dc2626' },
  { name: 'Servicios', type: 'EXPENSE', color: '#ea580c' },
  { name: 'Sueldos y honorarios', type: 'EXPENSE', color: '#d97706' },
  { name: 'Mantenimiento', type: 'EXPENSE', color: '#ca8a04' },
  { name: 'Misiones', type: 'EXPENSE', color: '#9333ea' },
  { name: 'Ayuda social', type: 'EXPENSE', color: '#db2777' },
  { name: 'Eventos', type: 'EXPENSE', color: '#2563eb' },
  { name: 'Equipamiento', type: 'EXPENSE', color: '#4f46e5' },
  { name: 'Otros egresos', type: 'EXPENSE', color: '#64748b' },
];

export const DEFAULT_ACCOUNTS: { name: string; currency: Currency }[] = [
  { name: 'Caja general', currency: 'ARS' },
  { name: 'Banco', currency: 'ARS' },
];

/** Roles iniciales; cada iglesia puede editarlos, borrarlos o crear otros. */
export const DEFAULT_ROLES = {
  pastor: { name: 'Pastor', description: 'Acceso total a la iglesia', isAdmin: true, permissions: [] },
  equipo: {
    name: 'Equipo pastoral',
    description: 'Miembros, usuarios, contenido, artículos y recibe citas',
    permissions: ['MEMBERS_VIEW', 'MEMBERS_EDIT', 'MEMBERS_DELETE', 'USERS_VIEW', 'CONTENT_MANAGE', 'ARTICLES_MANAGE', 'APPOINTMENTS_HOST'],
  },
  lider: {
    name: 'Líder',
    description: 'Miembros, contenido, artículos y recibe citas',
    permissions: ['MEMBERS_VIEW', 'MEMBERS_EDIT', 'CONTENT_MANAGE', 'ARTICLES_MANAGE', 'APPOINTMENTS_HOST'],
  },
  tesoreria: { name: 'Tesorería', description: 'Registro y reportes de finanzas', permissions: ['FINANCE_VIEW', 'FINANCE_EDIT'] },
  secretaria: {
    name: 'Secretaría',
    description: 'Miembros, usuarios, contenido y artículos',
    permissions: ['MEMBERS_VIEW', 'MEMBERS_EDIT', 'MEMBERS_DELETE', 'USERS_VIEW', 'CONTENT_MANAGE', 'ARTICLES_MANAGE'],
  },
} satisfies Record<string, { name: string; description: string; isAdmin?: boolean; permissions: Permission[] }>;

export type DefaultRoleKey = keyof typeof DEFAULT_ROLES;

/** Estados iniciales de miembros; cada iglesia puede editarlos, borrarlos o crear otros. */
export const DEFAULT_MEMBER_STATUSES = {
  visitante: { name: 'Visitante', color: '#d97706' },
  asistente: { name: 'Asistente', color: '#64748b', isDefault: true },
  miembro: { name: 'Miembro', color: '#4f46e5' },
  bautizado: { name: 'Bautizado', color: '#16a34a' },
  inactivo: { name: 'Inactivo', color: '#94a3b8', inactive: true },
} satisfies Record<string, { name: string; color: string; isDefault?: boolean; inactive?: boolean }>;

export type DefaultStatusKey = keyof typeof DEFAULT_MEMBER_STATUSES;

/** Crea roles, estados, categorías y cuentas iniciales para una iglesia nueva. Devuelve sus ids. */
export async function setupChurchDefaults(tx: Prisma.TransactionClient, churchId: string) {
  await tx.financeCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, isTithe: c.isTithe ?? false, churchId })),
  });
  await tx.financeAccount.createMany({ data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, churchId })) });
  const roles = {} as Record<DefaultRoleKey, string>;
  for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
    roles[key as DefaultRoleKey] = (await tx.churchRole.create({ data: { ...def, churchId } })).id;
  }
  const statuses = {} as Record<DefaultStatusKey, string>;
  for (const [position, [key, def]] of Object.entries(DEFAULT_MEMBER_STATUSES).entries()) {
    statuses[key as DefaultStatusKey] = (await tx.memberStatus.create({ data: { ...def, position, churchId } })).id;
  }
  return { roles, statuses };
}

/** Crea una iglesia con sus datos iniciales y el usuario de su pastor. Corre dentro de la transacción de quien la llama. */
export async function createChurchWithAdmin(
  tx: Prisma.TransactionClient,
  data: {
    name: string;
    slug: string;
    city?: string | null;
    admin: { firstName: string; lastName: string; email: string; phone?: string | null; passwordHash: string; consentAt?: Date };
  },
) {
  const { admin } = data;
  const church = await tx.church.create({ data: { name: data.name, slug: data.slug, city: data.city } });
  const { roles, statuses } = await setupChurchDefaults(tx, church.id);
  const user = await tx.user.create({
    data: {
      churchId: church.id,
      email: admin.email,
      passwordHash: admin.passwordHash,
      firstName: admin.firstName,
      lastName: admin.lastName,
      phone: admin.phone,
      consentAt: admin.consentAt,
      status: UserStatus.ACTIVE,
      roles: { create: { roleId: roles.pastor } },
    },
  });
  await tx.member.create({
    data: {
      churchId: church.id,
      userId: user.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      phone: admin.phone,
      statuses: { create: { statusId: statuses.miembro } },
    },
  });
  return church;
}
