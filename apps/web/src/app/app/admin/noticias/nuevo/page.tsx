'use client';

import { PlatformPostForm } from '@/components/platform-post-form';
import { ErrorState } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function NewPlatformPostPage() {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;
  return <PlatformPostForm item={null} />;
}
