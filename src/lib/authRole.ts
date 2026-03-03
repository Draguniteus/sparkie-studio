import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type UserRole = 'owner' | 'admin' | 'mod' | 'radio' | 'user';

const ROLE_RANK: Record<UserRole, number> = {
  owner: 100,
  admin:  80,
  mod:    60,
  radio:  40,
  user:    0,
};

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Returns the session user with id + role, or null if unauthenticated */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!u?.id) return null;
  return { id: u.id, email: u.email ?? '', role: (u.role ?? 'user') as UserRole };
}

type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Require the authenticated user to have at least `minRole`.
 * Returns { ok: true, user } on success, or { ok: false, response } with 401/403.
 * Usage: const auth = await requireRole('radio'); if (!auth.ok) return auth.response;
 */
export async function requireRole(minRole: UserRole): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if ((ROLE_RANK[user.role] ?? 0) < ROLE_RANK[minRole]) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

/** Convenience: is the user at least admin? */
export async function requireAdmin(): Promise<AuthResult> {
  return requireRole('admin');
}

/** Convenience: is the user at least mod? */
export async function requireMod(): Promise<AuthResult> {
  return requireRole('mod');
}

/** Convenience: is the user at least radio? */
export async function requireRadio(): Promise<AuthResult> {
  return requireRole('radio');
}
