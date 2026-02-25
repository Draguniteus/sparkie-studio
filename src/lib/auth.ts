import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import crypto from 'crypto';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const res = await query<{ id: string; email: string; display_name: string; avatar_url: string; password_hash: string }>(
          'SELECT id, email, display_name, avatar_url, password_hash FROM users WHERE email = $1',
          [credentials.email.toLowerCase()]
        );
        const user = res.rows[0];
        if (!user || !user.password_hash) return null;
        const hash = crypto.createHash('sha256').update(credentials.password).digest('hex');
        if (hash !== user.password_hash) return null;
        return { id: user.id, email: user.email, name: user.display_name, image: user.avatar_url };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      // Upsert user row on every sign-in
      await query(
        `INSERT INTO users (email, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET display_name = COALESCE(EXCLUDED.display_name, users.display_name),
               avatar_url   = COALESCE(EXCLUDED.avatar_url,   users.avatar_url),
               updated_at   = now()
         RETURNING id`,
        [user.email.toLowerCase(), user.name ?? null, user.image ?? null]
      );
      return true;
    },
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
