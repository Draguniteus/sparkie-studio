import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

export const runtime = 'nodejs';

async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  // EMAIL_FROM must be a Resend-verified sender.
  // Free tier: use your own verified email (e.g. draguniteus@gmail.com).
  // Production: use noreply@yourdomain.com after verifying domain on resend.com/domains
  const from = process.env.EMAIL_FROM ?? 'draguniteus@gmail.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Sparkie Studio <${from}>`,
      to: [email],
      subject: 'Verify your Sparkie Studio account',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family:sans-serif;background:#0f0f0f;color:#fff;padding:40px;">
            <div style="max-width:480px;margin:0 auto;background:#1a1a2e;border-radius:12px;padding:32px;">
              <img src="${baseUrl}/sparkie-avatar.jpg" width="64" height="64"
                style="border-radius:50%;display:block;margin:0 auto 16px;" />
              <h2 style="text-align:center;color:#a78bfa;">Verify your email</h2>
              <p style="color:#ccc;text-align:center;">Click below to activate your Sparkie Studio account. Link expires in 24 hours.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${verifyUrl}"
                  style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                  Verify Email
                </a>
              </div>
              <p style="color:#666;font-size:12px;text-align:center;">If you didn&apos;t create an account, you can safely ignore this email.</p>
            </div>
          </body>
        </html>
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
      // Resend verification: refresh token only
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
