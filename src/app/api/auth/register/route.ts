import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

export const runtime = 'nodejs';

async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Sparkie Studio <noreply@sparkiestudio.com>',
      to: [email],
      subject: 'Verify your Sparkie Studio account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#fff;border-radius:16px">
          <img src="${baseUrl}/sparkie-avatar.jpg" width="64" height="64"
            style="border-radius:50%;margin-bottom:16px;border:2px solid #f5a623" alt="Sparkie" />
          <h2 style="margin:0 0 8px">Verify your email</h2>
          <p style="color:#aaa;margin:0 0 24px">Click the button below to activate your Sparkie Studio account. Link expires in 24 hours.</p>
          <a href="${verifyUrl}"
            style="display:inline-block;background:#f5a623;color:#000;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">
            Verify Email
          </a>
          <p style="color:#555;font-size:12px;margin-top:24px">If you didn&apos;t create an account, ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

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

    if (existing.rows.length > 0) {
      if (existing.rows[0].email_verified) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      }
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO users (email, display_name, password_hash, email_verified, verify_token, verify_token_expires, gender, age)
         VALUES ($1, $2, $3, false, $4, $5, $6, $7)`,
        [
          emailLower,
          displayName ?? emailLower.split('@')[0],
          passwordHash,
          verifyToken,
          verifyExpires,
          gender ?? null,
          age ?? null,
        ]
      );
    } else {
      // Resend: update token only
      await query(
        `UPDATE users SET verify_token = $1, verify_token_expires = $2 WHERE email = $3`,
        [verifyToken, verifyExpires, emailLower]
      );
    }

    await sendVerificationEmail(emailLower, verifyToken);

    return NextResponse.json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
