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
    avatar_url: string | null; role: string;
  }>(
    'SELECT id, email, display_name, tier, credits, gender, age, avatar_url, role FROM users WHERE email = $1',
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
    role: user.role ?? 'user',
    gender: user.gender,
    age: user.age,
    avatarUrl: user.avatar_url,
  });
}
