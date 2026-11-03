import { Permission } from '@prisma/client';

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
  /** Iglesia propia del usuario (null para el super admin). */
  churchId: string | null;
  /** Iglesia sobre la que opera la request (para el super admin viene del header x-church-id). */
  activeChurchId: string | null;
  /** Permisos efectivos: unión de los permisos de todos sus roles. */
  permissions: Permission[];
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

/** El super admin pasa siempre; el resto necesita al menos uno de los permisos. */
export const can = (u: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, ...perms: Permission[]) =>
  u.isSuperAdmin || perms.some((p) => u.permissions.includes(p));

/** `true` si `actor` tiene todos los permisos de `perms` (para evitar escalar privilegios). */
export const coversAll = (actor: Pick<AuthUser, 'isSuperAdmin' | 'permissions'>, perms: Permission[]) =>
  actor.isSuperAdmin || perms.every((p) => actor.permissions.includes(p));
