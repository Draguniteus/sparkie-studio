import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Internal API routes called server-side by the agent — never need user auth
const INTERNAL_API_ALLOWLIST = [
  '/api/sparkie-feed',
  '/api/memory',
  '/api/sparkie-self-memory',
  '/api/messages',
  '/api/sparkie-tasks',
  '/api/worklog',
  '/api/image',
  '/api/music',
  '/api/video',
  '/api/speech',
  '/api/lyrics',
  '/api/build',
  '/api/chat',
  '/api/classify',
  '/api/weather',
  '/api/terminal',
  '/api/db',
  '/api/transcribe',
  '/api/health',
  '/api/deploy-monitor',
  '/api/assets',
  '/api/radio',
  '/api/admin',
  '/api/agent',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth routes, static assets, and API health/public endpoints
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  // Allow all API routes without auth (server-to-server calls, no session cookie)
  if (INTERNAL_API_ALLOWLIST.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // On HTTPS (production), NextAuth uses __Secure- prefixed cookie names
  const isSecure = req.nextUrl.protocol === 'https:';
  const cookieName = isSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isSecure,
    cookieName,
  });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon).*)'],
};
