// deploy-trigger: 2026-03-05T07:22:00Z
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  const publicPaths = [
    '/api/auth',
    '/api/health',
    '/api/migrate',
    '/auth',
    '/_next',
    '/favicon',
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Redirect to signin — strip callbackUrl to prevent header bloat / 431 loops
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.delete('callbackUrl');
    const response = NextResponse.redirect(signInUrl);
    // Clear any bloated next-auth cookies that cause 431
    response.cookies.delete('next-auth.callback-url');
    response.cookies.delete('__Secure-next-auth.callback-url');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
