# Cindr Architecture

> **Product:** Cindr — *Catch the waste before it burns.*

## Stage 1 boundary

This stage establishes structure and plumbing only. Detection, anomaly scoring, approvals, remediation execution, rollback, and provider-side mutations are not implemented. The state vocabulary and audit-first design are documented now so later stages can extend the same contracts without architectural drift.

## Data flow

```mermaid
flowchart LR
  A[Cloud Usage & Billing Data] --> B[Ingestion & Anomaly Detection Engine]
  B --> C[Slack Approval Message<br/>with Cost Impact]
  C --> D{Human Approve / Deny}
  D -->|Approve click| E[API Webhook]
  D -->|Deny| F[Audit log updated]
  E --> G[Worker executes cloud API / IaC change]
  G --> H[Resource updated]
  H --> I[Audit log updated]
  I --> J[Rollback option recorded]
```

The intended control loop is: **Cloud Usage & Billing Data → Ingestion & Anomaly Detection Engine → Slack Approval Message with Cost Impact → Approve click → Webhook → Worker executes cloud API/IaC change → Resource updated → Audit log updated.** Every state transition is expected to be persisted before the next transition is attempted. Slack is a delivery and interaction surface; the audit log remains the source of truth.

## Component responsibilities

### API (`apps/api`)

The Fastify API is the synchronous control-plane boundary. It exposes health checks now and will later own authenticated dashboard endpoints, Slack webhook handling, approval state transitions, and read access to audit history. It should validate requests and record durable state before publishing work to the queue.

### Worker (`apps/worker`)

The BullMQ worker is the asynchronous execution boundary. It will later consume scan and remediation jobs, apply idempotency and retry policies, call cloud or IaC adapters, and persist the result of each transition. Stage 1 includes only a no-op processor that proves the queue process can start.

### Web (`apps/web`)

The Next.js App Router dashboard is the human-facing control plane. It will later show detected waste, cost impact, approval status, audit history, and rollback actions. Stage 1 includes a minimal “Hello, Cindr” page and establishes Tailwind/PostCSS wiring.

### Database (`packages/db`)

The database package owns the PostgreSQL schema, migration configuration, and shared persistence types. Drizzle ORM was selected for its SQL-first TypeScript schema and explicit PostgreSQL/TimescaleDB compatibility. The initial schema establishes resources and append-oriented audit events without implementing product workflows.

### Slack (`packages/slack`)

The Slack package owns the Bolt app factory and Block Kit message builders. It will later handle interactive approval callbacks and response updates. Stage 1 provides a cost-impact approval message builder while keeping credentials in environment variables.

### Cloud adapters (`packages/cloud-adapters`)

The cloud adapter package isolates provider SDKs behind the `CloudProvider` interface. AWS is the first implementation using AWS SDK v3, with operations shaped so a future GCP implementation can satisfy the same interface. Stage 1 provides thin AWS wrappers but no detection policy or remediation orchestration.

## Reliability principles carried forward

The implementation is designed around idempotent actions, reversible defaults, explicit human or policy approval, provider/API retries, and a complete audit trail. These are architecture constraints for later stages, not silent automation in the scaffold.

## Stage 2 data model and state machine

The Stage 2 relational model is implemented in `packages/db/src/schema.ts` and materialized by the SQL migration in `packages/db/migrations/0000_next_sleeper.sql`. PostgreSQL enums constrain provider, resource type, finding status, action type, action status, and audit entity type at the database boundary. The `audit_log` table has a database trigger that rejects `UPDATE` and `DELETE`, making the audit trail append-only even if an application path is bypassed.

The finding lifecycle is explicitly guarded in `packages/db/src/state-machine.ts`:

```text
detected  -> proposed | denied | expired
proposed  -> approved | denied | expired
approved  -> executing | expired
executing -> completed | failed
completed -> rolled_back
failed    -> executing | rolled_back
rolled_back, denied, expired -> terminal
```

A remediation action has its own execution lifecycle:

```text
pending   -> executing
executing -> completed | failed
completed -> rolled_back
failed    -> executing | rolled_back
rolled_back -> terminal
```

The transition functions lock the current row, validate the transition against the explicit map, update the status with an optimistic current-status predicate, and insert the matching `audit_log` row inside the same Drizzle transaction. If either the status update or audit insert fails, the transaction rolls back. Repeating a request for a resource already in the requested status is treated as an idempotent no-op; illegal status changes throw `IllegalTransitionError`.

## ERD relationships in prose

A `cloud_accounts` row represents one connected AWS or GCP account. It owns many `resources` through `resources.cloud_account_id`, and it also owns many `policies` through `policies.cloud_account_id`. The account stores only a `credentials_ref`, which points to an external secrets manager; raw credentials are not represented in this schema.

Each `resources` row belongs to exactly one cloud account and is uniquely identified within that account by its provider resource type and external ID. A resource can have many `waste_findings` through `waste_findings.resource_id`. Deleting an account cascades to its resources and policies; deleting a resource cascades to its findings and their remediation actions.

A `waste_findings` row is one detected waste instance on one resource. It stores evidence and savings as JSONB/integer columns, then advances through the guarded status enum. A finding can have many `remediation_actions` through `remediation_actions.waste_finding_id`, allowing the system to preserve distinct attempts or action plans while keeping each action idempotently keyed.

A `remediation_actions` row describes the provider-side operation associated with a finding. Its action type is constrained to stop, detach, delete, or resize operations. `is_reversible` records whether the action is safe to undo, while `rollback_action` stores the structured provider-neutral instructions required to reverse it. `idempotency_key` is unique across all actions so retried approvals cannot create duplicate executions.

`audit_log` is polymorphic rather than foreign-keyed: each row points to either a waste finding or remediation action through `entity_type` and `entity_id`. This preserves a single ordered append-only audit stream for both state machines. The application writes a row for every transition, while the database trigger prevents later mutation. `policies` are scoped to a cloud account and store user-defined JSON rules, including the future auto-approve condition; they do not bypass the state machine or audit requirements.

## Stage 2 seed data

Run `npm run migrate --workspace @cindr/db` with a reachable `DATABASE_URL`, then run `npm run seed --workspace @cindr/db`. The idempotent fixture creates one fake AWS account, three fake resources (EBS, RDS, and EC2), and two findings. One finding ends in `proposed`; the other follows the audited approval path and ends in `approved`. The fixture uses fake identifiers and a `secrets://` credentials reference only; it never stores raw cloud credentials.

## Stage 3 waste detection engine

Stage 3 keeps detection logic independent from provider SDK details. `packages/cloud-adapters/src/metrics.ts` defines `CloudMetricsProvider`, `AwsMetricsApi`, and `MockCloudMetricsProvider`. Detectors consume only `listResources`, `collectMetrics`, and `estimateMonthlySavings`; the AWS-shaped seam can later call CloudWatch and Cost Explorer without changing detector predicates.

The worker runs exactly three MVP detectors: `unattached_volume`, `idle_load_balancer`, and `underutilized_rds`. The first requires zero `volume_attachment_count` across at least the configured number of UTC days, defaulting to 14. The second requires zero `load_balancer_request_count` across at least the configured seven-day window. The third requires both `rds_connection_count` and `rds_cpu_percent` to have complete configured-window coverage, defaulting to 14 days, with averages at or below configurable thresholds of one connection and ten percent CPU. Equality at a configured boundary counts as a detection; one day less coverage or a value above a configured threshold does not.

All raw points are written to `resource_metrics`. Migration `0002_strange_romulus.sql` creates the table, its foreign key/index, and calls `create_hypertable('resource_metrics', 'recorded_at', if_not_exists => TRUE)` after enabling TimescaleDB. The detection store inserts the raw points before evaluating the finding.

Findings use the partial unique natural key `(resource_id, finding_type)` for non-terminal statuses. The store uses `ON CONFLICT DO NOTHING` and then re-reads the existing open finding, so repeated hourly scans do not create duplicate waste. A newly inserted finding starts at `detected` and is immediately transitioned to `proposed`; when an active matching policy has `rule.action = 'auto_approve'`, it is then transitioned through `approved`. Both transitions are recorded through the Stage 2 transactional state machine. Slack delivery is intentionally not part of this stage.

The cost model prefers a provider-reported monthly cost. Until Cost Explorer is connected, fallbacks are rough approximations: EBS uses a simple per-GB-month estimate, load balancers use a coarse fixed estimate, RDS uses a coarse fixed estimate, and unsupported resources produce zero. These values are directional signals for review, not billing-grade precision.

The worker registers a BullMQ job scheduler named `cindr-detection-scheduler` using `DETECTION_SCHEDULE`, defaulting to `0 * * * *` (hourly). It invokes the three detectors sequentially to keep provider pressure predictable; provider-specific rate limiting and retries remain adapter responsibilities for the next stage.

## Stage 3 test strategy

Detector tests use mocked cloud metrics and an in-memory persistence boundary. They cover exact threshold boundaries and just-under-threshold cases for all three detectors, inclusive RDS metric limits, policy-driven `detected -> proposed -> approved`, and repeat-run deduplication. For money and infrastructure, good coverage must also include malformed/partial metric windows, missing provider data, cost-model fallback behavior, concurrent duplicate scans, retry/idempotency behavior, policy scope, and database transaction rollback. The current suite proves the core predicate and lifecycle contract without pretending that in-memory tests replace integration tests against PostgreSQL/TimescaleDB and provider sandboxes.

## Stage 4 Slack interactive approval workflow

`packages/slack/src/messages.ts` builds the approval payload from a waste finding, its resource, evidence, current monthly cost, and projected monthly savings. Proposed findings show the resource identifier, resource type, region, evidence, plain cost comparison, and Approve/Deny buttons. Each button carries a JSON `value` containing the finding ID and a deterministic action ID such as `cindr:approve:<finding-id>`.

`apps/api/src/slack-interactions.ts` verifies Slack’s `v0` HMAC signature over the exact raw request body and rejects timestamps outside a five-minute window. Signature verification matters because an unsigned or replayable request could let an attacker forge approval decisions for production infrastructure. Only a finding currently in `proposed` can be acted on. Approve transitions it to `approved`, enqueues one deterministic BullMQ remediation job, and updates the original Slack message using `chat.update`; Deny transitions it to `denied` and updates the same original message. A second delivery or double-click sees a non-proposed finding and is rejected before another transition or job enqueue.

The notification route `POST /slack/findings/:findingId/notify` posts a finding to the configured channel. Approved findings render without live buttons and can include `Auto-approved by policy: <policy name>`. This gives Stage 3 auto-approved findings a Slack record while preserving the Stage 2 audit trail. Stage 5 will provide the actual remediation worker behavior.

## Slack configuration checklist

Before enabling the integration, create or configure a Slack app and complete the following items:

- Set `SLACK_BOT_TOKEN` to the bot token and `SLACK_SIGNING_SECRET` to the signing secret. The signing secret must be kept server-side and never committed.
- Add the bot OAuth scopes required for the chosen delivery channel, at minimum the ability to post messages and update messages in that channel. If the bot will resolve messages in private channels, grant the corresponding private-channel history/access scope required by the Slack app configuration.
- Install or reinstall the app to the target workspace after changing scopes, then set `SLACK_CHANNEL_ID` to the destination channel ID.
- Configure the Interactivity & Shortcuts Request URL as `https://<public-api-host>/slack/interactions`. The endpoint must receive the raw URL-encoded body so signature verification covers the exact bytes Slack signed.
- Ensure the API is reachable over HTTPS from Slack and that the deployment forwards `x-slack-request-timestamp` and `x-slack-signature` unchanged.
- For Stage 5, add the remediation worker’s queue permissions and the Slack app configuration needed for any later status callbacks. No Slack event subscription is required for button clicks in this stage; Interactivity must be enabled.
