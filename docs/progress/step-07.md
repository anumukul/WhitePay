# Step 07 — settlement indexing and signed webhook delivery

Implementation and self-tests completed locally. No commit/push, external webhook delivery or new chain transaction authorized or performed. Step 04 explorer verification remains open.

The worker now uses the authoritative PostgreSQL database. Migration 003 preserves historical signed quotes and adds canonical scan cursors, deduplicated settlement events, one-payment-per-session enforcement and a durable webhook outbox. Receipt, canonical block, checkout runtime, all signed order/event fields, AuthorizationUsed nonce and exact official-USDT transfers must match before settlement. Payment/session/submission changes, event/outbox insertion and cursor advancement commit together. A confirmed checkpoint reorg halts for review. Unmatched, rejected and conflicting events remain distinguishable from successful settlement.

Delivery uses HMAC-SHA256 over timestamp plus the exact payload, freshness checking, stable event IDs, transactional leases, delayed retries, bounded attempts and dead-letter state. A retry gets a fresh timestamp/signature. Delivery is at-least-once: merchant fulfillment must persist event-ID deduplication atomically with the entitlement. HTTPS and an explicit destination-origin allowlist are required; private destinations and redirects are rejected. Localhost is permitted only through explicit test configuration. A five-second total request deadline bounds DNS/connection/response waiting. External delivery remains disabled by default; its separate runner can be enabled only after configuring approved destinations.

## Actual chain evidence

`pnpm --filter @whitepay/worker step07:live index` read the already confirmed transaction `0x579f92812ea2f5d8bbe67b49c33fb0a7a75fbe61ab98edc129e832b2ebca034e` on chain 1874, block 12380070. Exactly one matched settlement event and one succeeded 1-USDT payment were persisted; the session is settled. A second scan from another scope produced one duplicate and zero additional payments. Public evidence is `docs/evidence/step-07-live-index.json`. A fresh `inspect` process checks the same persisted payment/cursors. The live merchant has no webhook URL, so no live webhook outbox row was invented and no external request was sent.

## Tests and limits

Real PostgreSQL tests cover exact receipt reconciliation, malformed/mismatched/reverted events, duplicate logs, missing receipt retry, canonical checkpoint changes, old signed terms after quote renewal, rollback on cursor-write failure and restart recovery. Webhook tests include real localhost HTTP signature verification, failed acknowledgment followed by retry with one entitlement grant, crash after delivery, concurrent claims, exhausted retries and clean runner shutdown. These tests use isolated schemas and temporary test accounts, not the five real wallets.

Hosted delivery, production key storage and a real independent merchant's end-to-end fulfillment are later milestones. No production-readiness or exactly-once HTTP claim is made. The completed local checks allow implementation to continue under the user's self-test/advance authorization.

Final checks: **27 worker tests pass** and the worker typecheck passes. Fresh-process inspect confirms the live payment/event/session/cursors survived process exit; the captured webhook retry demonstrates one grant despite duplicate HTTP delivery. CI now includes the worker. Local Step 07 implementation checks are complete; external webhook acceptance and hosted operations remain explicitly pending. Proceeding to Step 08 under the user's self-test/advance instruction, with no Git publication.

A later combined multi-package run exposed test fixtures sharing the same PostgreSQL advisory lock name across isolated schemas. Scoped each worker fixture by its unique session ID; production locking semantics are unchanged. The complete worker gate was rerun after the fixture correction.
