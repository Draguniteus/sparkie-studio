import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  // Simple secret guard — delete this route after use
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await query(
      "UPDATE users SET email_verified = true WHERE email = 'draguniteus@gmail.com' RETURNING id, email, email_verified",
      []
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
