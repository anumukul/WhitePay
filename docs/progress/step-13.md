# Step 13 — deployed service

Status: **PARTIAL — local production-like acceptance GREEN; external hosted deployment BLOCKED by the approval gate.**

No cloud resource, domain, secret or hosted database was created. The relayer remains preview-only and performs no broadcast.

## Acceptance mapping

| Requirement (PR.md 10.14)                    | Local status                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Health/readiness                             | GREEN — `GET /health` (liveness) and `GET /ready` (database + migration count) with 503 on DB failure.             |
| Startup migration                            | GREEN — the container migrated to 5 versions on start; the API retries instead of crash-looping if the DB is down. |
| Ephemeral worker restart                     | Covered by existing Step 07 tests (`crash before cursor commit … restart recovers`).                               |
| Webhook retry after crash                    | Covered by existing Step 07 tests (`crash after merchant accepts retries the same event id`).                      |
| CORS unauthorized origin                     | GREEN — allowlisted origins receive `Access-Control-Allow-Origin`; others get 403 with no CORS header.             |
| DB connection fail                           | GREEN — stopping Postgres made `/ready` return 503 while the process stayed alive; recovery restored 200.          |
| Hosted URL + managed DB + HTTPS + monitoring | **BLOCKED** — requires explicit deployment approval, a host, a managed database and a secret manager.              |
| Public-URL checkout on a second device       | **BLOCKED** — no hosted URL exists yet.                                                                            |
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
