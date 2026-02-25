import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { email, password, displayName, gender, age } = await req.json();

    if (!email || !password)
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    if (password.length < 8)
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

    const emailLower = email.toLowerCase();
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const existing = await query<{ id: string; email_verified: boolean }>(
      'SELECT id, email_verified FROM users WHERE email = $1',
      [emailLower]
    );

    if (existing.rows.length > 0 && existing.rows[0].email_verified) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO users (email, display_name, password_hash, email_verified, gender, age)
         VALUES ($1, $2, $3, true, $4, $5)`,
        [
          emailLower,
          displayName ?? emailLower.split('@')[0],
          passwordHash,
          gender ?? null,
          age ?? null,
        ]
      );
    } else {
      // Re-registration of unverified user — just update password
      await query(
        `UPDATE users SET password_hash = $1, email_verified = true, display_name = $2, gender = $3, age = $4 WHERE email = $5`,
        [
          passwordHash,
          displayName ?? emailLower.split('@')[0],
          gender ?? null,
          age ?? null,
          emailLower,
        ]
      );
    }

    return NextResponse.json({ success: true, message: 'Account created. You can sign in now.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
