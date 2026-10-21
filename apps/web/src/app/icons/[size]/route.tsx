import { ImageResponse } from 'next/og';
import { LogoMark } from '@/components/logo-mark';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ size: '192' }, { size: '512' }];
}

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size) === 192 ? 192 : 512;
  return new ImageResponse(<LogoMark size={size} />, { width: size, height: size });
}
