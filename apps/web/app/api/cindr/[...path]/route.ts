const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  headers.delete('host');
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const response = await fetch(`${API_URL}/api/${path.join('/')}`, { method: request.method, headers, body, cache: 'no-store' });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
