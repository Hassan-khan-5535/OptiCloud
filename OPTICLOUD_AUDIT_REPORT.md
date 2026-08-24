# OptiCloud / Cindr Repository Audit Report

**Author:** Manus AI
**Audited revision:** `85d47eb2cbfb90cd533189b7a44fa0c77f5157d7` (`85d47eb`, `feat: add auth tenancy and deployment`)
**Audit date:** 24 August 2026
**Scope:** Read-only review of application code, database schema, worker/remediation logic, Slack integration, web UI, dependency health, CI, Docker, and Kubernetes configuration.

## Executive assessment

The repository is a promising TypeScript monorepo with a clean separation between API, web, worker, database, cloud adapters, and Slack packages. The type checker, linter, and production build pass after dependencies are installed. However, the current checkout is **not ready for unattended remediation or production deployment**. The most serious issues are that a clean checkout fails its declared test command, the production worker is wired to an empty mock metrics provider, authenticated members can perform privileged policy and remediation operations, tenant references are not enforced at the database boundary, Slack approval is not queue-consistent, and EBS rollback does not restore the original resource identity.

The audit identified **8 high-severity findings, 10 medium-severity findings, and 5 low-severity or hardening findings**. The high-severity items should be addressed before enabling real cloud accounts or automatic approvals.

| Priority | Count | Meaning |
|---|---:|---|
| High | 8 | Can break the product, enable privilege/tenant boundary failures, or create unsafe/incomplete infrastructure changes. |
| Medium | 10 | Causes material user-visible, operational, security, or data-integrity problems under realistic conditions. |
| Low / hardening | 5 | Important for maintainability, reproducibility, accessibility, or production hygiene, but not an immediate exploit or outage by itself. |

> **Important limitation:** This was a repository and local-runtime audit. It did not use real cloud credentials, attempt destructive AWS operations, attack a remote deployment, or submit Slack messages. Findings about cloud mutation are based on the production adapter and state transitions in the repository.

## Validation baseline

The following commands were run from a clean clone using Node.js `v22.13.0` and npm `10.9.2`:

| Check | Result | Notes |
|---|---|---|
| `npm ci` | Pass | Installed 590 packages; npm reported 8 vulnerabilities. |
| `npm test` immediately after `npm ci` | **Fail** | Worker tests could not resolve workspace package `dist` entrypoints. |
| `npm run typecheck` | Pass | The script builds prerequisite packages before checking apps. |
| `npm run lint` | Pass | No ESLint errors or warnings. |
| `npm run build` | Pass | Production builds completed. |
| `npm test` after `npm run build` | Pass | This confirms the first failure is a clean-checkout/test-order defect rather than a failing assertion in the current tests. |
| `npm audit --omit=dev` | **4 high** | Runtime dependency tree includes `drizzle-orm`, `next`, `postcss`, and `sharp` advisories. |
| Docker Compose runtime | Not executed | The sandbox does not have the `docker` binary. The compose file was inspected statically. |

The raw diagnostic logs and npm audit JSON are attached separately with this report.

## High-severity findings

### H-01 — Clean checkout test command fails before the repository is built

**Evidence:** The root scripts run `npm test` independently of `npm run build`, while the workspace packages expose their compiled `dist` files as package entrypoints. The worker tests import `@cindr/db` and `@cindr/cloud-adapters`, which resolve to missing `dist/index.js` files immediately after `npm ci` [1]. The failure was reproduced locally as `ERR_MODULE_NOT_FOUND` for both package paths.

**Impact:** The CI workflow runs `npm test` before the production build, so a normal pull request or push validation fails on a clean runner even though the tests pass after a build. This blocks CI and creates a false impression that the test suite is healthy.

**Recommended fix:** Either build all workspace libraries before tests, or make test-time package resolution point to TypeScript source. The safer short-term fix is to add a deterministic `build:packages` prerequisite to the root `test` script and CI. Add a clean-checkout CI job that runs `npm ci && npm test` without relying on previous commands.

### H-02 — Production detection is permanently wired to an empty mock provider

**Evidence:** The worker constructs `new MockCloudMetricsProvider([], [])` as its metrics provider [2]. The recurring scheduler registers detection jobs, but every organization is scanned through that empty provider [2]. The real `AwsCloudMetricsProvider` is only an adapter seam and is not wired into the worker.

**Impact:** Scheduled production detection scans zero resources, stores no metrics, creates no findings, and therefore cannot drive the dashboard or remediation workflow. This is a silent functional failure: the worker can report that a detection run completed while doing no useful work.

**Recommended fix:** Inject a real provider implementation from configuration and fail startup in non-test environments when the provider is mock or empty. Add an integration test that runs a scheduled detection job against a provider fixture and asserts that resources, metrics, and findings are persisted.

### H-03 — A normal organization member can create live auto-approval policies and invoke privileged mutations

**Evidence:** `requireOrgContext` checks only that an authenticated context exists [5]. The policy-creation, Slack binding, rollback, and Slack notification routes do not inspect `context.role` [5]. The role is stored and returned by organization resolution, but there is no other role enforcement in the application [6]. A temporary route probe with `role: 'member'` received HTTP `201` while creating an active `auto_approve` policy.

**Impact:** Any authenticated member can create a policy that automatically approves infrastructure remediation, bind an arbitrary Slack workspace to the organization, queue rollback, or publish findings to the configured Slack channel. This is a privilege-escalation and safety-boundary failure.

**Recommended fix:** Define an explicit authorization matrix. At minimum, require an administrator or dedicated policy-management role for live policy creation and Slack binding, and require a separately authorized operator role for rollback. Enforce the check in a shared route guard rather than relying on UI visibility. Record the authenticated subject as `createdBy` instead of the literal `'dashboard'` [7].

### H-04 — User-supplied cloud-account IDs are not checked against the active organization

**Evidence:** `createPolicy` accepts `input.cloudAccountId` and inserts it into a policy without first selecting that account with `orgId` [7]. The database schema has independent `orgId` columns, but `policies.cloudAccountId` only references the account primary key; it does not enforce that both rows belong to the same organization [8]. `listPolicies` then joins the referenced account and returns its provider and external ID using only the policy organization filter [7].

**Impact:** A caller who obtains or guesses another account UUID can create an organization-A policy referencing an organization-B account. The policy listing can then expose the other account’s provider/external ID to organization A, and policy evaluation can apply a policy to resources associated with the referenced account. This is both a tenant-integrity and potential data-disclosure defect.

**Recommended fix:** For every user-supplied account ID, select it with `WHERE cloud_accounts.id = ? AND cloud_accounts.org_id = currentOrgId` before insertion. Add composite foreign keys or database constraints that pair `(org_id, cloud_account_id)` across policies, resources, findings, remediation actions, and evaluations. Add a real two-organization integration test that attempts cross-tenant references, not only a guessed finding read.

### H-05 — Slack approval is not transactionally consistent with remediation enqueueing

**Evidence:** The handler transitions the finding to `approved` and then enqueues the remediation job [9]. If queue insertion fails, the finding remains approved even though no job exists. A Slack retry then sees a non-`proposed` finding and receives a conflict, so it cannot repair the missing queue entry. The handler also validates the original Slack message channel and timestamp only after the state transition and approval enqueue [9].

**Impact:** A transient Redis outage or malformed signed payload can leave infrastructure approval state ahead of execution state. The user sees an approval outcome, but the remediation never runs and the retry path cannot recover it. A malformed payload can also cause a state mutation before returning HTTP 400.

**Recommended fix:** Validate every required payload field before any side effect. Use an outbox or durable command record written in the same database transaction as the approval transition, then let a worker publish the queue message. Alternatively, make approved-state processing idempotently enqueue from the worker and allow safe retries from `approved`. Add tests for queue failure, Slack retry, and missing `message.ts`/channel.

### H-06 — EBS rollback can be declared reversible while persisting incomplete instructions

**Evidence:** The delete-volume execution path stores `availabilityZone` as `undefined` when resource metadata does not contain it [3]. The rollback parser later requires `snapshotId` and a string `availabilityZone` [3]. The AWS restore operation needs both values to create a replacement volume [4].

**Impact:** A volume can be snapshotted and deleted successfully, and the action can be marked completed, while rollback later fails because the required availability zone was never persisted. This violates the product’s reversible-remediation promise and can turn an otherwise recoverable deletion into a manual incident.

**Recommended fix:** Treat availability zone as a precondition before snapshot/delete. If it is absent, stop at manual review and do not execute the delete. Store a complete rollback record before the destructive call, validate it against a schema, and add a test proving that missing metadata blocks deletion.

### H-07 — EBS rollback creates a new volume but does not restore or link the resource identity

**Evidence:** `restoreVolumeSnapshot` calls AWS `CreateVolume` from the snapshot and discards the returned volume ID [4]. The rollback engine then marks the remediation action and finding as `rolled_back` [3]. There is no update to the `resources.externalId` record and no returned replacement-volume reference.

**Impact:** The original EBS volume is deleted, a replacement may be created under a different ID, and the database continues to point at the deleted volume. The UI can show a successful rollback while detectors and operators still reference the wrong resource. This can lead to repeated findings or additional actions against a nonexistent volume.

**Recommended fix:** Return the new volume ID from the provider, persist it in a controlled resource-reconciliation workflow, and include the replacement ID in the audit record and API response. Do not mark the finding rolled back until resource reconciliation succeeds. If automatic relinking is unsafe, mark the action `failed` or `manual_review` with explicit operator instructions.

### H-08 — RDS resizing is marked complete before AWS reports the modification finished

**Evidence:** The AWS adapter sends `ModifyDBInstance` with `ApplyImmediately: true` [4] and returns immediately. The engine then transitions the remediation action and finding to `completed` without polling for the RDS instance to reach the target state [3]. Rollback also uses `ApplyImmediately: true` without waiting for stabilization [4].

**Impact:** The dashboard and audit log can claim completion while the database is still modifying, unavailable, or ultimately failed. A user can queue rollback during the original modification, producing racing provider operations and an inaccurate audit trail. Applying changes immediately can also cause avoidable service interruption.

**Recommended fix:** Persist a provider operation ID or target state, poll with bounded timeout until the instance is available at the expected class, and only then mark completion. Use maintenance-window semantics by default, or make immediate application an explicit, separately authorized option. Guard rollback against an in-progress provider operation.

## Medium-severity findings

### M-01 — Malformed Slack action values become HTTP 500 instead of a client error

`parseApprovalActionValue` calls `JSON.parse` and throws a plain `Error` [9]. The route converts only errors with a `statusCode` property into their intended status and otherwise returns 500 [5]. A malformed but correctly signed action therefore causes a server error and may trigger Slack retries instead of a clean 400 response. Wrap parsing in a `SlackRequestError(400, ...)` path and add malformed-payload tests.

### M-02 — Policy screen silently hides all `manual_review` policies

The form offers both `auto_approve` and `manual_review` [11], but the backend filters the policy list to rules whose action is `auto_approve` [7], and the page is titled “Auto-approve policies” [12]. A user can successfully create a manual-review policy and then be unable to find it in the product. Add a separate section/filter for manual-review rules or remove the option until the screen supports it.

### M-03 — Policy form labels a savings condition as a monthly-cost condition

The UI label says “Monthly cost ≤ USD,” but the request persists a condition on `estimated_monthly_savings_cents` [11]. The policy evaluator compares that savings field [10]. Because a saving estimate is not necessarily the same as current cost, users can configure a rule with a different meaning from the one displayed. Rename the control to match the stored field or add a true `current_monthly_cost_cents` policy field.

### M-04 — Finding 404s render a generic error panel instead of the proper not-found page

The server fetch helper starts with a status-bearing message but replaces it with the JSON API error text [13]. The finding page calls `notFound()` only when the error still contains `(404)` [14]. The API returns `{ error: 'Waste finding not found' }`, so a missing or cross-tenant finding renders “Finding data unavailable” rather than a proper 404 route. Preserve the response status in a typed error or branch on an explicit `status` property.

### M-05 — API policy errors can disclose internal exception messages

The policy route sends `error.message` for every failure except the known no-account case [5]. Database constraint errors, SQL details, or provider/configuration messages can therefore reach clients. Return a generic message to the caller, log the detailed error server-side, and use typed domain errors for expected conflicts.

### M-06 — Organization roles exist but are not modeled as a constrained authorization policy

The `role` column is a free-form varchar with a default, not an enum or check constraint [8]. Together with the missing route checks in H-03, this allows invalid role values and makes authorization behavior dependent on convention. Introduce a role enum/check constraint, central policy functions, and tests for every protected mutation.

### M-07 — Tenant consistency is enforced only by application predicates, not by database integrity

Several tenant-owned tables contain independent `orgId` fields and foreign keys to their parent IDs, but there are no composite foreign keys proving that the parent belongs to the same organization [8]. The audit log also has no foreign key tying `entityId` to the entity table, no row-level security policy, and no database-level append-only trigger visible in the migrations. Application predicates are useful but are not a sufficient last line of defense for a multi-tenant control plane. Add composite constraints, RLS or restricted database roles, and immutable audit storage/permissions.

### M-08 — Metrics are inserted repeatedly with no deduplication key

Every detector run writes all provider points to `resource_metrics` [shared detector code], while the schema has only a lookup index and no uniqueness constraint on resource, metric name, and timestamp [8]. Re-running detection against the same provider data creates duplicate rows indefinitely. Add a natural unique key and `ON CONFLICT DO NOTHING`, or intentionally model collection-run IDs and query only one sample per observation.

### M-09 — Mobile navigation is unavailable below the desktop breakpoint

The sidebar containing all primary navigation is `hidden` until the `lg` breakpoint, while the mobile header contains branding but no menu or navigation control [15]. On a phone, users can enter a page through a deep link and use its local back link, but cannot navigate between Overview, Policies, and Cloud accounts. Add a keyboard-accessible mobile menu or a responsive navigation bar.

### M-10 — Asynchronous form and rollback status messages are not announced to assistive technology

The policy form and rollback button replace status text in ordinary paragraphs and do not use `aria-live`, `role="status"`, or equivalent announcement semantics [11] [16]. Screen-reader users may not hear that a policy was saved, a request failed, or a rollback was queued. Add live status regions, focus the first error, and ensure disabled/loading states are announced.

## Low-severity and production-hardening findings

### L-01 — Local and Kubernetes defaults contain guessable or placeholder secrets

Compose falls back to `local-only-change-this-secret` for `AUTH_SECRET` and uses `not-configured` placeholders for OAuth and Slack secrets [17]. The documentation warns operators to replace them [18], so this is not evidence that production is definitely compromised; it is nevertheless dangerous because copying the demo compose file without overriding every value makes JWT forgery and broken integrations possible. Fail startup when non-development environments use placeholder secrets.

### L-02 — The sign-in button is shown even when GitHub OAuth is not configured

The sign-in screen always renders “Continue with GitHub” [19], while the auth configuration silently substitutes `'not-configured'` for missing credentials [20]. A local or misconfigured deployment presents an apparently valid login action that fails later without a clear setup message. Detect missing provider configuration at startup or render a disabled/configuration error state.

### L-03 — Docker builds are less reproducible than the CI workflow

The Dockerfiles run `npm install` rather than `npm ci` even though a lockfile is copied [21]. The compose and Kubernetes database/cache images use floating tags such as `latest-pg16`, `redis:7-alpine`, and `latest` application tags [17] [18]. Pin lockfile-based installs and immutable image digests/tags for repeatable deployments.

### L-04 — Raw Kubernetes service manifests use image names different from CI output

The raw API, worker, and web deployments refer to `cindr/api:latest`, `cindr/worker:latest`, and `cindr/web:latest`, while CI publishes `ghcr.io/<owner>/cindr-api`, `cindr-worker`, and `cindr-web` [22]. The repository’s Kustomize overlay rewrites these names, so `kubectl apply -k infra/k8s` is the intended path [23]. Directly applying an individual deployment manifest is nevertheless a deployment footgun and commonly results in image-pull failures. Either use fully qualified image names in the base manifests or document that they are overlay-only templates.

### L-05 — AWS volume discovery reports the process default region, not necessarily the adapter’s resource region

`AwsCloudProvider` accepts a constructor region but `listIdleVolumes()` reports `process.env.AWS_REGION` for every returned volume [24]. In a multi-region or differently configured client, a resource can be persisted with the wrong region, which later directs remediation to the wrong AWS endpoint. Return the client’s actual configured region and add a multi-region adapter test.

## Security and dependency review

`npm audit` reported **8 total vulnerabilities** after `npm ci`: 4 high and 4 moderate. The production-only tree still reported 4 high findings:

| Package | Installed/resolved version | Severity | Advisory summary | Suggested direction |
|---|---:|---:|---|---|
| `drizzle-orm` | `0.39.3` | High | SQL injection through improperly escaped SQL identifiers [25] | Upgrade to the audit-recommended fixed line and review all dynamic identifier construction. |
| `next` | `15.5.23` under `^15.2.3` | High | Vulnerable transitive `postcss` and `sharp` paths [26] [27] | Upgrade Next to a supported fixed release after compatibility testing; rebuild the lockfile. |
| `postcss` | `8.4.31` under Next | High | XSS and attacker-controlled source-map file disclosure/path traversal advisories [26] | Resolve through a patched Next/PostCSS dependency set; do not expose development tooling publicly. |
| `sharp` | `0.34.5` under Next | High | Inherited libvips vulnerabilities [27] | Resolve through a patched Next/sharp chain and pin the resulting lockfile. |

Development-only or transitive moderate findings also affect `drizzle-kit`, `esbuild`, and the deprecated `@esbuild-kit` packages. Do not blindly use `npm audit fix --force`; test framework and Next major-version compatibility first, then commit the regenerated lockfile.

The API also registers CORS with `origin: true` [5]. Because the API uses cookie-based authentication, a broad reflected-origin policy is unnecessary for the same-origin Next proxy and should be replaced with an explicit allowlist. Add CSRF defenses for cookie-authenticated mutations, especially policy creation, Slack binding, and rollback.

## Recommended remediation order

The safest sequence is to first make the repository testable from a clean checkout, then disable real remediation until the worker is wired to a real metrics provider and the privilege/tenant boundaries are enforced. After that, repair queue consistency and rollback correctness before enabling auto-approval. Dependency upgrades and deployment hardening should happen in parallel, followed by UI fixes and expanded integration tests.

| Order | Workstream | Exit criterion |
|---:|---|---|
| 1 | Build/test pipeline | `npm ci && npm test` passes on a fresh runner without a prebuilt `dist`. |
| 2 | Production safety switch | Worker refuses to start with the empty mock provider outside an explicit test mode. |
| 3 | Authorization and tenancy | Member mutation tests return 403; cross-organization account references are rejected at both API and database layers. |
| 4 | Approval/job consistency | Queue outage and Slack retry tests converge on one durable remediation command. |
| 5 | Rollback correctness | EBS rollback returns and persists a replacement volume ID; RDS completion waits for provider stabilization. |
| 6 | Dependencies and deployment | Production `npm audit --omit=dev` is clear or formally risk-accepted; images and installs are pinned. |
| 7 | UI/accessibility | Manual-review policies are visible, 404s are correct, mobile navigation works, and async status is announced. |

## What was intentionally not counted as an undisclosed bug

The Cloud-account “Connect AWS account” button is explicitly labeled as a staged UI-only flow in the product [28]. It is a missing feature, but not a hidden implementation failure. Similarly, the Kubernetes image mismatch is qualified by the existing Kustomize overlay, and the Redis `emptyDir` is explicitly documented as disposable demo storage [18]. These items remain operational risks if the documented deployment path is not followed.

## References

[1]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/package.json "Root package scripts"
[2]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/worker/src/worker.ts "Worker bootstrap and scheduler"
[3]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/worker/src/remediation/engine.ts "Remediation and rollback engine"
[4]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/packages/cloud-adapters/src/aws-remediation.ts "AWS remediation adapter"
[5]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/api/src/server.ts "API routes and dependency wiring"
[6]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/api/src/organizations.ts "Organization resolution and roles"
[7]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/api/src/dashboard.ts "Dashboard queries and policy creation"
[8]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/packages/db/src/schema.ts "Database schema and constraints"
[9]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/api/src/slack-interactions.ts "Slack signature and approval handling"
[10]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/worker/src/detectors/policy-engine.ts "Policy evaluator"
[11]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/components/policy-form.tsx "Policy form"
[12]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/policies/page.tsx "Policies page"
[13]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/lib/server-api.ts "Server API fetch helper"
[14]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/findings/[id]/page.tsx "Finding detail page"
[15]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/components/app-shell.tsx "Application shell and navigation"
[16]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/components/rollback-button.tsx "Rollback UI"
[17]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/infra/docker-compose.yml "Docker Compose defaults"
[18]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/docs/deployment.md "Deployment checklist"
[19]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/auth/signin/page.tsx "Sign-in page"
[20]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/auth.ts "NextAuth configuration"
[21]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/api/Dockerfile "API Dockerfile"
[22]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/.github/workflows/ci.yml "CI image publishing"
[23]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/infra/k8s/kustomization.yaml "Kubernetes Kustomize overlay"
[24]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/packages/cloud-adapters/src/aws.ts "AWS resource adapter"
[25]: https://github.com/advisories/GHSA-gpj5-g38j-94v9 "Drizzle ORM SQL injection advisory"
[26]: https://github.com/advisories/GHSA-6g55-p6wh-862q "PostCSS arbitrary file read advisory"
[27]: https://github.com/advisories/GHSA-f88m-g3jw-g9cj "sharp libvips advisory"
[28]: https://github.com/atifkhani397/OptiCloud/blob/85d47eb2cbfb90cd533189b7a44fa0c77f5157d7/apps/web/app/accounts/page.tsx "Cloud accounts staged-flow note"
