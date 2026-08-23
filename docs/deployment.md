# Cindr deployment

This document is the single deployment checklist for the Stage 8 portfolio deployment. The repository supports Docker Compose for local validation and Kubernetes manifests for a small self-hosted cluster. The Kubernetes default includes TimescaleDB PostgreSQL and Redis so the full topology can be demonstrated locally; for a real product, use managed PostgreSQL/Timescale and managed Redis instead of the in-cluster stateful services.

## Authentication choice

Cindr uses **Auth.js / NextAuth v4 with GitHub OAuth and JWT sessions**. This is intentionally smaller than a custom authentication system and keeps the login UI in Next.js. The API verifies the same Auth.js-encrypted JWT using the shared `AUTH_SECRET`, then resolves the user subject to an `organization_members` row. The first successful login provisions a private organization; it does not silently join another organization. Set the same secret and canonical URL assumptions in the web and API services.

## Deployment checklist

### Repository and images

- [ ] Build from the repository root with Node.js 22 and `npm ci`.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before publishing.
- [ ] Publish `cindr-api`, `cindr-worker`, and `cindr-web` to a private or access-controlled registry. The included GitHub Actions workflow publishes `ghcr.io/<owner>/cindr-{api,worker,web}:<git-sha>` and `:latest` after validation on `main`.
- [ ] Update `infra/k8s/kustomization.yaml` image tags from `latest` to the immutable Git SHA for a real rollout.

### Database and Redis

- [ ] Create PostgreSQL with the TimescaleDB extension available. The self-hosted manifest uses `timescale/timescaledb:latest-pg16` and a 10 GiB PVC; pin a tested image digest and use backups for any non-demo deployment.
- [ ] Create Redis with persistence and authentication when it is used outside a local demo. The included Redis manifest uses an `emptyDir` and is therefore disposable.
- [ ] Apply the Secret before the workloads: `kubectl apply -f infra/k8s/secrets.yaml`. Create it from `infra/k8s/secrets.example.yaml`; never commit the filled-in file.
- [ ] Apply the database and cache services: `kubectl apply -k infra/k8s`.
- [ ] Run migrations before starting workers: `DATABASE_URL=... npm run migrate --workspace @cindr/db`. In Kubernetes, run this command from a one-off job or an operator-controlled migration runner using the API/worker image and the same Secret.
- [ ] Seed only a disposable demo environment with `npm run seed --workspace @cindr/db`. The seed creates the deterministic `cindr-demo` organization and its fixture account/resources/findings.

### API service variables

- [ ] `PORT` — Fastify listen port, normally `4000`.
- [ ] `DATABASE_URL` — PostgreSQL connection string, including credentials and database name.
- [ ] `REDIS_URL` — Redis connection string used by BullMQ.
- [ ] `AWS_REGION` — default AWS region for adapter operations.
- [ ] `AUTH_SECRET` — high-entropy shared secret, at least 32 random bytes; must match the web secret and must never be committed.
- [ ] `NEXTAUTH_URL` — canonical web URL used to choose secure Auth.js cookies, for example `https://cindr.example.com`.
- [ ] `SLACK_SIGNING_SECRET` — Slack request-signing secret, kept server-side.
- [ ] `SLACK_BOT_TOKEN` — Slack bot token with only the scopes required to post/update approval messages.
- [ ] `SLACK_CHANNEL_ID` — default channel for Cindr notifications.

### Worker service variables

- [ ] `DATABASE_URL` — the same tenant-aware PostgreSQL connection string.
- [ ] `REDIS_URL` — the BullMQ Redis connection string.
- [ ] `AWS_REGION` — provider region.
- [ ] `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN` — only when workload identity is not available. Prefer IRSA, GKE Workload Identity, or the equivalent cloud-native identity mechanism.
- [ ] Detection controls such as `UNATTACHED_VOLUME_DAYS`, `IDLE_LOAD_BALANCER_WINDOW_DAYS`, `UNDERUTILIZED_RDS_WINDOW_DAYS`, `DETECTION_SCHEDULE`, and `DETECTION_INTERVAL_MS` — review these before enabling unattended jobs.

### Web service variables

- [ ] `API_URL` — server-side Fastify origin, for example `http://cindr-api:4000` inside Kubernetes.
- [ ] `NEXT_PUBLIC_API_URL` — browser API path. Use `/api/cindr` so browser mutations stay same-origin and carry the Auth.js cookie through the Next.js proxy.
- [ ] `NEXTAUTH_URL` — public web URL, matching the OAuth callback configuration.
- [ ] `AUTH_SECRET` — exactly the same value used by the API.
- [ ] `GITHUB_ID` and `GITHUB_SECRET` — GitHub OAuth application credentials. Register the callback at `<NEXTAUTH_URL>/api/auth/callback/github`.

### Slack workspace binding

- [ ] Configure Slack Interactivity to send URL-encoded payloads to `https://<api-host>/slack/interactions`.
- [ ] Authenticate to the web app and bind one Slack `team_id` to the organization using the protected integration endpoint or an administrative UI built on top of it.
- [ ] Confirm the organization has exactly one `slack_team_id`. Rebinding is rejected; an incoming interaction from an unbound team is rejected before finding lookup.
- [ ] Verify the API receives the raw request body and forwards `x-slack-request-timestamp` and `x-slack-signature` unchanged.

## Kubernetes files

The `infra/k8s` kustomization contains API, worker, web, PostgreSQL/TimescaleDB, and Redis services. `infra/k8s/secrets.example.yaml` is intentionally not included in the kustomization. Copy it to a protected Secret creation workflow, replace every placeholder, and use an external-secrets operator or cloud secret manager for real environments. The PostgreSQL StatefulSet has a PVC and probes. Redis is a one-replica demo deployment with disposable storage; replace it with a managed Redis endpoint and remove the Redis Deployment when reliability matters.

## What is demo-safe versus not

The login boundary, JWT verification, organization membership lookup, SQL org predicates, tenant-aware worker jobs, Slack team routing, migration, and cross-organization API test are implemented. The GitHub OAuth flow requires real provider credentials. Cloud account linking, provider credential vaulting, workload identity, invitation/admin UX, and production-grade secret rotation remain intentionally outside this stage. Do not run the portfolio defaults against production cloud accounts without the controls listed below.

## If this were a real product

1. Replace first-login organization provisioning with an invitation and membership administration model, including SSO/SAML, SCIM, role separation, and explicit support tooling.
2. Move cloud access to short-lived workload identities and per-account roles; remove static credential fallbacks and add provider capability/permission discovery before any remediation.
3. Put policy changes behind versioning, review, approvals, canary evaluation, immutable audit export, and a kill switch that does not depend on the application database being healthy.
4. Replace self-hosted Redis/PostgreSQL defaults with managed services, automated migrations, PITR backups, secret rotation, observability, and disaster-recovery exercises.
5. Add end-to-end tests against isolated cloud fixtures and Slack signing/replay cases, then run security review and dependency scanning before enabling unattended remediation.
