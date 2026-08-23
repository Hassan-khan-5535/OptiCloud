# `@cindr/db`

The database package owns the relational schema, migration configuration, and shared persistence types. **Drizzle ORM** is used for this stage because its SQL-first TypeScript schema keeps PostgreSQL and TimescaleDB features explicit while avoiding a generated client during the initial monorepo scaffold. No detection or remediation queries are implemented yet.

The audit event table is designed to record every state transition before the next transition is attempted. TimescaleDB is enabled by the local PostgreSQL image in Docker Compose; time-series billing and usage tables will be added in a later stage.
