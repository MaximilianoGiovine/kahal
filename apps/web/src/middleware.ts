import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('kahal_session');
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/app') && !hasSession) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if ((pathname === '/login' || pathname === '/registro') && hasSession && !req.nextUrl.searchParams.has('expired')) {
    return NextResponse.redirect(new URL('/app', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/login', '/registro'] };
