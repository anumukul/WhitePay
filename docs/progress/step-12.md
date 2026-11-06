# Step 12 — second independent merchant (digital shop)

Status: **READY_FOR_HUMAN_TEST**

## Acceptance mapping

| Requirement (PR.md)                                               | Evidence                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second merchant with independent product/payout/keys              | `apps/demo-shop` creates its own merchant and price in the browser test; payout `0x…c`, app 3 USDT product, separate webhook secret.                    |
| Uses the same SDKs unmodified                                     | Imports `@whitepay/node` and `@whitepay/react` from the workspace; no SDK source changes for this step.                                                 |
| Fulfillment only after verified payment                           | `lib/fulfillment.ts` verifies HMAC, merchant/session/amount/fee, then re-reads the payment from the API before granting.                                |
| Browser callback cannot unlock a product                          | Browser test asserts zero entitlements and 404 for a guessed token before the signed webhook; callback alone grants nothing.                            |
| Duplicate event cannot double-grant                               | Unit test and browser test replay the real signed webhook; exactly one entitlement remains.                                                             |
| Cross-merchant isolation                                          | Unit test creates two merchant orders and proves a cross-merchant event cannot unlock the other order; browser test confirms another customer gets 404. |
| Actual downloadable entitlement bound to the right order/customer | Download route requires both the unguessable token and the matching customer cookie; the owner receives the template and other sessions do not.         |

## What was built

- `apps/demo-shop` — Next.js app selling a Markdown launch template for 3.000 USDT + 0.003 USDT disclosed fee (10 bps).
- `lib/db` — SQLite schema for customers, orders (`amount_minor = 3000000`), webhook events and entitlements (`order_id` unique, `payment_id` unique, `download_token` unique).
- `lib/fulfillment.ts` — signed-webhook verification, payment re-read, transactional idempotent grant.
- `lib/db/entitlements.ts` — entitlement lookup, token redemption bound to `customer_id`, download counter.
- `app/download/[token]/route.ts` — serves the template only to the entitled customer.
- `app/checkout`, `app/downloads`, `app/api/webhooks/whitepay`, `app/api/whitepay/[...path]` — checkout, downloads and the merchant bridge.
- `test/idempotency.test.ts` — 5 unit/integration tests.
- `test/browser.e2e.ts` — 1 Chrome end-to-end test against the real API, worker settlement and signed HTTP webhook.

## RED → GREEN

RED was observed twice:

1. The first browser run failed with `404 !== 200` for the owner's download. Instrumentation showed the request had **no cookie**. The app marked the session cookie `Secure` based on `NODE_ENV`, but the local `next start` preview runs on `http://127.0.0.1`, where Playwright's request context drops a `Secure` cookie. Fixed by deriving `Secure` from `APP_BASE_URL.startsWith('https://')` (`app/actions.ts`).
2. The next run exposed a test race: the second browser context's cookie was read before the server-action redirect completed. Fixed by waiting for the checkout page before asserting the cookie.

GREEN evidence (Node 25.8.1, pnpm 10.25.0, Chrome installed locally):

```sh
pnpm --filter @whitepay/demo-shop test
# tests 5 / pass 5 / fail 0

pnpm --filter @whitepay/demo-shop typecheck
# clean

pnpm --filter @whitepay/demo-shop build
# Compiled successfully; 8 routes

DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
TEST_DATABASE_URL=$DATABASE_URL \
pnpm --filter @whitepay/demo-shop test:browser
# tests 1 / pass 1 / fail 0
```

Browser test asserted, in one run:

- callback/guessed token before webhook → 0 entitlements, 404;
- two wallet signatures queued, submission settled, widget shows `Payment confirmed.`;
- real signed webhook delivered, then replayed → exactly one entitlement;
- owner download → 200 with template content;
- unrelated session and a second customer session → 404;
- `/downloads` shows the purchased template.

## Manual acceptance script

1. Start the API, worker and `pnpm --filter @whitepay/demo-shop dev` with a fresh merchant, 3 USDT price and this merchant's webhook secret.
2. Open `http://localhost:3400`, start a session, buy the template.
3. Before paying: `/downloads` is empty and `/download/<guessed>` returns 404.
4. Pay 3.003 USDT. The browser success page alone must not unlock a download.
5. Deliver the signed `payment.succeeded` webhook. The order page and `/downloads` show one download link.
6. Download the template; content is the Markdown template.
7. Replay the same webhook; no second entitlement.
8. Open a second browser session; it cannot redeem the first customer's link (404).

## Limitations

- SQLite single-node store; production would use PostgreSQL and shared cache.
- No hosted deployment, monitoring or rate limiting.
- The template is generated in code, not object storage.
- No refunds/recurring/bridging; testnet only.

## Files

- `apps/demo-shop/app/actions.ts`
- `apps/demo-shop/lib/db/index.ts`
- `apps/demo-shop/lib/db/entitlements.ts`
- `apps/demo-shop/lib/fulfillment.ts`
- `apps/demo-shop/lib/product.ts`
- `apps/demo-shop/app/download/[token]/route.ts`
- `apps/demo-shop/app/api/webhooks/whitepay/route.ts`
- `apps/demo-shop/app/api/whitepay/[...path]/route.ts`
- `apps/demo-shop/test/idempotency.test.ts`
- `apps/demo-shop/test/browser.e2e.ts`
- `apps/demo-shop/README.md`
