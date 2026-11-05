# demo-saas — WhitePay SaaS demo

A Next.js 15 demo app that sells 100 credits per order through two payment providers:

- **Stripe** — real test-mode Checkout Session with webhook signature verification.
- **WhitePay** — **placeholder flow** against local stubs. The real `@whitepay/node` SDK, `@whitepay/react` widget, and WhitePay API backend do not exist yet; this demo swaps them in later with no changes outside `lib/whitepay/` and the SWAP-POINT lines flagged in code.

**Testnet / test-mode only. No real funds move.**

## Setup

```bash
cd apps/demo-saas
cp .env.example .env.local
# fill in STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_ID
# WHITEPAY_* values can stay at REPLACE for the placeholder flow
pnpm install --filter @whitepay/demo-saas
pnpm --filter @whitepay/demo-saas dev
```

Requires Node ≥22.5 (uses the experimental built-in `node:sqlite`). DB is a local SQLite file at `data/demo.db` (gitignored, demo-only).

## Running Stripe test mode end-to-end

1. Install Stripe CLI, `stripe login`.
2. Terminal A: `pnpm --filter @whitepay/demo-saas dev`
3. Terminal B: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy the `whsec_...` into `STRIPE_WEBHOOK_SECRET`, restart dev.
4. Open http://localhost:3000/checkout, pick **Stripe**, complete with card `4242 4242 4242 4242`.
5. Watch `stripe listen` emit `checkout.session.completed`, then visit `/credits` — balance is 100.

## Running the WhitePay placeholder flow

1. `pnpm --filter @whitepay/demo-saas dev`
2. Open http://localhost:3000/checkout, pick **WhitePay**, continue.
3. The stub redirects to a page clearly labeled **"PLACEHOLDER — not a real WhitePay payment."** Click **Simulate successful payment**.
4. Stub route `POST /api/_stub/whitepay/webhook` signs an event and forwards it to `POST /api/webhooks/whitepay`.
5. `/credits` shows 100.

## Proving idempotency

The acceptance tests cover it:

```bash
pnpm --filter @whitepay/demo-saas test
```

Expected output: `# pass 3 / # fail 0`. Tests:

- `CP-12`: same `eventId` delivered twice → one entitlement, 100 credits (not 200).
- `CP-13`: visiting `/receipt` with a fresh order and no webhook → balance stays 0.
- `CP-12b`: Stripe and WhitePay orders coexist; duplicate still blocked per source.

Manual replay proof: in Stripe CLI, `stripe events resend evt_xxx`. Balance does not increase.

## Placeholder inventory

| File | Stands in for | Replaced at milestone | Swap instruction |
|---|---|---|---|
| `lib/whitepay/stub-client.ts` | `@whitepay/node` SDK | Step 08 | Delete this file. In `lib/payments/whitepay-adapter.ts`, change the import to `import { WhitePay } from "@whitepay/node";`. Set `WHITEPAY_SECRET_KEY`, `WHITEPAY_API_URL`. |
| `components/whitepay-checkout-stub.tsx` | `<WhitePayCheckout />` from `@whitepay/react` | Step 09 | Delete this file; `import { WhitePayCheckout } from "@whitepay/react";`. Set `NEXT_PUBLIC_WHITEPAY_KEY`. |
| `app/api/_stub/whitepay/sessions/route.ts` | WhitePay API `POST /checkout/sessions` | Step 05 | Delete route; adapter already calls the SDK which will POST to `WHITEPAY_API_URL`. |
| `app/api/_stub/whitepay/webhook/route.ts` | Relayer+indexer webhook emission | Step 07 | Delete route. Real webhooks will arrive at `/api/webhooks/whitepay` directly from the WhitePay backend. |
| `app/_stub/whitepay/pay/[sessionId]/page.tsx` | Hosted WhitePay checkout page | Step 09/13 | Delete the whole `app/_stub/` tree; the SDK handles the hosted page or the widget renders in-app. |
| `.env.example` — `WHITECHAIN_USDT_ADDRESS`, `WHITEPAY_CHECKOUT_CONTRACT_ADDRESS` | On-chain addresses | Step 04 | Replace `REPLACE` with the verified deployed addresses from Step 04 evidence. |

## What is NOT real in this demo

- No WhitePay payment settles on Whitechain. The "USDT" amount shown is a label only.
- No contract ABI or address is used anywhere in this app.
- The stub webhook is signed with HMAC-SHA256 over `timestamp.payload` so idempotency logic is exercised identically to the Stripe path.

## Architecture

- `lib/payments/types.ts` — single `PaymentProvider` interface. Both adapters conform.
- `lib/fulfillment.ts` — provider-agnostic: record webhook event in a dedup table, then grant entitlement in a transaction. **The dedup and grant path is identical for Stripe and WhitePay.** If one works, the other works.
- `lib/db/` — `webhook_events` (PK `event_id+source`) and `entitlements` (PK `order_id`). Grant is a transaction that short-circuits on existing order.
