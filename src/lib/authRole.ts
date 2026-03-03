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

/** Returns the session user with id + role, or null if unauthenticated */
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!u?.id) return null;
  return { id: u.id, email: u.email ?? '', role: (u.role ?? 'user') as UserRole };
}

/**
 * Require the authenticated user to have at least `minRole`.
 * Returns a 401/403 NextResponse on failure, or null on success.
 */
export async function requireRole(minRole: UserRole): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if ((ROLE_RANK[user.role] ?? 0) < ROLE_RANK[minRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/** Convenience: is the user at least admin? */
export async function requireAdmin() {
  return requireRole('admin');
}

/** Convenience: is the user at least mod? */
export async function requireMod() {
  return requireRole('mod');
}

/** Convenience: is the user at least radio? */
export async function requireRadio() {
  return requireRole('radio');
}
