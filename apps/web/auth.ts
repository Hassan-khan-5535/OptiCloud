import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  providers: [GitHubProvider({
    clientId: process.env.GITHUB_ID ?? 'not-configured',
    clientSecret: process.env.GITHUB_SECRET ?? 'not-configured',
  })],
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
