# Step 13 — deployed service

Status: **PARTIAL — API, Postgres and SaaS deployed; hosted merchant fulfillment remains open.** The API serves HTTPS health/readiness with five migrations. SaaS Postgres storage and customer-start flow were verified; its redesign is live. Current evidence is in `docs/evidence/render-deployment.json`.

The stricter readiness implementation validates migration versions/checksums, with three regressions added to the existing API tests. The operator relayer remains separately controlled; no new chain payment was made by deployment work.

## Acceptance mapping

| Requirement (PR.md 10.14)                    | Local status                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Health/readiness                             | GREEN — `GET /health` (liveness) and `GET /ready` (database + migration count) with 503 on DB failure.             |
| Startup migration                            | GREEN — the container migrated to 5 versions on start; the API retries instead of crash-looping if the DB is down. |
| Ephemeral worker restart                     | Covered by existing Step 07 tests (`crash before cursor commit … restart recovers`).                               |
| Webhook retry after crash                    | Covered by existing Step 07 tests (`crash after merchant accepts retries the same event id`).                      |
| CORS unauthorized origin                     | GREEN — allowlisted origins receive `Access-Control-Allow-Origin`; others get 403 with no CORS header.             |
| DB connection fail                           | GREEN — stopping Postgres made `/ready` return 503 while the process stayed alive; recovery restored 200.          |
| Hosted URL + managed DB + HTTPS + monitoring | PARTIAL — API, SaaS and managed Postgres are live; monitoring and merchant credential provisioning remain.         |
| Public-URL checkout on a second device       | PARTIAL — hosted UI/customer flow verified; real hosted purchase and second-device acceptance remain.              |
| Hosted relayer with secrets                  | **BLOCKED** — the relayer is intentionally preview-only and has no signer support in this build.                   |

## RED → GREEN

RED was a real defect found while exercising the container stack: stopping PostgreSQL made the API process exit (unhandled idle pool error) and then crash-loop on startup migration. `GET /ready` returned no HTTP response instead of 503.

Two fixes:

1. `services/api/src/db.ts` — attach a sanitized `pool.on('error')` handler so idle-client failures surface through readiness, not a process crash.
2. `services/api/src/server.ts` — listen immediately and retry `migrate()` every 5s. `/health` stays 200 (liveness), `/ready` stays 503 until migrations succeed, and the process exits cleanly on SIGTERM.

The new `services/api/test/deploy.test.ts` was written first and failed 5/5 before the implementation:

- liveness is unauthenticated and names the service;
- readiness proves the database and migrations are usable;
- CORS preflight allows configured origins and rejects others;
- CORS allows listed browser origins, denies unlisted ones, and leaves server-to-server calls open;
- readiness fails closed when the database is unreachable.

## GREEN evidence

```sh
# API unit/integration suite (5 new deploy tests + 45 existing)
DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05 \
TEST_DATABASE_URL=$DATABASE_URL \
pnpm --filter @whitepay/api test
# tests 50 / pass 50 / fail 0

pnpm --filter @whitepay/api typecheck
# clean

# Local production-like stack
docker compose up -d --build postgres api
docker compose ps
# api healthy, postgres healthy
curl http://127.0.0.1:3001/ready
# {"ok":true,"service":"api","checks":{"database":"up","migrations":5}}

curl -i -H 'Origin: http://localhost:3200' http://127.0.0.1:3001/health
# HTTP/1.1 200 OK, access-control-allow-origin: http://localhost:3200, vary: Origin
curl -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' http://127.0.0.1:3001/health
# 403

# DB outage on the running container
docker compose stop postgres
curl -w '%{http_code}' http://127.0.0.1:3001/ready
# 503 {"ok":false,"service":"api","checks":{"database":"down"}}  (container stayed Up)
docker compose start postgres
# /ready recovered to 200 with 5 migrations

# Full profile healthchecks
docker compose --profile full up -d
docker compose ps
# api healthy, postgres healthy, relayer healthy, worker healthy

# Dockerfile lint
docker buildx build --check -f infra/Dockerfile .
# Check complete, no warnings found
```

After the fix, the API image was rebuilt (4s with a warm pnpm cache) and the DB outage was re-tested in-container: stopping Postgres returned 503 while the container stayed `Up`, recovery returned 200 with 5 migrations, and the worker/relayer containers stayed healthy.

## Local stack

- `infra/Dockerfile` — one backend image selected by the `SERVICE` build argument, with a pnpm store cache mount.
- `docker-compose.yml` — Postgres, API (default profile) and worker/relayer (`--profile full`), healthchecks, restart policy.
- `.dockerignore` — excludes secrets, local data, docs and build output.

```sh
docker compose up -d --build postgres api  # API + DB with healthchecks
docker compose --profile full up -d        # add worker and preview-only relayer
docker compose ps
docker compose down -v                     # stop and drop the local volume
```

## External blockers (need explicit approval)

1. A host (Railway/Fly/Render/AWS/GCP) and a managed PostgreSQL instance.
2. A domain/TLS endpoint and monitoring/uptime checks.
3. Secret-manager values for `DATABASE_URL` and webhook credentials.
4. A separate reviewed secure signer before any hosted relayer can execute live; the current relayer must not be described as a live broadcaster.
5. A second-device public-URL checkout, which cannot happen before 1–3.

## Limitations

- The images run TypeScript through `tsx`; there is no per-service JS build artifact yet.
- The worker uses a cursor poll loop, not a managed queue.
- Webhook delivery is disabled by default and only allowed to explicitly listed origins.
- No rate limiting at the edge and no alerting; readiness is the current monitoring primitive.

## Files

- `services/api/src/app.ts` — liveness, readiness, CORS.
- `services/api/src/db.ts` — sanitized pool error handling.
- `services/api/src/server.ts` — listen-first startup with migration retry and graceful shutdown.
- `services/api/test/deploy.test.ts` — 5 local acceptance tests.
- `infra/Dockerfile`, `docker-compose.yml`, `.dockerignore` — local production-like stack.

## Demo deployment preparation — zero budget, provider selection open

User requested deployment for the recording flow: pitch → landing → actual SaaS USDT purchase → explorer → npm → docs. Budget is explicitly $0. Railway was initially selected, then user asked about Render. Official Render documentation confirms free static/web services, ephemeral local files, no free background-worker service and a 30-day lifetime for free PostgreSQL. The initial review identified the need to replace SQLite for hosted SaaS storage; that Postgres integration is now implemented and deployed. Hosted automatic signing has not been approved or implemented. Browser access to the hosting dashboard failed because the browser access host is unavailable; no cloud resources or migrations were created. Docker is installed but its local engine is stopped.

Fixed the known readiness blocker before any host deployment. RED: missing migration marker, mismatched checksum and unexpected migration version all incorrectly returned 200. GREEN: /ready now compares exact migration versions/checksums against the application's migration files and returns 503 for a mismatch while reporting PostgreSQL reachable; no checksum values are returned. Full API suite passes 53/53 and typecheck passes. Disposable PostgreSQL was stopped and removed. No accepted SQL migration file or payment/signature behavior changed. This fix is published in `f629bf9`; live runtime verification is tracked separately.

Read-only chain preflight at block 12406026 on chain 1874 found payer WBT exactly 0, official USDT 1.992, and relayer WBT 0.096640583250954836. SaaS is currently fixed at 5 USDT + .005 fee, so the payer lacks 3.013 USDT. No transfer, swap, signature or broadcast was attempted. Funding and the eventual SaaS payment need their own exact previews/approvals.

Sources checked: https://render.com/docs/free ; https://render.com/docs/background-workers ; https://render.com/docs/static-sites ; https://docs.railway.com/pricing/free-trial . The user subsequently selected Render Free Postgres; the current deployment status is recorded above.

### Additional hosting investigation — Vercel and GitHub Pages

User asked about Vercel/GitHub Pages and worker hosting. Public static landing/pitch and SDK documentation have since been deployed to Vercel Hobby; evidence is in `docs/evidence/website-deployment.json` and `docs/evidence/docs-deployment.json`. API, database, SaaS and worker remain undeployed. Current official Vercel documentation confirms Daemons public beta supports continuous container workers on Hobby, with 5 active CPU-hours and 420 GB-hours provisioned memory per month; Hobby daemons stop at the quota rather than incur daemon charges. This is a candidate for the existing indexer/outbox worker, not a validated deployment. Daemons have no persistent local disk or inbound traffic and currently require a repository-root project (subfolder root projects cannot attach daemons); durable state must stay in PostgreSQL. Ordinary request functions/once-daily Hobby cron are not a drop-in replacement for this polling worker. A hosted executing relayer still needs its secure signer work; keep the existing local encrypted-keystore path unless separately reviewed.

Vercel can host the Next frontends; the SaaS must replace local SQLite with persistent external storage before serverless hosting. Its webhook receiver can run as a normal Next route while the worker sends/retries deliveries separately. GitHub Pages can host exported static landing/docs, not server-side SaaS/API/workers, and the current root-relative routes/search path need base-path configuration for /WhitePay/. At the time of this investigation no platform or database persistence strategy had been selected. The later user request explicitly started free hosting, so the public landing and docs were deployed; no SaaS persistence strategy was assumed and no backend deployment was made.

Sources: https://vercel.com/docs/daemons ; https://vercel.com/docs/daemons/limits ; https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages ; https://vercel.com/docs/storage .

## Publication polish

Readiness regressions and the full 53-test API suite pass against disposable PostgreSQL. Root lint, 33 root tests, shared/package type checks, both static site builds and their Chrome checks pass. The Docker runtime explicitly installs its required TypeScript runner, and private signing/configuration paths are excluded from uploads. The Docker image was not rebuilt in this polish pass; the native Render startup was checked separately. The live SaaS storage/redesign commits remain `fd4cfc1` and `fc7caec`. No new chain signature or transaction is part of this publication.
