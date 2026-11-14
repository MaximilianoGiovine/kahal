'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { PlatformPostForm } from '@/components/platform-post-form';
import { ErrorState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { PlatformPost } from '@/lib/types';

export default function EditPlatformPostPage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin } = useSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-posts', 'detail', id],
    queryFn: () => api<PlatformPost>(`/platform-posts/${id}`),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  return <PlatformPostForm item={data} />;
}
