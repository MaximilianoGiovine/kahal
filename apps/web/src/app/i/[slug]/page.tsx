import { ChurchPublic } from './church-public';

export default async function ChurchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ChurchPublic slug={slug} />;
}
