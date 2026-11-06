# Step 07 worker checks

Use the existing local PostgreSQL instance; tests create isolated schemas. Do not run migration down against the operator database.

```sh
pnpm db:local
export TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
pnpm --filter @whitepay/worker test
pnpm --filter @whitepay/worker typecheck
```

Inspect the already indexed official payment from a new process:

```sh
DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
  pnpm --filter @whitepay/worker step07:live inspect
```

`step07:live index` can repeat the fixed confirmed payment scan idempotently. It cannot sign, broadcast or deliver a webhook. The public report must show one matched event, one succeeded payment, settled session and two persisted scan checkpoints. Repeated indexing must not add a payment or outbox row.

`worker test` includes an actual localhost capture endpoint that verifies the exact request signature, returns a failed first acknowledgment and grants the duplicated event only once. No external capture service is used.

The ordinary worker server indexes from the final checkout deployment using two confirmations. Webhook delivery stays disabled unless `WHITEPAY_WEBHOOK_DELIVERY_ENABLED=1` and `WHITEPAY_WEBHOOK_ALLOWED_ORIGINS` explicitly lists approved HTTPS origins separated by commas. This repository configuration does not authorize posting to any external endpoint. Do not enable external delivery before destination approval. Merchants must deduplicate the immutable event ID in the same database transaction as fulfillment. Dead rows require investigation; they are not automatically reset or silently retried forever.
