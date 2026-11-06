# Step 05 — Merchant API and PostgreSQL data layer

STATUS: MANUALLY_ACCEPTED — user confirmed manual checks passed and requested further work. Commit/push authorized under the standing milestone workflow.

User requested the next steps after final checkout deployment, live official-USDT payment and read-only replay verification. Started Step 05 under that instruction. Step 04 explorer source verification is still an explicitly open external dependency; it is not silently marked complete or verified. Step 05 was subsequently manually accepted and published as e14ee21; Step 04 live proof was published as 47d10e7 with the explorer limitation retained.

## Problems reproduced before implementation

New regression suite ran against the old API with real HTTP requests: 7 failed, 1 passed. Failures demonstrated client-supplied amount/merchant fields silently accepted, duplicate external order returning different price terms, idempotency key aliasing a different request, existing quote domain changing with environment configuration, zero payer accepted, fabricated signatures queued, and missing product/versioned-price endpoints. Existing cross-merchant session/quote reads already rejected correctly and were preserved.

## Implemented behavior

- Replaced API-only SQLite persistence with PostgreSQL 15+ / pinned pg 8.16.3, Zod 3.25.76 and @types/pg 8.15.5. Versioned up/down SQL, checksums, migration lock and transaction rollback. Startup rejects missing/non-PostgreSQL DATABASE_URL. Existing SQLite files are preserved; no implicit data import or live database cutover.
- Merchant-scoped hashed API keys, optional expiry and revocation checks; raw keys returned once by provisioning. Public endpoints do not create arbitrary merchants or mint credentials.
- Products and append-only versioned prices, positive safe integer USDT minor units (up to 9007199254740991), six-decimal official token only. Arithmetic uses BigInt for fees and signed totals, with fee floor(amount\*bps/10000). Larger amounts, strings, fractions and frontend overrides reject. PostgreSQL triggers reject price mutation/deletion; new versions are created under the same owned product.
- Sessions snapshot price amount/currency/token/payout/success URL. Duplicate externalOrderId is merchant-scoped: identical request returns the same session; changed price/success URL conflicts. Idempotency keys bind canonical validated request body, and session + response persistence share one checked-out-client transaction. Concurrent duplicate requests create one row.
- Quotes persist full order and token typed data, including both EIP712 domains, payout, fee, validity and digest. Original domain remains stable across configuration changes/restarts. No zero-address fallback configuration. Quote config requires chain 1874, nonzero checkout/fee recipient and bounded fee/validity settings; invalid role combinations reject. Same payer/session reuses its valid quote. Expired unsigned quote requires explicit /renew; orderId stays stable, quoteId/digest/window change. Signed/in-flight attempts cannot renew via this endpoint.
- Signature admission requires 65-byte signatures and cryptographic recovery of the expected payer for both stored domains. Session locking serializes renewal and admission; expired terms, fake signatures and old signatures after renewal never queue. Public submission reads omit both signatures. Body limit 16 KiB, strict schemas and sanitized errors avoid dumping credentials/signatures/database configuration.
- Added dedicated loopback local PostgreSQL helper, owner-only local two-merchant fixture export, manual curl guide, and separate PostgreSQL CI job. Node SDK/dashboard test setup now awaits the async PostgreSQL API; SDK tests expect 409 when an idempotency key is reused for changed terms.

Decision/tradeoffs: [ADR 0002](../decisions/0002-postgres-api.md). Explicit SQL rather than an ORM is a deliberate small-schema choice; no claim that the old SQLite relayer/worker are integrated. Those remain Steps 06–07.

## Validation

- Real PostgreSQL 15 local cluster, UTF-8 database whitepay_step05 on 127.0.0.1:55432. Each test process uses its own hashed schema; teardown removes only that schema. No in-memory PostgreSQL substitute or production database.
- API: **37 passed**. Includes 8 original API + 10 order/signature + 3 migration + 16 Step 05 regressions.
- Node SDK compatibility: **7 passed**; dashboard isolation: **3 passed**.
- API, SDK and dashboard TypeScript checks passed.
- Root shared/build and **28 root tests passed**; secret scanning included.
- `CI=true pnpm install --frozen-lockfile --ignore-scripts` passed all 10 workspace projects. Initial noninteractive install without CI flag refused module-directory recreation; reran in supported CI mode.
- Local database bootstrap and two-merchant seed exporter executed successfully. Credentials saved only in ignored 0700 data directory / 0600 JSON; only path printed. No wallet secrets or signatures read by these tools.
- Formatting is scoped to touched files; inherited unrelated repository formatting issues are not presented as resolved. Existing final contract source/bytecode is untouched in this milestone.

CI job added but not remotely run or pushed. Local validation does not certify hosted infrastructure, relayer recovery, webhook delivery, browser checkout or later milestones.

## API contract

All /v1 routes require merchant Bearer API key; cross-merchant identifiers return 404. Errors return `{ "error": "code" }` without sensitive internals.

| Method/path                           | Behavior                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET /health                           | Public health response                                                                                 |
| POST /v1/products                     | Create owned product: name; 201                                                                        |
| GET /v1/products/:id                  | Owned product; 200/404                                                                                 |
| POST /v1/prices                       | New version: productId, amountMinor, currency=USDT, exact official tokenAddress; 201                   |
| GET /v1/prices/:id                    | Immutable owned price/version                                                                          |
| POST /v1/checkout/sessions            | priceId, externalOrderId, optional successUrl; 200; optional Idempotency-Key binds exact request       |
| GET /v1/checkout/sessions/:id         | Owned immutable session snapshot                                                                       |
| POST /v1/checkout/sessions/:id/order  | payerAddress; full stored order + token typed data and digest                                          |
| POST /v1/checkout/sessions/:id/renew  | payerAddress; explicitly renew expired unsigned quote                                                  |
| POST /v1/submissions/:id/signatures   | orderSignature, tokenSignature; verified admission 204; malformed/fake 400, expired/already signed 409 |
| GET /v1/submissions/:id               | Public status metadata, no signatures                                                                  |
| GET /v1/payments and /v1/payments/:id | Owned payment metadata; no fabricated success records                                                  |

## Manual acceptance gate

Follow [the manual curl guide](../runbooks/step-05-api.md): start dedicated local Postgres, run tests/typechecks, provision two local merchants, start only API, exercise auth/isolation, products/versioned prices, duplicate/idempotency conflicts, frontend override rejection, quote domains and explicit expiry/renewal; restart API and read the same session.

Expected test commands:

```bash
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
pnpm db:local
export DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
export TEST_DATABASE_URL="$DATABASE_URL"
pnpm --filter @whitepay/api migrate
pnpm --filter @whitepay/api --filter @whitepay/node --filter @whitepay/dashboard test
pnpm --filter @whitepay/api --filter @whitepay/node --filter @whitepay/dashboard typecheck
```

Stop for user manual testing and approval before commit/push and before Step 06. Keep old relayer/worker stopped: their SQLite queue adapters are incompatible with PostgreSQL until their milestones. No real wallet signing or testnet payment is required for Step 05 testing. Source verification of the already deployed final checkout remains pending explorer recovery, with the existing approval still applying to identical-source retries.

Manual acceptance: user explicitly reported "yes manual checks passed please proceed further". Publish reviewed Step 04/05 work under the standing commit/push workflow, retaining the unresolved explorer source-verification limitation. No new transaction authorization inferred.

Publication: e14ee21 pushed to origin/main after explicit manual acceptance. Step 06 migration subsequently adds a separate relay-attempt ledger without modifying accepted 001 SQL.
