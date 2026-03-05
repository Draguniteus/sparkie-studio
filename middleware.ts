// deploy-trigger: 2026-03-05T21:20:00Z
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always pass: auth endpoints, static, public assets, health
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/migrate') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check session token
  let token = null;
  try {
    token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  } catch {
    // Malformed cookie — treat as unauthenticated
  }

  if (!token) {
    // API routes: return 401, no redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Non-API unauthenticated: redirect to signin, no callbackUrl
    // ONLY delete callback-url (the 431 bloat culprit)
    // DO NOT touch session-token or CSRF cookies — NextAuth needs those to work
    const signInUrl = new URL('/auth/signin', request.url);
    const response = NextResponse.redirect(signInUrl);
    response.cookies.delete('next-auth.callback-url');
    response.cookies.delete('__Secure-next-auth.callback-url');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).+)',
  ],
};
