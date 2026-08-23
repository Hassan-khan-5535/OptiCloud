# Cindr

> **Catch the waste before it burns.**

Cindr is an automated FinOps and remediation platform for finding cloud waste, routing safe fixes through Slack approval, executing changes through provider adapters, and preserving a complete audit trail. This repository is the Cindr monorepo; Stages 1–5 establish the service plumbing, persistence and state machine, detection engine, Slack approval workflow, and bounded remediation execution.

## Current scope

Stage 1 established the Fastify API, Next.js dashboard scaffold, BullMQ worker, AWS-first adapter interface, Slack builders, Docker Compose, Kubernetes base manifests, and architecture documentation. Stage 2 adds the Drizzle/PostgreSQL schema, migrations, append-only audit protection, seed fixture, and guarded state machines. Stage 3 adds the three MVP detectors and TimescaleDB metrics. Stage 4 adds signed Slack approvals and idempotent remediation enqueueing. Stage 5 adds snapshot-first EBS deletion, provider-capability-aware load-balancer handling, one-tier RDS resizing, Redis-backed rate limiting, bounded retries, and rollback jobs.

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

Stage 5 remediation controls are configured through `AWS_REQUESTS_PER_SECOND` and `GCP_REQUESTS_PER_SECOND`, both defaulting to five provider requests per second per cloud account. The dashboard rollback endpoint is `POST /api/remediations/:id/rollback`; it queues rollback for the worker rather than mutating infrastructure in the API process. See `docs/architecture.md` for the action safety judgment and provider configuration checklist.

## Kubernetes manifests

The base manifests are under [`infra/k8s/`](./infra/k8s/) and can be reviewed or composed with environment-specific overlays. They define deployments and services/configuration for the API, web, and worker. PostgreSQL and Redis are intentionally supplied as platform dependencies rather than bundled into this first application-manifest baseline.

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the data flow, component responsibilities, state-machine boundary, and the Drizzle decision.
