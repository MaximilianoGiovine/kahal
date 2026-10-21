import type { Role } from './types';

const is = (role: Role | undefined, roles: Role[]) => !!role && (role === 'SUPER_ADMIN' || roles.includes(role));

export const can = {
  financeRead: (r?: Role) => is(r, ['ADMIN', 'TREASURER', 'PASTOR']),
  financeWrite: (r?: Role) => is(r, ['ADMIN', 'TREASURER']),
  people: (r?: Role) => is(r, ['ADMIN', 'SECRETARY', 'PASTOR']),
  approve: (r?: Role) => is(r, ['ADMIN', 'SECRETARY']),
  deleteMember: (r?: Role) => is(r, ['ADMIN', 'SECRETARY']),
  content: (r?: Role) => is(r, ['ADMIN', 'SECRETARY', 'PASTOR']),
  host: (r?: Role) => is(r, ['ADMIN', 'PASTOR']),
  settings: (r?: Role) => is(r, ['ADMIN']),
  allAppointments: (r?: Role) => is(r, ['ADMIN']),
  staff: (r?: Role) => is(r, ['ADMIN', 'TREASURER', 'PASTOR', 'SECRETARY']),
};
