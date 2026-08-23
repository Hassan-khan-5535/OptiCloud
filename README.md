# Cindr

> **Catch the waste before it burns.**

Cindr is an automated FinOps and remediation platform for finding cloud waste, routing safe fixes through Slack approval, executing changes through provider adapters, and preserving a complete audit trail. This repository is the Cindr monorepo; Stage 1 established the service plumbing and Stage 2 adds the persistence model and approval/remediation state machine.

## Current scope

Stage 1 established a Fastify health-check API, Next.js dashboard scaffold, BullMQ no-op worker, AWS-first cloud adapter interface, Slack Block Kit builders, Docker Compose, Kubernetes base manifests, and architecture documentation. Stage 2 adds the Drizzle/PostgreSQL schema, generated SQL migrations, append-only audit protection, idempotent seed fixture, and guarded approval/remediation state machines. Detection, anomaly scoring, provider-side remediation execution, and rollback execution remain out of scope.

## Local development with Docker Compose

From the repository root, copy the example environment file if you need overrides, then start the stack:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

The local services are exposed at the following addresses:

| Service | Address | Local check |
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

The API health endpoint does not query PostgreSQL or Redis, but migration and seed commands require a reachable PostgreSQL instance. Run validation with:

```bash
npm run typecheck
npm run build

# With PostgreSQL available and DATABASE_URL set:
npm run migrate --workspace @cindr/db
npm run seed --workspace @cindr/db
```

## Kubernetes manifests

The base manifests are under [`infra/k8s/`](./infra/k8s/) and can be reviewed or composed with environment-specific overlays. They define deployments and services/configuration for the API, web, and worker. PostgreSQL and Redis are intentionally supplied as platform dependencies rather than bundled into this first application-manifest baseline.

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the data flow, component responsibilities, state-machine boundary, and the Drizzle decision.
