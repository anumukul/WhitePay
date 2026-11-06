# ADR 0002 — PostgreSQL API persistence and immutable quotes

Status: implemented for Step 05, pending manual acceptance.

The teammate prototype used synchronous node:sqlite in each service. The implementation plan calls for PostgreSQL, versioned migrations and one authoritative payment database. Step 05 moves the merchant API to PostgreSQL 15+ using pinned node-postgres and explicit SQL migrations. Keep SQL visible for the small schema and transaction/locking rules rather than adding an ORM solely to wrap these queries. This is a deliberate implementation choice relative to the plan's Drizzle/Prisma default.

Each transaction uses one checked-out client, following [node-postgres transaction guidance](https://node-postgres.com/features/transactions). Migration checksums and transactional PostgreSQL DDL support repeatable application and rollback tests. Product prices are append-only versions. Session amount/token/currency/payout are snapshots. A quote persists its complete order and token typed data; configuration changes cannot rewrite an issued signing domain. Quote renewal is explicit and only replaces expired unsigned terms. Signed/queued/submitted/settled attempts cannot be renewed through this endpoint.

Idempotency keys are scoped by merchant and bind the canonical validated request. Transactional advisory locks serialize duplicate external orders and idempotency-key requests; session creation and idempotency response persistence use the same transaction. Quote creation/renewal and signature acceptance take the same session lock. Signatures must recover the quoted payer for both domains before queueing; public submission reads omit them.

This creates a fresh PostgreSQL schema. It does not import, overwrite or delete existing SQLite files. No real live proof was stored by the old API, and existing developer data is preserved. A deployment requiring legacy business-data migration needs an explicit export/validation/import procedure before cutover. DATABASE_URL rejects file/SQLite values so it cannot silently interpret a database URL as a filename.

The old relayer and worker remain SQLite prototypes. They do not yet consume this PostgreSQL queue: integrating them with the same authoritative database, crash recovery and transactional outbox belongs to Steps 06–07. Do not launch them against DATABASE_URL or claim automated end-to-end fulfillment from this API milestone. Hosted checkout, public browser authorization, production onboarding and live infrastructure remain later milestones. No production database was accessed.
