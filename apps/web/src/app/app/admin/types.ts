import type { ActivityAction, ActivityEntity, Currency, UserStatus } from '@/lib/types';
import type { AdminBillingChurch, AdminBillingState } from './donaciones/types';

export interface MonthPoint {
  month: string;
  count: number;
}

export interface AdminOverview {
  totals: { churches: number; enabledChurches: number; members: number; users: number; pendingUsers: number };
  billing: {
    states: Record<AdminBillingState, number>;
    monthly: Partial<Record<Currency, number>>;
    attention: { id: string; name: string; city: string | null; state: AdminBillingState; until: string | null; createdAt: string }[];
  };
  requests: { pending: number; oldest: { id: string; name: string; city: string | null; adminFirstName: string; adminLastName: string; createdAt: string }[] };
  growth: { users: MonthPoint[]; churches: MonthPoint[]; donations: (MonthPoint & { totals: Partial<Record<Currency, number>> })[] };
  topChurches: { id: string; name: string; slug: string; city: string | null; members: number; users: number }[];
  dormant: { days: number; churches: { id: string; name: string; city: string | null; lastLoginAt: string | null }[] };
  recentDonations: { id: string; churchId: string | null; churchName: string; amount: number | null; currency: Currency | null; receivedAt: string; coversUntil: string }[];
}

export interface AdminUserBrief {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminChurchDetail {
  church: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoKey: string | null;
    timezone: string;
    defaultCurrency: Currency;
    active: boolean;
    campusesEnabled: boolean;
    youtubeUrl: string | null;
    facebookUrl: string | null;
    twitchUrl: string | null;
    deletionRequestedAt: string | null;
    deletionScheduledFor: string | null;
    createdAt: string;
  };
  counts: Record<
    'members' | 'users' | 'campuses' | 'ministries' | 'families' | 'events' | 'announcements' | 'articles' | 'streams' | 'transactions' | 'appointments' | 'prayerRequests',
    number
  >;
  usersByStatus: Record<UserStatus, number>;
  lastLoginAt: string | null;
  admins: AdminUserBrief[];
  recentUsers: AdminUserBrief[];
  activity: { id: string; action: ActivityAction; entity: ActivityEntity; title: string; createdAt: string; user: { firstName: string; lastName: string } | null }[];
  agreement: { id: string; acceptedAt: string; signerFirstName: string; signerLastName: string; signerRole: string; contractVersion: string } | null;
  request: { id: string; createdAt: string; message: string | null } | null;
  billing: AdminBillingChurch;
}

/** Color de cada estado de activación, para barras y marcas (siempre junto a su nombre). */
export const STATE_COLOR: Record<AdminBillingState, string> = {
  EXPIRED: 'var(--danger)',
  DUE: 'var(--warning)',
  PENDING: 'var(--accent)',
  ACTIVE: 'var(--success)',
  EXEMPT: 'color-mix(in oklab, var(--success) 45%, var(--subtle))',
  CLOSING: 'var(--subtle)',
};
