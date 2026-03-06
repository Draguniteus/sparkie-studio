import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import HomeClient from './HomeClient';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    // DB unavailable or auth error — redirect to signin
  }

  if (!session) {
    redirect('/auth/signin');
  }

  return <HomeClient />;
}
