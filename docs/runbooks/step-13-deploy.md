# Step 13 — deploy services (LOCAL STACK READY, HOSTED GATE CLOSED)

Nothing in this runbook has been pushed to a cloud, and no hosted database, domain or secret exists. The local production-like stack is verified. A hosted deployment requires the explicit "approve deploy" gate described at the end.

## What ships

| Workspace          | Container            | Runtime configuration                                                                                                                                    |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/api`     | `whitepay-api`       | `DATABASE_URL`, `PORT`, `HOST`, `WHITEPAY_ALLOWED_ORIGINS` (comma-separated), `CHECKOUT_PAGE_BASE_URL`, `PRIVATE_KEY_ENCRYPTION_KEY`                     |
| `services/worker`  | `whitepay-worker`    | `DATABASE_URL`, `RPC_URL`, `WHITEPAY_CHECKOUT_CONTRACT_ADDRESS`, webhook signing secrets; external delivery stays disabled unless explicitly allowlisted |
| `services/relayer` | `whitepay-relayer`   | `DATABASE_URL`, `RPC_URL`, public relayer addresses. **This build is preview-only and has no signer**, so it cannot broadcast.                           |
| `apps/dashboard`   | `whitepay-dashboard` | `WHITEPAY_API_URL`                                                                                                                                       |

All three services read `DATABASE_URL`; the worker and relayer `db.ts` re-export `@whitepay/api/src/db.js`. There are no separate `WORKER_DATABASE_URL` / `RELAYER_DATABASE_URL` variables.

## Local stack (verified)

- `infra/Dockerfile` — one backend image selected by the `SERVICE` build argument, with a pnpm store cache mount.
- `docker-compose.yml` — Postgres, API (default profile) and worker/relayer (`--profile full`).
- `.dockerignore` — excludes secrets, local data, docs and build output.

```sh
docker compose up -d --build postgres api
docker compose ps
curl http://127.0.0.1:3001/health   # {"ok":true,"service":"api"}
curl http://127.0.0.1:3001/ready    # 200 with database + migration count, 503 when down
docker compose --profile full up -d # add worker and preview-only relayer
docker compose down -v
```

## Health and readiness

- API `GET /health` — liveness, unauthenticated, `{ ok: true, service: "api" }`.
- API `GET /ready` — checks `SELECT 1` and the `schema_migrations` count. Returns 200 with `checks.database`/`checks.migrations`, or 503 with `checks.database: "down"`. The process stays alive through a database outage and recovers automatically.
- Worker healthcheck — database query every 30s. Confirm the cursor advances with `docker compose logs -f worker`.
- Relayer healthcheck — database query every 30s. It proves the process can reach state, not that it can sign; this build cannot sign.
- Dashboard — Next.js default page.

## Startup order

1. Database (Postgres) up. The API retries `migrate()` every 5s and reports not-ready until it succeeds.
2. API.
3. Worker (reads from chain, writes to the database, posts allowlisted webhooks).
4. Relayer (preview-only in this build).
5. Dashboard.
6. Demo apps (external — their own hosts).

## Restart recovery

- API is stateless → safe to restart. Startup migration retries instead of crash-looping; `/ready` gates traffic.
- Worker persists `scan_cursor` per scope; on restart it resumes from `last_block + 1`. Tested in `services/worker/test/worker.test.ts`.
- Relayer persists per-order `submissions` with status and `txHash`; on restart `submit` short-circuits on `already_submitted`. Tested in `services/relayer/test/relayer.test.ts`.
- Webhook retries reuse the persisted event id; a crash after the merchant accepts is retried without a duplicate grant. Tested in Step 07 tests.

## CORS

`WHITEPAY_ALLOWED_ORIGINS` is a comma-separated allowlist. Listed browser origins receive `Access-Control-Allow-Origin` + `Vary: Origin`; unlisted origins receive 403 with no CORS header. Requests without an `Origin` header (server-to-server) are unaffected.

## Known limitations

- Images run TypeScript through `tsx`; there is no per-service JS build artifact.
- The worker uses a cursor poll loop, not a managed queue.
- No edge rate limiting or alerting; readiness is the current monitoring primitive.
- The relayer is preview-only: do not describe it as a live broadcaster.

## STOP — hosted deployment gate

To unblock, supply and approve:

1. A cloud target (Railway/Fly/Render/AWS/GCP) and a managed PostgreSQL instance.
2. A domain/TLS endpoint plus uptime/alert monitoring.
3. A secret manager holding `DATABASE_URL` and webhook credentials.
4. A separately reviewed secure signer before any hosted relayer can execute live.
5. Then run the compose services against the hosted database, verify `/ready`, and perform a second-device public-URL checkout.
