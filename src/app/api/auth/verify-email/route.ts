import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(
      new URL('/auth/signin?error=missing_token', req.url)
    );
  }

  const res = await query<{ id: string; verify_token_expires: Date }>(
    `SELECT id, verify_token_expires FROM users
     WHERE verify_token = $1 AND email_verified = false`,
    [token]
  );

  if (res.rows.length === 0) {
    return NextResponse.redirect(
      new URL('/auth/signin?error=invalid_token', req.url)
    );
  }

  const user = res.rows[0];
  if (new Date() > new Date(user.verify_token_expires)) {
    return NextResponse.redirect(
      new URL('/auth/signin?error=token_expired', req.url)
    );
  }

  await query(
    `UPDATE users SET email_verified = true, verify_token = null, verify_token_expires = null WHERE id = $1`,
    [user.id]
  );

  return NextResponse.redirect(
    new URL('/auth/signin?verified=1', req.url)
  );
}
