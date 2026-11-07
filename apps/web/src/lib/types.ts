import type { Currency } from './currencies';

export type Permission =
  | 'MEMBERS_VIEW'
  | 'MEMBERS_EDIT'
  | 'MEMBERS_DELETE'
  | 'MEMBER_STATUSES_MANAGE'
  | 'FINANCE_VIEW'
  | 'FINANCE_EDIT'
  | 'CONTENT_MANAGE'
  | 'ARTICLES_MANAGE'
  | 'APPOINTMENTS_HOST'
  | 'APPOINTMENTS_ALL'
  | 'USERS_VIEW'
  | 'USERS_MANAGE'
  | 'ROLES_MANAGE'
  | 'CHURCH_SETTINGS'
  | 'ACTIVITY_VIEW';

/** Roles asignados a un usuario, tal como los devuelve la API. */
export type UserRoles = { role: { id: string; name: string } }[];

export interface ChurchRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  /** Rol de administración: tiene todos los permisos y no se puede eliminar. */
  isAdmin: boolean;
  _count: { users: number };
}
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
export type { Currency };
export type TxType = 'INCOME' | 'EXPENSE';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChurchBrief {
  id: string;
  name: string;
  slug: string;
  logoKey: string | null;
  primaryColor: string | null;
  timezone: string;
  defaultCurrency: Currency;
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isSuperAdmin: boolean;
  roles: UserRoles;
  /** Permisos efectivos (unión de todos sus roles). */
  permissions: Permission[];
  /** Sedes sobre las que opera en cada área. `null`: toda la iglesia, también si el área es compartida. */
  campusScopes: Record<CampusAspect, string[] | null>;
  status: UserStatus;
  /** Falso en cuentas creadas con Google o Apple que todavía no definieron contraseña. */
  hasPassword: boolean;
  identities: { provider: 'GOOGLE' | 'APPLE'; email: string | null }[];
  church: ChurchBrief | null;
  /** Ficha del padrón vinculada a la cuenta (los datos que se piden al registrarse). */
  member: { id: string; documentId: string | null; birthDate: string | null; baptized: boolean | null; address: string | null; campus: CampusRef | null } | null;
}

export interface Church extends ChurchBrief {
  description: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  youtubeUrl: string | null;
  facebookUrl: string | null;
  twitchUrl: string | null;
  autoLiveEnabled: boolean;
  deletionScheduledFor: string | null;
  billingExempt: boolean;
}

export type CampusAspect = 'MEMBERS' | 'FINANCE' | 'ANNOUNCEMENTS' | 'EVENTS' | 'ARTICLES' | 'STREAMS' | 'APPOINTMENTS';

export interface CampusRef {
  id: string;
  name: string;
}

export interface CampusList {
  enabled: boolean;
  separated: CampusAspect[];
  items: (CampusRef & { city: string | null; active: boolean })[];
}

export interface CampusRow extends CampusRef {
  city: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
  _count: { members: number; accounts: number; userAccess: number; announcements: number; events: number; articles: number; streams: number };
}

export interface CampusManage {
  enabled: boolean;
  separated: CampusAspect[];
  items: CampusRow[];
  unassignedMembers: number;
  restrictedUsers: number;
}

export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: UserRoles;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  member: { id: string } | null;
  campusRestricted: boolean;
  campuses: { campus: CampusRef }[];
}

/** Estado de miembro tal como se muestra junto a cada persona. */
export interface StatusRef {
  id: string;
  name: string;
  color: string | null;
}

/** Estado de miembro definido por la iglesia. */
export interface MemberStatus extends StatusRef {
  description: string | null;
  position: number;
  /** Se asigna automáticamente a quienes crean su cuenta. */
  isDefault: boolean;
  /** No cuenta como miembro activo en el inicio. */
  inactive: boolean;
  _count: { members: number };
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  documentId: string | null;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  address: string | null;
  statuses?: { status: StatusRef }[];
  joinedAt: string | null;
  baptismDate: string | null;
  baptized: boolean | null;
  familyId: string | null;
  familyRole: string | null;
  notes: string | null;
  photoKey: string | null;
  createdAt: string;
  campusId: string | null;
  campus?: CampusRef | null;
  family?: { id: string; name: string } | null;
  ministries?: { ministry: { id: string; name: string } }[];
  user?: { id: string; roles: UserRoles; status: UserStatus; email?: string; lastLoginAt?: string | null } | null;
}

export interface MemberDetail extends Member {
  family: { id: string; name: string; members: { id: string; firstName: string; lastName: string; familyRole: string | null }[] } | null;
  giving: { id: string; date: string; amount: string; type: TxType; account: { currency: Currency }; category: { name: string } }[] | null;
}

export interface Family {
  id: string;
  name: string;
  members: { id: string; firstName: string; lastName: string; familyRole: string | null }[];
}

export interface Ministry {
  id: string;
  name: string;
  description: string | null;
  leaderId: string | null;
  leader: { id: string; firstName: string; lastName: string } | null;
  _count: { members: number };
}

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  initialBalance: string;
  balance: string;
  active: boolean;
  campusId: string | null;
  campus: CampusRef | null;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string | null;
  isTithe: boolean;
  active: boolean;
  _count?: { transactions: number };
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: string;
  date: string;
  description: string | null;
  reference: string | null;
  receiptKey: string | null;
  accountId: string;
  categoryId: string;
  memberId: string | null;
  account: { id: string; name: string; currency: Currency; campus: CampusRef | null };
  category: { id: string; name: string; color: string | null; isTithe: boolean };
  member: { id: string; firstName: string; lastName: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface Totals {
  income: string;
  expense: string;
  net: string;
}

export interface FinanceSummary {
  totals: Record<string, Totals>;
  byCategory: { categoryId: string; name: string; color: string | null; type: TxType; currency: Currency; total: string; count: number }[];
  accounts: Account[];
  monthly: { month: string; type: TxType; currency: Currency; total: string }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  imageKey: string | null;
  pinned: boolean;
  published: boolean;
  publishedAt: string;
  author: { id: string; firstName: string; lastName: string } | null;
  campusId: string | null;
  campus: CampusRef | null;
}

export interface ChurchEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  imageKey: string | null;
  isPublic: boolean;
  campusId: string | null;
  campus: CampusRef | null;
}

export interface Stream {
  id: string;
  title: string;
  description: string | null;
  url: string;
  platform: 'YOUTUBE' | 'FACEBOOK' | 'TWITCH' | 'OTHER';
  scheduledAt: string | null;
  isLive: boolean;
  campusId: string | null;
  campus: CampusRef | null;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface Appointment {
  id: string;
  hostId: string;
  requesterId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  hostNotes: string | null;
  host: Person;
  requester: Person;
}

export interface Availability {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface Host {
  id: string;
  firstName: string;
  lastName: string;
  roles: UserRoles;
  _count: { availability: number };
}

export interface ArticleSummary {
  id: string;
  title: string;
  summary: string | null;
  coverKey: string | null;
  published: boolean;
  publishedAt: string;
  updatedAt: string;
  author: { id: string; firstName: string; lastName: string } | null;
  campusId: string | null;
  campus: CampusRef | null;
}

export interface Article extends ArticleSummary {
  /** HTML saneado por la API. */
  body: string;
}

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type ActivityEntity = 'ANNOUNCEMENT' | 'EVENT' | 'STREAM' | 'ARTICLE';

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  title: string;
  detail: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; roles: UserRoles } | null;
}
