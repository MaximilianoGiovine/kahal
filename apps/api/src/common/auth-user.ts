import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  /** Iglesia propia del usuario (null para SUPER_ADMIN). */
  churchId: string | null;
  /** Iglesia sobre la que opera la request (para SUPER_ADMIN viene del header x-church-id). */
  activeChurchId: string | null;
}

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.TREASURER, Role.PASTOR, Role.SECRETARY];
export const FINANCE_ROLES: Role[] = [Role.ADMIN, Role.TREASURER];
export const FINANCE_READ_ROLES: Role[] = [Role.ADMIN, Role.TREASURER, Role.PASTOR];
export const PEOPLE_ROLES: Role[] = [Role.ADMIN, Role.SECRETARY, Role.PASTOR];
export const CONTENT_ROLES: Role[] = [Role.ADMIN, Role.SECRETARY, Role.PASTOR];
export const HOST_ROLES: Role[] = [Role.ADMIN, Role.PASTOR];
