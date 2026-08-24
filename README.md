# Cindr

> **Catch the waste before it burns.**
>
> A cloud FinOps control plane for finding waste, reviewing safe actions, executing approved remediation, and keeping an organization-scoped audit trail.

[![CI](https://img.shields.io/github/actions/workflow/status/atifkhani397/OptiCloud/ci.yml?branch=main&label=CI&logo=github)](https://github.com/atifkhani397/OptiCloud/actions) [![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![Next.js](https://img.shields.io/badge/Next.js-16.3.2-000000?logo=next.js&logoColor=white)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![License](https://img.shields.io/badge/license-private-lightgrey)](#license)

## Overview

Cindr watches tracked cloud resources, detects common waste patterns, evaluates explicit policies, routes human approvals through Slack, executes bounded provider actions in a worker, and records state transitions in PostgreSQL. The web dashboard gives operators a focused view of findings, policies, accounts, remediation state, and rollback status.

```mermaid
flowchart LR
    A[Cloud resources and metrics] --> B[Worker]
    B --> C[Detectors]
    C --> D[(PostgreSQL / TimescaleDB)]
    D --> E[Policy evaluator]
    E --> F{Safe action?}
    F -->|Review required| G[Slack approval]
    F -->|Approved| H[BullMQ / Redis]
    G --> H
    H --> I[Remediation worker]
    I --> J[Provider adapter]
    D --> K[Next.js dashboard]
    K --> L[Fastify API]
    L --> D
```

> **Current status:** The application, API, worker, policy engine, Slack approval path, rollback workflow, migrations, and security hardening are implemented and validated. Real AWS account onboarding and provider resource synchronization remain future work. Do not enable unattended cloud mutation until those integrations and a staging deployment have been verified.

## UI preview

Cindr opens with organization-scoped GitHub sign-in, then takes operators into a dark FinOps control plane for monitoring waste, reviewing findings, and managing remediation policies. The screenshots below show the current interface using representative demo data.

### GitHub sign-in

![Cindr GitHub sign-in screen](./docs/screenshots/cindr-sign-in.png)

### Operations dashboard

![Cindr operations dashboard with live motion charts](./docs/screenshots/cindr-dashboard.png)

### Policy governance

![Cindr policy governance and new policy form](./docs/screenshots/cindr-policies.png)

## What is included?

| Area | What Cindr provides |
|---|---|
| Dashboard | Next.js dashboard for overview, findings, policies, and connected-account status. |
| API | Fastify API with Auth.js JWT verification, organization resolution, role checks, CSRF same-origin checks, bounded request bodies, and explicit CORS. |
| Detection | MVP detectors for unattached EBS volumes, idle load balancers, and underutilized RDS instances. |
| Policy engine | Versioned compound rules with live and dry-run modes, safety evaluation, and organization-scoped persistence. |
| Approvals | Slack signature verification, approval/denial actions, replay-window checks, idempotent enqueueing, and organization-scoped channels. |
| Remediation | Snapshot-first EBS deletion, RDS one-tier resizing, capability-aware load-balancer handling, retries, rate limits, and rollback. |
| Storage | PostgreSQL/TimescaleDB schema with tenant-aware constraints, metric deduplication, state machines, and append-only audit protection. |
| Local stack | Docker Compose topology for web, API, worker, PostgreSQL/TimescaleDB, and Redis. |
| Kubernetes | Base manifests under [`infra/k8s`](./infra/k8s/) with probes and non-root workload hardening. |

## Quick start with Docker Compose

### 1. Prerequisites

Install the following before starting:

| Tool | Recommended version |
|---|---:|
| Docker | Docker Engine with Compose v2 |
| Node.js | 22 or newer |
| npm | Included with Node.js |
| Git | Any current version |

### 2. Configure a local secret

From the repository root:

```bash
cp .env.example .env
printf 'AUTH_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env
```

If you do not have OpenSSL, replace `AUTH_SECRET` manually with a long random value. The Compose file intentionally refuses to start without an explicit `AUTH_SECRET`.

### 3. Start the stack

```bash
docker compose -f infra/docker-compose.yml up --build
```

The local services are available here:

| Service | URL or address | Check |
|---|---|---|
| Web dashboard | [http://localhost:3000](http://localhost:3000) | Open in a browser |
| API | [http://localhost:4000](http://localhost:4000) | `curl http://localhost:4000/health` |
| API readiness | [http://localhost:4000/ready](http://localhost:4000/ready) | Requires a reachable database |
| PostgreSQL | `localhost:5433` | Published on loopback only |
| Redis | `localhost:6380` | `redis-cli -p 6380 ping` |

The local Compose worker uses `METRICS_PROVIDER=mock` by default so the demo topology can start without a cloud ingestion service. The mock provider is for local demos and tests only; it does not discover real cloud resources.

### 4. Stop the stack

```bash
docker compose -f infra/docker-compose.yml down
```

Add `-v` only when you intentionally want to remove the local PostgreSQL and Redis data volumes.

## Development without Docker

You need reachable PostgreSQL/TimescaleDB and Redis instances. Install dependencies from the repository root:

```bash
npm ci
```

Start the services in separate terminals:

```bash
npm run dev:api
npm run dev:web
REDIS_URL=redis://localhost:6380 npm run dev:worker
```

For a local demo without a real metrics ingestion service, explicitly select the mock provider:

```bash
METRICS_PROVIDER=mock REDIS_URL=redis://localhost:6380 npm run dev:worker
```

For a normal tracked-resource run, leave `METRICS_PROVIDER` unset. The worker then uses the tenant-scoped database metrics provider and reads resources and metric samples already stored in PostgreSQL.

## Database setup

Set `DATABASE_URL` before running database commands:

```bash
npm run migrate --workspace @cindr/db
```

Seed only a disposable demo database:

```bash
npm run seed --workspace @cindr/db
```

The seed creates a deterministic `cindr-demo` organization, a demo account, tracked resources, supported detector findings, and audit entries. Never run the demo seed against a production database.

## Environment variables

Copy [`.env.example`](./.env.example) as a starting point. The most important settings are listed below.

### Required or commonly used

| Variable | Example | Purpose |
|---|---|---|
| `AUTH_SECRET` | Long random value | Shared Auth.js/API JWT secret. Required by Compose. |
| `DATABASE_URL` | `postgresql://cindr:password@localhost:5433/cindr` | PostgreSQL connection string. |
| `REDIS_URL` | `redis://localhost:6380` | BullMQ and rate-limiter connection. |
| `NEXTAUTH_URL` | `http://localhost:3000` | Canonical web URL for Auth.js. |
| `API_URL` | `http://localhost:4000` | Server-side API origin used by Next.js. |
| `NEXT_PUBLIC_API_URL` | `/api/cindr` | Browser API path. Same-origin proxying is recommended. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated API origin allowlist. |
| `AWS_REGION` | `us-east-1` | Default provider region. |
| `METRICS_PROVIDER` | `database` or `mock` | Use `mock` only for tests/demos. Production defaults to `database`. |

### Authentication and integrations

| Variable | Purpose |
|---|---|
| `GITHUB_ID`, `GITHUB_SECRET` | Optional GitHub OAuth credentials. If absent, the sign-in page displays a clear unavailable state. |
| `SLACK_SIGNING_SECRET` | Verifies Slack interaction signatures. |
| `SLACK_BOT_TOKEN` | Allows Cindr to post and update Slack messages. |
| `SLACK_TEAM_ID` | Optional demo-seed Slack workspace ID. |
| `SLACK_CHANNEL_ID` | Legacy/global configuration; organization-scoped channel binding is preferred. |

### Database and worker tuning

| Variable | Purpose |
|---|---|
| `DATABASE_SSL` | Set to `require` when PostgreSQL TLS is required. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Keep `true` unless a controlled local certificate exception is needed. |
| `DB_POOL_MAX` | Maximum PostgreSQL pool size; defaults to `10`. |
| `DB_CONNECTION_TIMEOUT_MS` | PostgreSQL connection timeout; defaults to `5000`. |
| `DB_STATEMENT_TIMEOUT_MS` | PostgreSQL statement timeout; defaults to `30000`. |
| `API_BODY_LIMIT_BYTES` | Maximum API request body; defaults to `1048576`. |
| `RDS_OPERATION_TIMEOUT_MS` | Maximum RDS readiness wait; defaults to `300000`. |
| `AWS_REQUESTS_PER_SECOND` | AWS remediation rate limit per account; defaults to `5`. |
| `GCP_REQUESTS_PER_SECOND` | GCP remediation rate limit per account; defaults to `5`. |

## Useful commands

Run these commands from the repository root:

| Command | What it does |
|---|---|
| `npm ci` | Installs the exact lockfile dependency tree. |
| `npm test` | Builds shared packages first, then runs worker, Slack, and API tests. |
| `npm run typecheck` | Builds shared packages and type-checks API, web, and worker apps. |
| `npm run lint` | Runs linting across workspaces that provide a lint script. |
| `npm run build` | Builds all shared packages and applications for production. |
| `npm run dev:api` | Starts the Fastify API in development mode. |
| `npm run dev:web` | Starts the Next.js dashboard in development mode. |
| `npm run dev:worker` | Starts the BullMQ worker in development mode. |
| `npm run migrate --workspace @cindr/db` | Applies pending PostgreSQL migrations. |
| `npm run seed --workspace @cindr/db` | Inserts demo data into a disposable database. |

A clean validation run should look like this:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

## Slack approval setup

Slack interactivity should send URL-encoded payloads to:

```text
https://<api-host>/slack/interactions
```

The protected organization binding endpoint expects both the Slack workspace and channel identifiers:

```bash
curl -X POST http://localhost:4000/api/integrations/slack/bind \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <authenticated-session-cookie>' \
  -d '{"team_id":"T0123456789","channel_id":"C0123456789"}'
```

The caller must be an organization administrator. Rebinding an organization to a different Slack workspace is rejected. Incoming Slack actions are checked against the bound workspace before finding lookup, and signed requests are accepted only inside the configured replay window.

## API endpoints

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/health` | Liveness check; does not require the database. |
| `GET` | `/ready` | Readiness check; verifies database access. |
| `GET` | `/api/overview` | Authenticated organization member. |
| `GET` | `/api/findings/:id` | Authenticated organization member. |
| `GET` | `/api/policies` | Authenticated organization member. |
| `POST` | `/api/policies` | Organization administrator; same-origin mutation. |
| `POST` | `/api/remediations/:id/rollback` | Organization administrator or operator; same-origin mutation. |
| `POST` | `/api/integrations/slack/bind` | Organization administrator; requires `team_id` and `channel_id`. |
| `POST` | `/slack/interactions` | Slack signature verification; no browser session required. |

The web app normally calls the API through the same-origin Next.js proxy at `/api/cindr`, which keeps browser requests within the Auth.js cookie boundary.

## Detection and remediation flow

Cindr currently includes three MVP detector types:

1. **Unattached EBS volume:** identifies available volumes that have no attachments for the configured age window.
2. **Idle load balancer:** identifies load balancers with insufficient activity over the configured window. Unsupported provider actions are routed to manual review.
3. **Underutilized RDS instance:** identifies low-connection and low-CPU database instances using the configured thresholds.

A detector stores evidence and metric observations, evaluates active policies, and transitions findings through the guarded state machine. Approval creates an idempotent BullMQ job. The worker applies bounded provider actions, persists rollback instructions, and waits for RDS stabilization before marking a resize complete.

## Kubernetes deployment

The manifests are under [`infra/k8s`](./infra/k8s/). Before deployment:

1. Build and publish the API, web, and worker images to an access-controlled registry.
2. Create a protected `infra/k8s/secrets.yaml` from [`infra/k8s/secrets.example.yaml`](./infra/k8s/secrets.example.yaml). Never commit populated secrets.
3. Apply database migrations from a controlled migration job.
4. Review image tags, resource limits, storage, ingress, backup, and secret-manager configuration for your cluster.
5. Apply the stack:

```bash
kubectl apply -f infra/k8s/secrets.yaml
kubectl apply -k infra/k8s
```

The application manifests use GHCR image names, non-root security contexts, dropped Linux capabilities, readiness/liveness probes, and bounded PostgreSQL/Redis resources. For production, replace floating application tags with immutable release tags or digests, use managed PostgreSQL/Redis where appropriate, and configure workload identity instead of long-lived cloud keys.

## Security checklist

Before enabling real cloud accounts or automatic remediation:

- Use a high-entropy `AUTH_SECRET` shared only by the web and API services.
- Configure an explicit `CORS_ORIGINS` allowlist; do not use wildcard or reflected origins.
- Keep `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` in a secret manager.
- Use organization roles and the `x-organization-id` header only with a validated membership.
- Apply all database migrations, including tenant-aware composite foreign keys and the append-only audit trigger.
- Prefer cloud workload identity such as IRSA or an equivalent over static access keys.
- Run `npm audit --omit=dev` and the full validation suite in CI.
- Test migration behavior against a staging copy before production rollout.
- Do not use `METRICS_PROVIDER=mock` outside a demo or test environment.

## Project structure

```text
.
├── apps/
│   ├── api/          Fastify API, Auth.js token verification, Slack routes
│   ├── web/          Next.js dashboard and same-origin API proxy
│   └── worker/       BullMQ worker, detectors, remediation engine
├── packages/
│   ├── cloud-adapters/  Provider-neutral metrics and remediation contracts
│   ├── db/              Drizzle schema, migrations, state machines, seed
│   └── slack/           Slack Block Kit builders and payload helpers
├── infra/
│   ├── docker-compose.yml
│   └── k8s/
├── docs/
│   ├── architecture.md
│   └── deployment.md
├── .env.example
└── package.json
```

## Documentation

- [Architecture guide](./docs/architecture.md)
- [Deployment checklist](./docs/deployment.md)
- [Audit report](./OPTICLOUD_AUDIT_REPORT.md)
- [Repair report](./OPTICLOUD_REPAIR_REPORT.md)
- [Example environment file](./.env.example)

## Known limitations

The cloud-account connect control is intentionally disabled until the OAuth or role-assumption flow is implemented. The production metrics provider reads tenant-scoped tracked resources and stored observations from PostgreSQL, but a real cloud ingestion/synchronization service is still required to populate those tables for newly connected accounts.

Docker runtime verification depends on a machine with Docker installed. Kubernetes manifests have been statically reviewed but must be applied and tested in a staging cluster before production use. Immediate RDS application is still enabled by the provider adapter; readiness polling protects state accuracy, while maintenance-window policy should be decided separately for production.

## Contributing

Keep changes small and testable. Before opening a pull request, run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm audit --omit=dev`. Include migrations with schema changes, add regression tests for security or state-machine behavior, and document any new environment variables.

## License

This repository is private. Add the project’s approved license here before distributing the software outside its current organization.
