'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ArticleForm } from '@/components/article-form';
import { ErrorState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Article } from '@/lib/types';

export default function EditArticlePage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const allowed = can.articles(me);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['articles', 'detail', id], queryFn: () => api<Article>(`/articles/${id}`), enabled: allowed });

  if (!allowed) return <ErrorState error={new Error('No tenés permisos para editar artículos')} />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  return <ArticleForm item={data} />;
}
