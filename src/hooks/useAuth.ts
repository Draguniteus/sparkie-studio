import { useSession, signIn, signOut } from 'next-auth/react';

export function useAuth() {
  const { data: session, status } = useSession();
  return {
    user: session?.user ?? null,
    userId: (session?.user as { id?: string })?.id ?? null,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    signIn: () => signIn(undefined, { callbackUrl: '/' }),
    signOut: () => signOut({ callbackUrl: '/auth/signin' }),
  };
}
