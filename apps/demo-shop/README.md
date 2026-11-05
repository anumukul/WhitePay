# demo-shop — WhitePay digital-shop demo

A Next.js 15 digital shop that sells a one-time e-book download per order, through two payment providers:

- **Stripe** — real test-mode Checkout Session with webhook signature verification.
- **WhitePay** — **placeholder flow** against local stubs. Same swap points as `demo-saas`; swap to the real SDK when Steps 05/07/08/09 land.

**Different merchant identity, webhook secret, and payout address from `demo-saas`.** Testnet / test-mode only.

## Setup

```bash
cd apps/demo-shop
cp .env.example .env.local
# fill in STRIPE_*. WHITEPAY_* can stay at REPLACE for the placeholder flow.
pnpm install --filter @whitepay/demo-shop
pnpm --filter @whitepay/demo-shop dev   # runs on :3100 (demo-saas runs on :3000)
```

Node ≥22.5 required (uses built-in `node:sqlite`). DB at `data/shop.db` (gitignored).

## Stripe test mode end-to-end

1. `stripe login`
2. Terminal A: `pnpm --filter @whitepay/demo-shop dev`
3. Terminal B: `stripe listen --forward-to localhost:3100/api/webhooks/stripe`. Copy the fresh `whsec_...` into `.env.local` as `STRIPE_WEBHOOK_SECRET`. Restart dev.
4. Open http://localhost:3100/checkout, pick **Stripe**, pay with `4242 4242 4242 4242`.
5. Watch `stripe listen` log `checkout.session.completed`. Follow to `/download?...` — a single-use link appears.

## WhitePay placeholder flow

1. `pnpm --filter @whitepay/demo-shop dev`
2. Go to http://localhost:3100/checkout, pick **WhitePay**.
3. Stub page clearly reads **"PLACEHOLDER — not a real WhitePay payment."** Click simulate.
4. Stub route signs an event and POSTs to `/api/webhooks/whitepay`.
5. `/download?orderId=...` shows a one-time download link.

## Idempotency proof

```bash
pnpm --filter @whitepay/demo-shop test
```

Expected: `# pass 3 / # fail 0`.

- `CP-21`: duplicate webhook with same `eventId` → one entitlement row only.
- `CP-22`: visiting `/download` without a webhook → no entitlement; download is impossible.
- `CP-21b`: download token is single-use (second consume returns `already_consumed`).

Manual replay: `stripe events resend evt_xxx` (Stripe path), or repeat the stub "Simulate successful payment" with the same session URL → no second entitlement row.

## Isolation from demo-saas

| Property | demo-saas | demo-shop |
|---|---|---|
| Port | 3000 | 3100 |
| DB file | `apps/demo-saas/data/demo.db` | `apps/demo-shop/data/shop.db` |
| MERCHANT_ID | n/a | `shop-demo-7f3e` |
| WHITEPAY_SECRET_KEY | different | different |
| WHITEPAY_WEBHOOK_SECRET | different | different |
| STRIPE_PRICE_ID | credit pack | e-book |
| Entitlement | 100 credits, spendable | one-time download token |

Each app is a self-contained workspace. No shared state, no cross-fulfillment.

## Placeholder inventory

| File | Stands in for | Milestone | Swap instruction |
|---|---|---|---|
| `lib/whitepay/stub-client.ts` | `@whitepay/node` SDK | Step 08 | Delete, change import in `lib/payments/whitepay-adapter.ts` to `@whitepay/node`. Set `WHITEPAY_SECRET_KEY`, `WHITEPAY_API_URL`. |
| `app/api/_stub/whitepay/webhook/route.ts` | Relayer+indexer webhook emission | Step 07 | Delete; real webhooks arrive at `/api/webhooks/whitepay` directly. |
| `app/_stub/whitepay/pay/[sessionId]/page.tsx` | Hosted WhitePay checkout page | Step 09/13 | Delete whole `app/_stub/` tree. |
| `.env.example` — `WHITECHAIN_USDT_ADDRESS`, `WHITEPAY_CHECKOUT_CONTRACT_ADDRESS`, `WHITEPAY_PAYOUT_ADDRESS` | On-chain addresses | Step 04 | Replace with verified deployed addresses. |

## What is NOT real

- No download is served over Whitechain. The "USDT" amount is a label only in the WhitePay path.
- The stub webhook is HMAC-SHA256 signed over `timestamp.payload` — identical verification shape as real relayer/indexer webhooks will use, so swap-in requires no handler change.
