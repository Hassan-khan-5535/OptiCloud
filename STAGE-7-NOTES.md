# Cindr Stage 7 — Custom Policy Engine Hardening

## Trust boundary

Live auto-approval is fail-closed. A policy must be a versioned rule with a non-empty name, an allowlisted finding type, an explicit `all` array, and a required `finding_type eq` condition. Each condition uses an allowlisted field and operator. The engine resolves the actual Stage 5 action plan before approval and permits unattended approval only when the action is explicitly in the reversible-action allowlist. A malformed policy, unknown finding type, missing value, unsupported operator, or irreversible action cannot produce an approval transition.

## Rule schema

Rules use version `1` and have the following shape:

```json
{
  "version": 1,
  "name": "Old unattached volumes under $50",
  "finding_type": "unattached_volume",
  "action": "auto_approve",
  "all": [
    { "field": "finding_type", "operator": "eq", "value": "unattached_volume" },
    { "field": "evidence.age_days", "operator": "gte", "value": 14 },
    { "field": "estimated_monthly_savings_cents", "operator": "lte", "value": 5000 }
  ]
}
```

The supported fields are finding type, estimated monthly savings in cents, detector evidence age and threshold fields, RDS average connections and CPU, and the resolved remediation action type. The supported operators are `eq`, `gte`, `lte`, `gt`, and `lt`. Compound rules use logical AND only, keeping evaluation readable and auditable.

## Dry-run and audit behavior

Policies with `active: false` are still evaluated on every detector pass. Every evaluation is stored in `policy_evaluations`, including mode, matched status, safety status, and each condition’s expected and actual value. A matching dry-run also appends a `Dry-run policy ... would ...` record to `audit_log`; it never transitions a finding and never enqueues remediation. A live approval transition records the policy ID, policy name, and serialized condition comparisons in its audit reason.

The `/policies` page shows live and dry-run auto-approve policies and lists recorded dry-run matches with links to the affected findings. The policy form builds the shared versioned rule and exposes age and monthly-cost conditions plus the live/dry-run switch.

## Migration and validation

Migration `packages/db/migrations/0004_closed_meggan.sql` creates the `policy_evaluation_mode` enum and `policy_evaluations` table with foreign keys and an evaluation index. `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check` pass. The full suite covers 14 worker tests, 2 Slack tests, and 7 API tests, including compound matching, dry-run non-approval, audit metadata in approval reasons, and the irreversible-action safety ceiling. Docker was unavailable in the sandbox, so a live PostgreSQL migration and seeded browser pass could not be executed here.
