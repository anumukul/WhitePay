# demo-saas — AI credits SaaS demo

A separate Next.js 15 merchant app that sells **100 credits for 5 USDT** (plus a
disclosed **0.005 USDT** sponsorship fee) using the real WhitePay SDKs:

- `@whitepay/node` for server-side session creation and payment retrieval
- `@whitepay/react` (`WhitePayCheckout`) for the buyer's checkout widget
- WhitePay API + relayer + worker for signing, sponsored settlement and webhooks

The merchant is an ordinary consumer of the public packages; it does not import
WhitePay internals for the payment flow. Credits are granted **only** from a
verified, indexed `payment.succeeded` webhook — never from the browser callback.

**Testnet only. No real funds move.**

## Buyer flow

1. Open the app and click **Start your demo session** (creates a browser-scoped
   customer; each browser owns only its own orders and credits).
2. **Buy credits** → **Continue to WhitePay** creates a server-side checkout
   session for the configured price (verified to be 5 USDT / official USDT).
3. The widget shows the exact price, fee and total, has the buyer authorize two
   EIP-712 signatures, and waits for the relayer + indexer to confirm on chain.
4. The worker delivers a signed webhook to this merchant's backend; the webhook
   handler records the event and grants 100 credits **once** (unique order +
   event idempotency).
5. On **Your credits**, **Run sample action — spend 1 credit** consumes a credit
   in the database. It is a sample consumption action, not a paid AI call.

## Environment

Copy `.env.example` to `.env.local` and fill in the merchant values:

| Variable                  | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `DEMO_DATABASE_PATH`      | Local SQLite file for demo orders/credits (gitignored)                     |
| `APP_BASE_URL`            | Public origin of this app (used for the SDK bridge + webhook origin check) |
| `WHITEPAY_API_URL`        | WhitePay API base URL                                                      |
| `WHITEPAY_SECRET_KEY`     | Merchant **secret** API key (server only; never exposed to the browser)    |
| `WHITEPAY_PRICE_ID`       | Price created for this merchant (5 USDT)                                   |
| `WHITEPAY_WEBHOOK_SECRET` | Merchant webhook signing secret                                            |
| `WHITEPAY_FEE_RECIPIENT`  | Fee recipient address used by the local checkout bridge                    |

Provision the merchant and price with the Step 05/13 tooling; never commit real
keys.

## Run

```bash
pnpm --filter @whitepay/demo-saas dev   # http://localhost:3300
```

The checkout bridge is served at `/api/whitepay/*` and is restricted to the
authenticated customer's own session. The webhook endpoint is
`POST /api/webhooks/whitepay`.

## Tests

```bash
pnpm --filter @whitepay/demo-saas test          # 4 unit/integration tests
pnpm --filter @whitepay/demo-saas test:browser  # Chrome end-to-end acceptance
```

The browser test needs a local PostgreSQL test database and Google Chrome
(`WHITEPAY_TEST_CHROME` overrides the path). It runs the real API and worker,
uses disposable in-memory wallet keys, and asserts:

- a browser success callback alone grants **zero** credits,
- exactly one signed HTTP webhook grants **100** credits, and a duplicate
  delivery grants nothing,
- the customer can spend a credit (100 → 99),
- another customer cannot read the session or credits (404 / balance 0).

Test receipts are produced by the real worker from explicitly controlled
settlements; the browser test is not a substitute for a live official-USDT
payment, which is evidenced separately in the Step 09 report.

## What is and is not real

- The payment path is the real WhitePay stack (API, relayer, indexer, webhooks).
- The credit ledger and spend action are real database operations.
- No real AI service is invoked by the sample action.
