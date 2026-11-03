import type { Permission } from './types';

type Subject = { isSuperAdmin: boolean; permissions: Permission[] } | undefined;

/** El super admin pasa siempre; el resto necesita al menos uno de los permisos. */
export const hasPermission = (u: Subject, ...perms: Permission[]) => !!u && (u.isSuperAdmin || perms.some((p) => u.permissions.includes(p)));

export const can = {
  financeRead: (u: Subject) => hasPermission(u, 'FINANCE_VIEW'),
  financeWrite: (u: Subject) => hasPermission(u, 'FINANCE_EDIT'),
  people: (u: Subject) => hasPermission(u, 'MEMBERS_VIEW'),
  editMembers: (u: Subject) => hasPermission(u, 'MEMBERS_EDIT'),
  deleteMember: (u: Subject) => hasPermission(u, 'MEMBERS_DELETE'),
  manageMemberStatuses: (u: Subject) => hasPermission(u, 'MEMBER_STATUSES_MANAGE'),
  content: (u: Subject) => hasPermission(u, 'CONTENT_MANAGE'),
  articles: (u: Subject) => hasPermission(u, 'ARTICLES_MANAGE'),
  host: (u: Subject) => hasPermission(u, 'APPOINTMENTS_HOST'),
  allAppointments: (u: Subject) => hasPermission(u, 'APPOINTMENTS_ALL'),
  activity: (u: Subject) => hasPermission(u, 'ACTIVITY_VIEW'),
  churchSettings: (u: Subject) => hasPermission(u, 'CHURCH_SETTINGS'),
  viewUsers: (u: Subject) => hasPermission(u, 'USERS_VIEW'),
  manageUsers: (u: Subject) => hasPermission(u, 'USERS_MANAGE'),
  manageRoles: (u: Subject) => hasPermission(u, 'ROLES_MANAGE'),
  settings: (u: Subject) => hasPermission(u, 'CHURCH_SETTINGS', 'USERS_VIEW', 'ROLES_MANAGE'),
};

/** Catálogo de permisos agrupado por área, para el editor de roles. */
export const PERMISSION_GROUPS: { label: string; items: { value: Permission; label: string; help: string }[] }[] = [
  {
    label: 'Miembros',
    items: [
      { value: 'MEMBERS_VIEW', label: 'Ver miembros', help: 'Padrón, familias, ministerios, estadísticas y exportación' },
      { value: 'MEMBERS_EDIT', label: 'Editar miembros', help: 'Alta y edición de miembros, familias y ministerios' },
      { value: 'MEMBERS_DELETE', label: 'Dar de baja miembros', help: 'Eliminar fichas del padrón' },
      { value: 'MEMBER_STATUSES_MANAGE', label: 'Gestionar estados', help: 'Crear, editar, ordenar y eliminar los estados de miembros' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { value: 'FINANCE_VIEW', label: 'Ver finanzas', help: 'Movimientos, reportes, comprobantes y aportes de cada miembro' },
      { value: 'FINANCE_EDIT', label: 'Cargar finanzas', help: 'Registrar movimientos y administrar cuentas y categorías' },
    ],
  },
  {
    label: 'Contenido',
    items: [
      { value: 'CONTENT_MANAGE', label: 'Novedades, eventos y en vivo', help: 'Publicar y editar novedades, eventos y transmisiones' },
      { value: 'ARTICLES_MANAGE', label: 'Artículos', help: 'Escribir, editar y despublicar artículos' },
    ],
  },
  {
    label: 'Citas',
    items: [
      { value: 'APPOINTMENTS_HOST', label: 'Recibir citas', help: 'Aparece en la lista para agendar y configura su disponibilidad' },
      { value: 'APPOINTMENTS_ALL', label: 'Ver todas las citas', help: 'Ve y gestiona las citas de toda la iglesia' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { value: 'USERS_VIEW', label: 'Ver usuarios', help: 'Lista de cuentas y sus roles' },
      { value: 'USERS_MANAGE', label: 'Gestionar usuarios', help: 'Crear cuentas, asignar roles y habilitar o deshabilitar' },
      { value: 'ROLES_MANAGE', label: 'Gestionar roles', help: 'Crear, editar y eliminar roles' },
      { value: 'CHURCH_SETTINGS', label: 'Datos de la iglesia', help: 'Nombre, logo, colores, zona horaria y moneda' },
      { value: 'ACTIVITY_VIEW', label: 'Registro de actividad', help: 'Quién creó, modificó o eliminó contenido' },
    ],
  },
];

/** Igual que en la API: permisos que requieren otro para tener sentido. */
export const PERMISSION_IMPLIES: Partial<Record<Permission, Permission[]>> = {
  MEMBERS_EDIT: ['MEMBERS_VIEW'],
  MEMBERS_DELETE: ['MEMBERS_VIEW'],
  MEMBER_STATUSES_MANAGE: ['MEMBERS_VIEW'],
  FINANCE_EDIT: ['FINANCE_VIEW'],
  USERS_MANAGE: ['USERS_VIEW'],
  ROLES_MANAGE: ['USERS_VIEW'],
};
