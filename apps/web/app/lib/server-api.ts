import { headers } from 'next/headers';

const SERVER_API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function serverApiFetch<T>(path: string): Promise<T> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const response = await fetch(`${SERVER_API_URL}${path}`, { cache: 'no-store', headers: cookie ? { cookie } : undefined });
  if (!response.ok) {
    let message = `API request failed (${response.status})`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-based message when the API body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
