# Step 10 dashboard checks

```sh
pnpm db:local
export TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
pnpm --filter @whitepay/api --filter @whitepay/dashboard --filter @whitepay/worker test
pnpm --filter @whitepay/dashboard build
pnpm --filter @whitepay/dashboard test:browser
```

The browser suite creates two isolated local test merchants, API keys, signed orders and controlled receipts, launches the production dashboard in temporary local processes, and checks tenant isolation, orders/payments/receipt links, product edits/versioned prices, masked/one-time keys, revocation, webhook validation and logout. It sends no external webhook or chain transaction and drops its test schema afterward.

For your own local dashboard, start the API with its existing local DATABASE_URL (startup applies versioned migrations), then run `WHITEPAY_API_URL=http://localhost:3001 pnpm --filter @whitepay/dashboard dev`. Open `http://localhost:3200` and enter the merchant API key only into this local sign-in form; never paste credentials into chat. The dashboard validates it against the configured API before creating an opaque session. API keys remain server-side. Restart requires signing in again.

Create a product, add a price in integer USDT minor units, rename it and add another price version; old checkout sessions must retain their original price. Compare two separate merchant logins. Existing API keys display prefixes only. Copy a newly created key securely once, reload and confirm it is no longer displayed; revoke an unused test key and confirm its API access fails.

Saving an HTTPS webhook URL does not authorize sending to it. Send signed test event is a separate user action; the API also requires the destination in WHITEPAY_WEBHOOK_ALLOWED_ORIGINS. Default is no external sends. Loopback receivers are test-only via WHITEPAY_ALLOW_LOCAL_WEBHOOKS=1 and are rejected in production. Successful tests use type webhook.test, never payment.succeeded, and cannot grant entitlements. Configure the real receiver's signing secret securely after explicit rotation.
