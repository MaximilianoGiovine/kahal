import { CampusAspect, Permission, Prisma } from '@prisma/client';
import { CampusScope, ContentAspect } from './campus-scope';

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
  /** Iglesia propia del usuario (null para el super admin). */
  churchId: string | null;
  /** Iglesia sobre la que opera la request (para el super admin viene del header x-church-id). */
  activeChurchId: string | null;
  /** Permisos efectivos: unión de los permisos de todos sus roles. */
  permissions: Permission[];
  /** Áreas que la iglesia separa por sede. Vacío si no usa sedes. */
  campusSeparated: CampusAspect[];
  /** Sedes sobre las que opera en cada área. `null`: toda la iglesia, también cuando el área es compartida. */
  campusScopes: Record<CampusAspect, CampusScope>;
  /** Sedes cuyo contenido ve, además del general. `null`: todo. */
  audiences: Record<ContentAspect, CampusScope>;
}

export const ALL_PERMISSIONS = Object.values(Permission);

/** Permisos que requieren otro para tener sentido (editar sin poder ver, etc.). */
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  MEMBERS_EDIT: [Permission.MEMBERS_VIEW],
  MEMBERS_DELETE: [Permission.MEMBERS_VIEW],
  MEMBER_STATUSES_MANAGE: [Permission.MEMBERS_VIEW],
  FINANCE_EDIT: [Permission.FINANCE_VIEW],
  USERS_MANAGE: [Permission.USERS_VIEW],
  ROLES_MANAGE: [Permission.USERS_VIEW],
};

/** Agrega los permisos implícitos y quita duplicados. */
export function normalizePermissions(perms: Permission[]): Permission[] {
  const set = new Set(perms);
  for (const p of perms) for (const dep of IMPLIES[p] ?? []) set.add(dep);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Permisos efectivos de un conjunto de roles. */
export function effectivePermissions(roles: { isAdmin: boolean; permissions: Permission[] }[]): Permission[] {
  if (roles.some((r) => r.isAdmin)) return ALL_PERMISSIONS;
  return normalizePermissions(roles.flatMap((r) => r.permissions));
}

/**
 * Permisos sobre toda la iglesia, que no aplican a quien está limitado a ciertas sedes.
 * Quitarlos cierra de raíz la escalada: no puede editar roles ni usuarios (ni los suyos a través de otro).
 */
const CHURCH_WIDE_PERMISSIONS: Permission[] = [
  Permission.USERS_VIEW,
  Permission.USERS_MANAGE,
  Permission.ROLES_MANAGE,
  Permission.CHURCH_SETTINGS,
  Permission.MEMBER_STATUSES_MANAGE,
  // El registro mezcla títulos de todas las sedes.
  Permission.ACTIVITY_VIEW,
];

/** Lo necesario para calcular `campusAccess`, también fuera de una request (feed de calendario). */
export const CAMPUS_ACCESS_SELECT = {
  isSuperAdmin: true,
  campusRestricted: true,
  campuses: { select: { campusId: true } },
  member: { select: { campusId: true } },
  church: { select: { campusesEnabled: true, campusSeparated: true } },
  roles: { select: { role: { select: { isAdmin: true, permissions: true } } } },
} satisfies Prisma.UserSelect;

/** Con este permiso, y sin límite por sede, se gestiona el contenido de toda la iglesia. */
const CONTENT_EDITOR: Record<ContentAspect, Permission> = {
  ANNOUNCEMENTS: Permission.CONTENT_MANAGE,
  EVENTS: Permission.CONTENT_MANAGE,
  STREAMS: Permission.CONTENT_MANAGE,
  ARTICLES: Permission.ARTICLES_MANAGE,
  APPOINTMENTS: Permission.APPOINTMENTS_ALL,
};

/** Sedes y permisos reales de un usuario. La administración y el super admin siempre ven toda la iglesia. */
export function campusAccess(
  user: {
    isSuperAdmin: boolean;
    campusRestricted: boolean;
    campuses: { campusId: string }[];
    member: { campusId: string | null } | null;
    roles: { role: { isAdmin: boolean; permissions: Permission[] } }[];
  },
  /** La iglesia sobre la que opera la request: para el super admin no es la propia. */
  church: { campusesEnabled: boolean; campusSeparated: CampusAspect[] } | null,
): Pick<AuthUser, 'permissions' | 'campusSeparated' | 'campusScopes' | 'audiences'> {
  const roles = user.roles.map((r) => r.role);
  const allPermissions = effectivePermissions(roles);
  const wholeChurch = user.isSuperAdmin || roles.some((r) => r.isAdmin);
  const restricted = !wholeChurch && user.campusRestricted;
  const limit = user.campuses.map((c) => c.campusId);
  const permissions = restricted ? allPermissions.filter((p) => !CHURCH_WIDE_PERMISSIONS.includes(p)) : allPermissions;
  const campusSeparated = church?.campusesEnabled ? church.campusSeparated : [];

  // El límite se mira contra la lista guardada, no contra la activa: si las sedes se apagaran, sigue fallando cerrado.
  const scope = (aspect: CampusAspect): CampusScope => (restricted && church?.campusSeparated.includes(aspect) ? limit : null);
  const audience = (aspect: ContentAspect): CampusScope => {
    if (wholeChurch || !campusSeparated.includes(aspect)) return null;
    if (!restricted && allPermissions.includes(CONTENT_EDITOR[aspect])) return null;
    const own = user.member?.campusId ? [user.member.campusId] : [];
    return restricted ? [...new Set([...limit, ...own])] : own;
  };

  return {
    permissions,
    campusSeparated,
    campusScopes: {
      MEMBERS: scope('MEMBERS'),
      FINANCE: scope('FINANCE'),
      ANNOUNCEMENTS: scope('ANNOUNCEMENTS'),
      EVENTS: scope('EVENTS'),
      ARTICLES: scope('ARTICLES'),
      STREAMS: scope('STREAMS'),
      APPOINTMENTS: scope('APPOINTMENTS'),
    },
    audiences: {
      ANNOUNCEMENTS: audience('ANNOUNCEMENTS'),
      EVENTS: audience('EVENTS'),
      ARTICLES: audience('ARTICLES'),
      STREAMS: audience('STREAMS'),
      APPOINTMENTS: audience('APPOINTMENTS'),
    },
  };
}

/** El super admin pasa siempre; el resto necesita al menos uno de los permisos. */
export const can = (u: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, ...perms: Permission[]) =>
  u.isSuperAdmin || perms.some((p) => u.permissions.includes(p));

/** `true` si `actor` tiene todos los permisos de `perms` (para evitar escalar privilegios). */
export const coversAll = (actor: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, perms: Permission[]) =>
  actor.isSuperAdmin || perms.every((p) => actor.permissions.includes(p));
