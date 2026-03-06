import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import HomeClient from './HomeClient';

// Server component: check session server-side and redirect if not authenticated.
// This runs on every request (no static caching) and is guaranteed to work
// on Node.js deployments where middleware Edge Runtime behavior is unreliable.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return <HomeClient />;
}
