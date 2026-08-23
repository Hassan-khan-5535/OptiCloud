import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/health', async () => ({
  status: 'ok',
  service: 'cindr-api',
  stage: 'scaffolding',
  timestamp: new Date().toISOString(),
}));

app.get('/', async () => ({ name: 'Cindr API', tagline: 'Catch the waste before it burns.' }));

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
