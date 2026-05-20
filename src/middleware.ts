import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// HTTP Basic Auth. Not bulletproof, but stops random visitors and bots from
// reading your job board. Use a strong, unique password.
export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    return new NextResponse(
      'DASHBOARD_PASSWORD env var is not set. Refusing to serve.',
      { status: 500 }
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Basic ${btoa(`admin:${password}`)}`;

  if (auth === expected) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="LinkedIn Job Board"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
