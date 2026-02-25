import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require auth
const PUBLIC_PATHS = ['/auth/signin', '/auth/register', '/api/auth'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and all /api/auth/* routes
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    // Not signed in — redirect to signin
    const signInUrl = new URL('/auth/signin', req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Signed in — if they hit /auth/signin, bounce to home
  if (pathname === '/auth/signin') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static files and Next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sparkie-avatar.jpg|public/).*)'],
};
