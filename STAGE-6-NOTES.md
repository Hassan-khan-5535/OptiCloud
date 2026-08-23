# Cindr Stage 6 — Dashboard and Audit Log

## Fully functional

The Next.js dashboard now renders live data from the PostgreSQL-backed API. The overview page reads open findings in `detected`, `proposed`, `approved`, and `executing` states, calculates detected monthly waste from `estimated_monthly_savings_cents`, and calculates remediated-to-date from completed findings. Finding detail reads the resource, evidence, cost-model context, linked remediation action, and finding-specific state transitions directly from the API’s joins over `waste_findings`, `resources`, `remediation_actions`, and `audit_log`.

The finding timeline is a shared component and explicitly renders `from_status → to_status`, actor, timestamp, and reason. The shared status badge uses one mapping for all finding and remediation states, including the attention shade for `failed`. The rollback control calls the Stage 5 `POST /api/remediations/:remediationActionId/rollback` endpoint and is rendered only when the linked action is reversible and completed.

The policies page lists active `auto_approve` policies from the `policies` table and creates new rules through `POST /api/policies`. The API validates the same detector finding types and the existing `finding_type` / `action` matching contract, and accepts exactly one of `min_age_days` or `threshold`. The accounts page lists connected cloud accounts from `cloud_accounts`.

## Intentionally stubbed

The “Connect AWS account” control is UI-only. It displays an explanatory message and includes a TODO marker for the future OAuth or role-assumption flow. It does not exchange credentials, create an account, or mutate infrastructure. Authentication is also intentionally absent for Stage 6, as requested.

## Validation

`npm run typecheck` passes. `npm run build` passes for all workspaces, including Next.js production compilation. `npm test` passes all 17 tests across worker, Slack, and API workspaces, including four new policy-contract tests. `git diff --check` passes. Browser smoke tests verified the overview, policies, accounts, and dynamic finding routes, plus the AWS stub interaction. Docker was unavailable in the sandbox, so browser verification used the API’s explicit no-database error state; no mock data was added.
