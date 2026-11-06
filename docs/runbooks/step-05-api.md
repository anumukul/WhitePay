# Step 05 — Manual merchant API checks

Run commands from repository root. This milestone uses a separate local PostgreSQL database and synthetic merchant fixtures. It does not use wallet keystores or broadcast transactions. Keep the old relayer/worker stopped; PostgreSQL queue integration is their next milestones.

## 1. Start the dedicated local database

Install PostgreSQL 15+ if needed and put its binaries on PATH. On this Mac they are at `/opt/homebrew/opt/postgresql@15/bin`.

```bash
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
pnpm db:local
export DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
export TEST_DATABASE_URL="$DATABASE_URL"
pnpm --filter @whitepay/api migrate
pnpm --filter @whitepay/api --filter @whitepay/node --filter @whitepay/dashboard test
pnpm --filter @whitepay/api --filter @whitepay/node --filter @whitepay/dashboard typecheck
```

The helper creates/reuses only `/private/tmp/whitepay-step05-pg`, binds loopback port 55432, uses local trust authentication, and creates database whitepay_step05. Tests create/drop their own hashed schemas and leave manual fixtures alone. Existing PostgreSQL installations/databases and SQLite files are preserved. `pnpm db:local stop` stops only this dedicated cluster. The helper does not delete its data directory.

Expected: 37 API tests, 7 Node SDK tests, 3 dashboard tests pass. Two independent 256-run contract fuzz tests remain in Step 03; this is a database/API test milestone.

## 2. Create private local merchant fixtures

```bash
pnpm --filter @whitepay/api seed
```

The command creates two synthetic merchants, a product and 1-USDT price for each. API keys expire after 24 hours and are written to a new ignored `data/step05-demo-TIMESTAMP.json` file with permissions 0600 inside a 0700 directory. Only its path is printed. Use that printed filename below; do not paste credentials into chat or commit them.

```bash
export FIXTURE=data/step05-demo-TIMESTAMP.json
export KEY_A="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.FIXTURE)).A.apiKey)')"
export KEY_B="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.FIXTURE)).B.apiKey)')"
export PRICE_A="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.FIXTURE)).A.priceId)')"
export BASE=http://127.0.0.1:3001
```

## 3. Start only the API (terminal A)

```bash
export WHITECHAIN_CHAIN_ID=1874
export WHITEPAY_CHECKOUT_CONTRACT_ADDRESS=0x4d1761ABB4eD290F23fcDA00890039800E2e53f0
export WHITEPAY_FEE_RECIPIENT=0x2F51C76D37BA9118ce8D5b9377329965ddb411c2
export WHITEPAY_FEE_BASIS_POINTS=10
export WHITEPAY_QUOTE_VALIDITY_SECONDS=60
pnpm --filter @whitepay/api dev
```

Use the DATABASE_URL exported above in this terminal. API binds 127.0.0.1:3001 by default; HOST/PORT can override. Startup applies checksum-checked migrations and fails if PostgreSQL is unavailable. It does not load `.env` automatically, sign, contact an RPC, or launch a relayer.

## 4. Test authentication and immutable sessions (terminal B)

Export the BASE/fixture variables from section 2 in this terminal too.

```bash
curl -sS "$BASE/health"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/v1/payments"
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer wp_sk_forged' "$BASE/v1/payments"
```

Expect health ok, then 401 and 401.

```bash
curl -sS "$BASE/v1/checkout/sessions" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: manual-session-1' \
  --data "{\"priceId\":\"$PRICE_A\",\"externalOrderId\":\"manual-1\"}"
```

Expect 200, amountMinor 1000000, currency USDT and the exact official token. Copy the returned public session id:

```bash
export SESSION=cs_REPLACE_WITH_RETURNED_ID
curl -sS "$BASE/v1/checkout/sessions/$SESSION" -H "Authorization: Bearer $KEY_A"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/v1/checkout/sessions/$SESSION" -H "Authorization: Bearer $KEY_B"
```

Expect A can read and B receives 404. Repeat the original POST unchanged: same session id. Change externalOrderId while reusing Idempotency-Key: 409 idempotency_conflict. Remove the key and add `"amountMinor":1` or `"merchantId":"forged"` to the body: 400 invalid_request. B cannot create a session with PRICE_A (404).

## 5. Test products and versioned prices

```bash
curl -sS "$BASE/v1/products" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' --data '{"name":"Manual credits"}'
export PRODUCT=prod_REPLACE_WITH_RETURNED_ID
curl -sS "$BASE/v1/prices" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' \
  --data "{\"productId\":\"$PRODUCT\",\"amountMinor\":1000000,\"currency\":\"USDT\",\"tokenAddress\":\"0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7\"}"
```

Expect 201/version 1. Repeat with amountMinor 2000000: new price id/version 2; old sessions retain their original price and amount. GET `/v1/prices/PRICE_ID` reads an owned version. B cannot read PRODUCT or create prices under it (404). Negative/fractional/zero/unsafe integers, numeric strings, other currencies/tokens, unknown fields and attempted PUT/PATCH updates are rejected. A new version is the supported price change.

## 6. Inspect quote, expiry and explicit renewal

Use this synthetic payer address; do not sign these demonstration quotes with a funded wallet.

```bash
curl -sS "$BASE/v1/checkout/sessions/$SESSION/order" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' --data '{"payerAddress":"0xcccccccccccccccccccccccccccccccccccccccc"}'
```

Expect domain WhitePayCheckout/version 1/chain 1874/final deployed address; amount "1000000", fee "1000" (10 basis points, integer floor). The second token typed-data domain must be Tether USD/version 1/exact official USDT; total value "1001000", receiver final checkout, nonce equal orderDigest. The merchant payout is the synthetic merchant fixture, not a real payment request. Same payer/session returns identical stored typed data while valid. B cannot issue a quote for A's session. Unknown fields or zero payer reject with 400.

Copy submissionId. POST fabricated 65-byte hex signatures to `/v1/submissions/SUBMISSION_ID/signatures`: 400; it must remain awaiting_signature. Short/malformed signatures also reject. GET submission with A omits both signature fields; B gets 404.

Wait beyond the 60-second window. `/order` now returns 409 quote_expired, with no automatic replacement. POST the same payer body to `/v1/checkout/sessions/SESSION_ID/renew`: fresh quoteId/digest/window, same stable orderId and session price. Renewal before expiry or after signatures queue is rejected (409). Old signatures cannot authorize renewed terms. Automated tests cover real ephemeral test signatures without printing keys or signatures; no actual wallet signing is needed for this manual API gate.

## 7. Persistence and acceptance

Stop/restart only the API with Ctrl-C and the same DATABASE_URL; GET SESSION as A must retain identical price/amount. Repeat migrations up: no duplicate schema/version. Migration down/up and injected-failure rollback are tested only in disposable schemas; running down on a populated manual database removes its tables/data.

Review HTTP results and automated key-expiry/revocation, concurrent duplicates, rollback and real-signature tests. Return results for manual acceptance. Step 05 stays uncommitted until your approval. Step 04 source verification remains an open explorer dependency. Do not start live relaying, deploy services, or advance to Step 06 during this test.
