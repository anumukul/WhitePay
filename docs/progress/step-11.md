# Step 11 — independent AI credits SaaS

STEP: 11 — independent AI credits SaaS
STATUS: READY_FOR_HUMAN_TEST

## Hosted deployment follow-up

The API is now live at https://whitepay-api.onrender.com. Read-only checks
returned HTTP 200 for both `/health` and `/ready`; PostgreSQL is reachable and
five API migrations are applied. No database credentials were exposed.

Added a Postgres storage adapter for the SaaS under its own `whitepay_saas`
schema, asynchronous storage calls in the server routes/actions, locked and
checksummed initialization, atomic duplicate-resistant credit grants, customer
locks for concurrent spending and production rejection of implicit SQLite.
The local SQLite development adapter is retained. The SaaS runtime now uses
Next 15.5.12 / React 18.3.1, matching the existing documentation and website.

TDD: the new Postgres suite initially failed because the adapter was missing.
After implementation, all nine tests pass against disposable PostgreSQL,
including parallel duplicate events, overspend prevention, reconnect
persistence and rollback/retry after a forced ledger insertion failure.
The production build and its type checks pass. One Chrome end-to-end test
passes with Postgres, real local API/worker delivery, browser callback granting
zero, duplicate signed webhook granting once, spend 100→99 and cross-customer
access rejection. Its chain receipt is controlled test data, not a live chain
payment. These checks do not deploy the hosted SaaS or sign/broadcast a chain transaction.

## Scope completed

- Audited the existing `apps/demo-saas` against the Step 11 acceptance criteria
  in `PR.md` §10.12 / §8.2. The app is an independent Next.js merchant that uses
  the real public `@whitepay/node` and `@whitepay/react` packages (no WhitePay
  internal payment imports).
- Confirmed the buyer flow: browser-scoped customer → server-side session for a
  verified 5 USDT price → real `WhitePayCheckout` widget → relayer/indexer
  settlement → verified signed webhook grants 100 credits once → **Run sample
  action — spend 1 credit** consumes a credit.
- Fixed a test-harness defect in the browser acceptance test: the wallet mock was
  injected via a serialized arrow function, which `tsx`/esbuild `keepNames`
  breaks, so `globalThis.ethereum` was never defined. The mock is now injected as
  a string init script. This is a harness fix only; product logic is unchanged.
- Replaced the obsolete `apps/demo-saas/README.md` (it still described Stripe and
  placeholder stubs that no longer exist) with an accurate description of the
  real SDK flow, environment, tests and limits.

## Files changed

- `apps/demo-saas/test/browser.e2e.ts` — string-based wallet init script.
- `apps/demo-saas/README.md` — rewritten to match actual implementation.
- `docs/progress/step-11.md` — this report.
- `docs/progress/STATE.md` — Step 11 status updated.

No contract, API, relayer, worker or SDK source was modified in this step.

## TDD proof

The acceptance behavior was already expressed as failing-first tests in the
existing suite; this step verified them and fixed the browser harness so the
real end-to-end path runs.

- Unit/integration (`apps/demo-saas/test/idempotency.test.ts`):
  - browser success / another customer session cannot grant or spend → pass
  - duplicate verified payment grants 100 once, then spend → 99 → pass
  - wrong merchant/session/amount and unconfirmed API payment cannot grant → pass
  - crash during credit insertion rolls back dedup and retries safely → pass
- Browser (`apps/demo-saas/test/browser.e2e.ts`), real API + worker + signed
  HTTP webhook:
  - RED before fix: after "Review payment", widget showed `wallet_unavailable`
    because `globalThis.ethereum` was undefined (harness serialization).
  - GREEN after fix: one test passes — callback alone grants 0; one signed
    webhook grants 100; duplicate delivery grants nothing; spend 100 → 99;
    cross-customer session read is 404 and balance 0.

## Commands actually run

```sh
pnpm --filter @whitepay/demo-saas test
# 4 passed, 0 failed, exit 0

pnpm --filter @whitepay/demo-saas typecheck
# tsc --noEmit, exit 0

pnpm --filter @whitepay/demo-saas build
# next build succeeded, exit 0

DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
TEST_DATABASE_URL=$DATABASE_URL \
pnpm --filter @whitepay/demo-saas test:browser
# 1 passed, 0 failed, exit 0 (Chrome)
```

## Static checks

- `tsc -p tsconfig.json --noEmit` passes.
- `next build` passes.

## Security / risk notes

- The browser test uses disposable in-memory wallet keys and explicitly
  controlled settlement receipts; it is labeled and is **not** live-USDT proof.
- The merchant secret key stays server-side; the browser only gets the session id
  through the authenticated bridge, which refuses cross-origin writes and other
  customers' sessions.
- Credits are granted only inside the webhook transaction, guarded by a unique
  `event_id` and unique `order_id`; a browser callback cannot grant credits.
- No external deployment, webhook send to a third party, registry publication or
  chain transaction was performed in this step.

## Testnet evidence

The live official-USDT widget payment and visible receipt were already verified
in Step 09 (`docs/progress/step-09.md`). This step's browser test replays the
full flow with a controlled receipt through the real API/worker/webhook. No new
live transaction is claimed here.

## Deployed URLs

NOT DEPLOYED. Demo runs locally at `http://localhost:3300`.

## Manual test script

Prerequisites: local Postgres (`pnpm db:local`), Chrome, and a provisioned
merchant (API key, 5-USDT price, webhook secret, fee recipient).

1. `pnpm --filter @whitepay/demo-saas dev` → open `http://localhost:3300`.
2. Click **Start your demo session**, then **Buy credits** →
   **Continue to WhitePay**. Expected: widget shows Price 5, Fee 0.005,
   Total 5.005 USDT.
3. Authorize the two signatures in the configured wallet.
   Expected: "Authorizations submitted." then "Payment confirmed." after the
   relayer/indexer settle.
4. Before the webhook is delivered, open **Your credits**. Expected: balance 0
   (callback alone grants nothing).
5. Let the worker deliver the signed webhook, then reload **Your credits**.
   Expected: balance 100.
6. Click **Run sample action — spend 1 credit**. Expected: balance 99.
7. Open the app in a second browser profile, start its own session, and confirm
   it shows balance 0 and cannot open the first session's checkout (404).

## Current failures / limitations

- The browser acceptance path uses controlled test settlements, not a fresh
  live official-USDT payment. Live payment evidence lives in Step 09.
- The sample credit action is a database spend, not a real AI provider call.
- Local SQLite persistence and process-local demo state are demo-only; hosted
  hardening belongs to Steps 13/16.
- `apps/demo-saas` is still uncommitted (as are Steps 06–10); no Git publication
  is authorized.

## Human decision required

Reply `FAIL STEP 11: <symptom>` or `APPROVE STEP 11 ...`. Committing requires
explicit approval; pushing requires separate remote/branch authorization.

## Next step

Step 12 — second independent merchant demo (do not begin without `START STEP 12`).
