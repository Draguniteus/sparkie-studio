import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import crypto from 'crypto';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await query<{
          id: string;
          email: string;
          display_name: string;
          avatar_url: string;
          password_hash: string;
          email_verified: boolean;
        }>(
          'SELECT id, email, display_name, avatar_url, password_hash, email_verified FROM users WHERE email = $1',
          [credentials.email.toLowerCase()]
        );

        const user = res.rows[0];
        if (!user || !user.password_hash) return null;

        const hash = crypto.createHash('sha256').update(credentials.password).digest('hex');
        if (hash !== user.password_hash) return null;

        if (!user.email_verified) {
          // Throw a recognisable error so the sign-in page can surface it
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.display_name,
          image: user.avatar_url,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
