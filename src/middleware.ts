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

  const token = request.cookies.get('auth')?.value;
  if (token === btoa(password)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
