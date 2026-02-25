import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await query<{
    id: string; email: string; display_name: string;
    tier: string; credits: number; gender: string | null; age: number | null;
  }>(
    'SELECT id, email, display_name, tier, credits, gender, age FROM users WHERE email = $1',
    [session.user.email]
  );

  const user = res.rows[0];
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    tier: user.tier ?? 'free',
    credits: user.credits ?? 0,
    gender: user.gender,
    age: user.age,
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { displayName } = body;

  if (typeof displayName === 'string' && displayName.trim()) {
    await query(
      'UPDATE users SET display_name = $1 WHERE email = $2',
      [displayName.trim(), session.user.email]
    );
  }

  return NextResponse.json({ success: true });
}
