import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Max size: 2MB base64 encoded (covers ~1.5MB raw image)
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, WebP, or GIF.' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large. Max 2MB.' }, { status: 400 });
  }

  const b64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${file.type};base64,${b64}`;

  await query(
    'UPDATE users SET avatar_url = $1 WHERE email = $2',
    [dataUrl, session.user.email]
  );

  return NextResponse.json({ avatarUrl: dataUrl });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query('UPDATE users SET avatar_url = NULL WHERE email = $1', [session.user.email]);
  return NextResponse.json({ success: true });
}
