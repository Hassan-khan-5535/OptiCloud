import { getToken } from 'next-auth/jwt';
import type { FastifyRequest } from 'fastify';

export type AuthenticatedUser = { subject: string; email?: string | null; name?: string | null };
export type AuthenticatedContext = AuthenticatedUser & { orgId: string };

function tokenRequest(request: FastifyRequest): Parameters<typeof getToken>[0]['req'] {
  const rawCookie = request.headers.cookie;
  const cookies = Object.fromEntries((typeof rawCookie === 'string' ? rawCookie : '').split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([name]) => name.length > 0));
  return {
    headers: request.headers as Record<string, string | string[] | undefined>,
    cookies,
  } as Parameters<typeof getToken>[0]['req'];
}

export async function authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({ req: tokenRequest(request), secret, cookieName: process.env.AUTH_COOKIE_NAME });
  if (!token?.sub) return null;
  return { subject: token.sub, email: typeof token.email === 'string' ? token.email : null, name: typeof token.name === 'string' ? token.name : null };
}
