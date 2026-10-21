export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TREASURER' | 'PASTOR' | 'SECRETARY' | 'MEMBER';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
export type MemberStatus = 'VISITOR' | 'ATTENDEE' | 'MEMBER' | 'BAPTIZED' | 'INACTIVE';
export type Currency = 'ARS' | 'USD';
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
  role: Role;
  status: UserStatus;
  church: ChurchBrief | null;
  member: { id: string } | null;
}

export interface Church extends ChurchBrief {
  description: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  member: { id: string } | null;
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
  status: MemberStatus;
  joinedAt: string | null;
  baptismDate: string | null;
  familyId: string | null;
  familyRole: string | null;
  notes: string | null;
  photoKey: string | null;
  createdAt: string;
  family?: { id: string; name: string } | null;
  ministries?: { ministry: { id: string; name: string } }[];
  user?: { id: string; role: Role; status: UserStatus; email?: string; lastLoginAt?: string | null } | null;
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
  account: { id: string; name: string; currency: Currency };
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
}

export interface Stream {
  id: string;
  title: string;
  description: string | null;
  url: string;
  platform: 'YOUTUBE' | 'FACEBOOK' | 'OTHER';
  scheduledAt: string | null;
  isLive: boolean;
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
  role: Role;
  _count: { availability: number };
}
