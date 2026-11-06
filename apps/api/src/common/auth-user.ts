import { Permission } from '@prisma/client';
import { CampusScope } from './campus-scope';

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
  /** Iglesia propia del usuario (null para el super admin). */
  churchId: string | null;
  /** Iglesia sobre la que opera la request (para el super admin viene del header x-church-id). */
  activeChurchId: string | null;
  /** Permisos efectivos: unión de los permisos de todos sus roles. */
  permissions: Permission[];
  /** Sedes a las que se limitan sus miembros y finanzas. `null`: toda la iglesia. */
  campusScope: CampusScope;
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
];

/** Sedes y permisos reales de un usuario. La administración y el super admin siempre ven toda la iglesia. */
export function campusAccess(user: {
  isSuperAdmin: boolean;
  campusRestricted: boolean;
  campuses: { campusId: string }[];
  roles: { role: { isAdmin: boolean; permissions: Permission[] } }[];
}): Pick<AuthUser, 'permissions' | 'campusScope'> {
  const roles = user.roles.map((r) => r.role);
  const permissions = effectivePermissions(roles);
  if (user.isSuperAdmin || !user.campusRestricted || roles.some((r) => r.isAdmin)) return { permissions, campusScope: null };
  return {
    permissions: permissions.filter((p) => !CHURCH_WIDE_PERMISSIONS.includes(p)),
    campusScope: user.campuses.map((c) => c.campusId),
  };
}

/** El super admin pasa siempre; el resto necesita al menos uno de los permisos. */
export const can = (u: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, ...perms: Permission[]) =>
  u.isSuperAdmin || perms.some((p) => u.permissions.includes(p));

/** `true` si `actor` tiene todos los permisos de `perms` (para evitar escalar privilegios). */
export const coversAll = (actor: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, perms: Permission[]) =>
  actor.isSuperAdmin || perms.every((p) => actor.permissions.includes(p));
