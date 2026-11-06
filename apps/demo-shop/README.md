# WhitePay digital shop demo

An independent merchant that sells a downloadable launch template for **3 USDT** on Whitechain Sepolia. It is a separate app from `apps/demo-saas` and uses the same published-shape SDKs without modification:

- `@whitepay/node` for merchant server calls, signed-webhook verification and the checkout bridge.
- `@whitepay/react` for the wallet widget.

The point of this demo is isolation, not a second copy of the same flow: a different merchant id, payout address, webhook secret and product. Fulfillment only unlocks a download after a verified `payment.succeeded` webhook. A browser callback cannot grant anything, and another customer cannot redeem the download token.

## Product and price

| Item            | Value                               |
| --------------- | ----------------------------------- |
| Product         | WhitePay launch template (Markdown) |
| Price           | 3.000 USDT                          |
| Sponsorship fee | 0.003 USDT (10 bps, disclosed)      |
| Total           | 3.003 USDT                          |
| Network         | Whitechain Sepolia (1874)           |
| Token           | official USDT, 6 decimals           |

The fee recipient is a separate address from the merchant payout. The relayer, not the buyer, pays WBT gas.

## Local setup

Copy `.env.example` to `.env`, then fill it from the merchant API:

```sh
SHOP_DATABASE_PATH=data/shop.db
APP_BASE_URL=http://localhost:3400
WHITEPAY_API_URL=http://localhost:3001
WHITEPAY_SECRET_KEY=wp_sk_...           # server-only merchant secret
WHITEPAY_PRICE_ID=price_...             # 3 USDT price created for this merchant
WHITEPAY_WEBHOOK_SECRET=whsec_...       # this merchant's webhook signing secret
WHITEPAY_FEE_RECIPIENT=0x...            # public fee address
```

Never expose `WHITEPAY_SECRET_KEY` or `WHITEPAY_WEBHOOK_SECRET` to the browser. The app reads them only in server code.

```sh
pnpm install
pnpm --filter @whitepay/demo-shop dev
# http://localhost:3400
```

## Automated checks

```sh
pnpm --filter @whitepay/demo-shop test          # 5 unit/integration tests
pnpm --filter @whitepay/demo-shop typecheck
pnpm --filter @whitepay/demo-shop build
pnpm --filter @whitepay/demo-shop test:browser  # 1 Chrome end-to-end test
```

The browser test starts a throwaway API and this app, creates a separate merchant with a different payout, performs the real widget signing calls against a local mock wallet, settles the queued submission, delivers the real signed HTTP webhook twice, and verifies exactly one download entitlement. It also proves that a browser callback, a guessed token and another customer's session cannot unlock the file.

`test:browser` needs Chrome. Set `WHITEPAY_TEST_CHROME` if it is not at the default macOS path.

## Manual acceptance script

1. Start the API, worker and this app with a fresh merchant, price and webhook secret.
2. Open the app, start a session and buy the template.
3. Before paying, confirm `/downloads` is empty and `/download/<guessed>` returns 404.
4. Pay 3.003 USDT with the widget. Confirm the browser success page alone does not unlock a download.
5. Deliver the signed `payment.succeeded` webhook. Confirm the order page and `/downloads` show one download link.
6. Download the template. Confirm the content is the template and the download count increases.
7. Replay the same webhook; confirm no second entitlement is created.
8. Start a second browser session. Confirm it cannot open the first customer's download link (404).

## Security notes

- SQLite stores only hashed customer session tokens, never the raw cookie value.
- Entitlements are keyed by order and payment id, with unique constraints; event ids are stored in the same transaction for idempotency.
- Fulfillment re-reads the payment from the API and checks session, merchant, amount, fee, tx hash and block number.
- The download route requires both the unguessable token and the matching customer cookie.
- The app never asks for or stores a wallet private key. The widget signs through an injected wallet.

## Known limitations

- Testnet only; no hosted deployment, monitoring or rate limiting is included.
- SQLite is single-node. Production would use PostgreSQL and a shared cache.
- The template file is generated in code rather than streamed from object storage.
- No refunds, recurring billing or bridging are in scope.
