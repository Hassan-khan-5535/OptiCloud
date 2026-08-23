# Cindr

> **Catch the waste before it burns.**

Cindr is an automated FinOps and remediation platform for finding cloud waste, routing safe fixes through Slack approval, executing changes through provider adapters, and preserving a complete audit trail. This repository is the Stage 1 Cindr monorepo.

## Stage 1 scope

The initial Cindr stage is architecture and plumbing only. It includes a Fastify health-check API, a Next.js dashboard scaffold, a BullMQ no-op worker, Drizzle/PostgreSQL schema scaffolding, an AWS-first cloud adapter interface, Slack Block Kit builders, Docker Compose, Kubernetes base manifests, and architecture documentation. Detection and remediation logic are explicitly out of scope.

## Local development with Docker Compose

From the repository root, copy the example environment file if you need overrides, then start the stack:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

The local services are exposed at the following addresses:

| Service | Address | Stage 1 check |
| --- | --- | --- |
| API | http://localhost:4000 | `curl http://localhost:4000/health` |
| Web | http://localhost:3000 | Open in a browser |
| PostgreSQL/TimescaleDB | localhost:5433 | Database container health check |
| Redis | localhost:6380 | `redis-cli -p 6380 ping` |

Stop the stack with `docker compose -f infra/docker-compose.yml down`. Add `-v` only when you intentionally want to remove the local database and Redis volumes.

## Local development without Docker

Node.js 20 or newer is required. Install workspace dependencies from the repository root, then run each process in a separate terminal:

```bash
npm install
npm run dev:api
npm run dev:web
REDIS_URL=redis://localhost:6380 npm run dev:worker
```

The API requires a reachable PostgreSQL and Redis instance only when later persistence and job workflows are enabled; the Stage 1 health endpoint itself does not query them. Run validation with:

```bash
npm run typecheck
npm run build
```

## Kubernetes manifests

The base manifests are under [`infra/k8s/`](./infra/k8s/) and can be reviewed or composed with environment-specific overlays. They define deployments and services/configuration for the API, web, and worker. PostgreSQL and Redis are intentionally supplied as platform dependencies rather than bundled into this first application-manifest baseline.

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the data flow, component responsibilities, state-machine boundary, and the Drizzle decision.
