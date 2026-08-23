# `@cindr/db`

The database package owns Cindr’s PostgreSQL schema, migrations, seed fixture, database client, and shared state-machine types. **Drizzle ORM** remains the selected ORM because its SQL-first TypeScript schema keeps PostgreSQL and TimescaleDB features explicit while allowing the migration SQL to be reviewed and committed as a first-class artifact.

## Stage 2 schema

The schema contains `cloud_accounts`, `resources`, `waste_findings`, `remediation_actions`, `audit_log`, and `policies`. Provider, resource type, finding status, remediation type/status, and audit entity type are PostgreSQL enums. `cloud_accounts.credentials_ref` contains only a reference to an external secrets manager; raw credentials are never stored in the database. The `audit_log` table is protected by a PostgreSQL trigger that rejects updates and deletes.

## State-machine contract

`src/state-machine.ts` owns the explicit finding and remediation-action transition maps. Each transition function opens a Drizzle transaction, locks the current row, rejects illegal transitions, updates the status using an optimistic current-status predicate, and inserts the audit row before committing. A failure in either operation rolls back both. Requests that repeat the current status are safe idempotent no-ops.

## Commands

```bash
# Generate a migration after changing src/schema.ts
npm run generate --workspace @cindr/db

# Apply migrations to DATABASE_URL
npm run migrate --workspace @cindr/db

# Insert the deterministic local fixture
npm run seed --workspace @cindr/db
```

The seed fixture creates one fake AWS account, three resources, and two findings. The findings finish in `proposed` and `approved` states and carry corresponding audit history. All identifiers and credentials references are fake.
