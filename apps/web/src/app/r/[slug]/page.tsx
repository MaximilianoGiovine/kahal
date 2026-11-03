import { redirect } from 'next/navigation';

/** Destino fijo de los QR impresos: lleva al registro con la iglesia ya elegida. */
export default async function ChurchRegisterRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/registro?iglesia=${encodeURIComponent(slug)}`);
}
