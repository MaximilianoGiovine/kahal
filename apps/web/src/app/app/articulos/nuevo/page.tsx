'use client';

import { ArticleForm } from '@/components/article-form';
import { ErrorState } from '@/components/ui';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';

export default function NewArticlePage() {
  const { me } = useSession();
  if (!can.articles(me)) return <ErrorState error={new Error('No tenés permisos para crear artículos')} />;
  return <ArticleForm item={null} />;
}
