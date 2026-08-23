import { withAuth } from 'next-auth/middleware';

export default withAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/auth/signin' },
  callbacks: { authorized: ({ token }) => !!token },
});

export const config = {
  matcher: ['/((?!auth/signin|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
