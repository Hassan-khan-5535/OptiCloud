# Cindr Stage 6 — Dashboard and Audit Log

## Fully functional

The Next.js dashboard now renders live data from the PostgreSQL-backed API. The overview page reads open findings in `detected`, `proposed`, `approved`, and `executing` states, calculates detected monthly waste from `estimated_monthly_savings_cents`, and calculates remediated-to-date from completed findings. Finding detail reads the resource, evidence, cost-model context, linked remediation action, and finding-specific state transitions directly from the API’s joins over `waste_findings`, `resources`, `remediation_actions`, and `audit_log`.

The finding timeline is a shared component and explicitly renders `from_status → to_status`, actor, timestamp, and reason. The shared status badge uses one mapping for all finding and remediation states, including the attention shade for `failed`. The rollback control calls the Stage 5 `POST /api/remediations/:remediationActionId/rollback` endpoint and is rendered only when the linked action is reversible and completed.

The policies page lists both live and dry-run rules from the `policies` table and creates new rules through `POST /api/policies`. The API validates the same detector finding types and the existing `finding_type` / `action` matching contract, enforces organization roles and cloud-account tenancy, and accepts exactly one of `min_age_days` or `threshold`. The accounts page lists connected cloud accounts from `cloud_accounts`.

## Current limitations

The “Connect AWS account” control remains intentionally unavailable until the OAuth or role-assumption flow is implemented; the UI now labels it as unavailable rather than presenting a misleading active action. Production detection uses the tenant-scoped database metrics provider, while the explicit `METRICS_PROVIDER=mock` mode is reserved for local demos and tests. Real cloud-account onboarding and provider resource synchronization remain future work.

## Validation

`npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass after the repair batches. Production-only `npm audit --omit=dev` reports zero vulnerabilities. Migration journal JSON and generated migrations validate. Docker was unavailable in the sandbox, so Compose runtime execution was not performed; static Compose edits were reviewed. No tracked source files were modified during the initial audit; repair changes are now intentionally present in the working tree.
