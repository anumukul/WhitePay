# Step 13 — Deploy services (PREPARED, EXTERNAL-WRITE GATE)

External-write gate. Nothing in this runbook has been pushed to any cloud. Operator runs after explicit approval.

## What ships

| Workspace | Container | Secrets required |
|---|---|---|
| `services/api` | `whitepay-api` | `DATABASE_URL`, `CHECKOUT_PAGE_BASE_URL`, `PORT` |
| `services/worker` | `whitepay-worker` | `WORKER_DATABASE_URL`, `RPC_URL`, `WHITEPAY_CHECKOUT_CONTRACT_ADDRESS`, merchant webhook delivery credentials |
| `services/relayer` | `whitepay-relayer` | `RELAYER_DATABASE_URL`, `RPC_URL`, `RELAYER_KEYSTORE_PATH`, `RELAYER_KEYSTORE_PASSWORD` (read from secret manager, never env in plaintext) |
| `apps/dashboard` | `whitepay-dashboard` | `WHITEPAY_API_URL` |

## Deviations from PR.md 10.14

- PR.md calls for Postgres. Current implementation uses SQLite for dev-time. **For production deploy, swap `DATABASE_URL` to a Postgres URL and port the `migrate()` function in each service's `db.ts` to Postgres SQL.** Noted as a coordination item; the schema is small enough that porting is mechanical.
- No managed queue yet (BullMQ/Temporal). The worker uses a cursor-driven poll loop (`scanOnce`); good enough for testnet traffic, insufficient for production reliability.

## Dockerfile templates (illustrative)

Not written to the repo yet to avoid committing an untested spec. The structure for each service is standard:

```
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/<name>/package.json services/<name>/
RUN corepack enable && pnpm install --filter @whitepay/<name> --frozen-lockfile --prod=false
COPY services/<name>/ services/<name>/
CMD ["pnpm", "--filter", "@whitepay/<name>", "dev"]
```

## Health checks

- API: `GET /health` → `{ ok: true }` (implemented).
- Worker: TODO — expose `/health` returning cursor age.
- Relayer: TODO — expose `/health` returning relayer balance + daily spend.
- Dashboard: Next.js default `/` works.

## Startup order

1. Database (Postgres) up and migrated.
2. API.
3. Worker (reads from chain, writes to DB, posts webhooks).
4. Relayer (reads signed submissions from API, submits to chain).
5. Dashboard.
6. Demo apps (external — their own hosts).

## Restart recovery

- API is stateless → safe to restart anytime.
- Worker persists `scan_cursor` per scope; on restart it resumes from `last_block + 1`. Tested in `services/worker/test/worker.test.ts`.
- Relayer persists per-order `submissions` with status + txHash; on restart `submit` short-circuits on `already_submitted`. Tested in `services/relayer/test/relayer.test.ts`.

## CORS

Dashboard calls API from a browser if deployed to a different origin. Current API returns no CORS headers → will fail cross-origin. **Add a thin allowlist in `services/api/src/app.ts` before deploy.**

## STOP — awaiting "approve deploy"

To unblock: supply a cloud target (Railway/Fly/Render/AWS/GCP), confirm Postgres provisioning, confirm secret manager, run the Dockerfile templates to real images, push, and give the "approve deploy" phrase.
