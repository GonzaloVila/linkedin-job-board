import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    return new NextResponse('DASHBOARD_PASSWORD env var is not set.', { status: 500 });
  }

  if (request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // API routes do their own auth (e.g. /api/notify-pending checks a shared
  // secret header) — the cookie check doesn't apply to server-to-server calls.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth')?.value;
  if (token === btoa(password)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
