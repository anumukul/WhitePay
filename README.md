# WhitePay

Gas-sponsored USDT checkout infrastructure for merchants on Whitechain. Buyers pay in official USDT with **zero WBT**; a separately funded relayer covers gas. Receipts are on-chain and signed webhooks fan out to merchant backends.

## Submission status (testnet)

**Step 02 live proof verified and manually approved:** the experimental PoC settled 5 USDT to the merchant plus a 0.005-USDT fee, with exactly zero payer WBT and relayer-paid gas. [Payment receipt](https://explorer.testnet.whitechain.io/tx/0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641) and [manual acceptance checks](docs/progress/step-02.md) document exact balances, fees and read-only replay rejection. The final WhitePayCheckout is deployed at `0x4d1761ABB4eD290F23fcDA00890039800E2e53f0`; runtime matches the approved build and a final-contract 1-USDT payment plus 0.001-USDT fee succeeded with zero payer WBT and replay rejection, but explorer source verification is temporarily unavailable; Step 03 payer-scoped replay and ABI reader changes were manually accepted. Step 05 PostgreSQL API was manually accepted; Steps 06–13 are committed and pushed. Step 13's local production-like stack (health, readiness, CORS, DB-outage recovery, restart) is verified; hosted deployment and a live relayer require separate explicit approval. Future deployments and payments require separate explicit transaction approval.

| Component                     | Status                            | Tests                                                                         | Note                                                                       |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Contract — `WhitePayCheckout` | STEP 03 APPROVED                  | 35 contract tests (two 256-run fuzz tests), plus 11 official-token fork tests | Step 03, `docs/progress/step-03.md`; deployed; source verification pending |
| Deploy script + smoke         | DEPLOYED, source pending          | 8/8                                                                           | Step 04, `docs/runbooks/step-04-deploy.md`                                 |
| Merchant API                  | GREEN                             | 50/50                                                                         | Steps 05 + 13, `services/api/`; readiness + CORS verified                  |
| Relayer logic                 | LOCAL TEST PENDING                | 43/43                                                                         | Step 06, `docs/progress/step-06.md`                                        |
| Indexer + signed webhooks     | GREEN                             | 7/7                                                                           | Step 07, `services/worker/`                                                |
| `@whitepay/node` SDK          | PUBLIC ALPHA 0.1.0-alpha.0        | 23/23                                                                         | Step 08, `packages/sdk-node/`                                              |
| `@whitepay/react` widget      | PUBLIC ALPHA 0.1.0-alpha.0        | 25/25                                                                         | Step 09, `packages/sdk-react/`                                             |
| Dashboard                     | GREEN                             | 3/3                                                                           | Step 10, `apps/dashboard/`                                                 |
| Demo SaaS                     | GREEN, human review pending       | 4 + 1 Chrome E2E                                                              | Step 11, `apps/demo-saas/` (on `main`)                                     |
| Demo Shop                     | GREEN, human review pending       | 5 + 1 Chrome E2E                                                              | Step 12, `apps/demo-shop/` (on `main`)                                     |
| Service deploy                | LOCAL STACK GREEN, hosted pending | 5 deploy tests                                                                | Step 13, `docs/progress/step-13.md`                                        |
| npm publish of SDKs           | PUBLISHED, registry verified      | —                                                                             | Step 14, `docs/runbooks/step-14-publish.md`                                |
| Landing site                  | PROTOTYPE, Step 15 pending        | —                                                                             | Step 15, `apps/website/`                                                   |
| Adversarial regression        | GREEN                             | 2/2                                                                           | Step 16, `tests/adversarial.test.mjs`                                      |
| Demo video script             | PREPARED                          | —                                                                             | Step 17, `docs/demo-script.md`                                             |

Component counts above are historical teammate reports, not a fresh full-stack certification. Latest Step 02 verification: 28 root Node tests, 10 local PoC tests, 11 official-token fork tests and the live payment/replay checks. Step 13 added 5 API deploy tests (50 API total). Both demo apps are present on current `main`; their browser receipts remain simulated and are not onchain evidence.

## Why on-chain USDT on Whitechain

WhitePay demonstrates direct merchant-controlled settlement in the exact official Whitechain Sepolia test USDT, with programmable authorization and independently auditable receipts. The customer can hold zero WBT while a separately funded relayer sponsors native gas. Both test assets are valueless; this is not real-dollar settlement. The API, Node SDK, React widget and signed webhooks are implemented; public hosted infrastructure remains pending.

## Published SDKs and documentation

```sh
npm install @whitepay/node@0.1.0-alpha.0
npm install @whitepay/react@0.1.0-alpha.0 react react-dom
pnpm --filter @whitepay/docs dev
```

[Node SDK](https://www.npmjs.com/package/@whitepay/node/v/0.1.0-alpha.0) · [React SDK](https://www.npmjs.com/package/@whitepay/react/v/0.1.0-alpha.0) · [Docs source and verification](apps/docs/README.md). Local docs: http://localhost:3400. Configure your own merchant API and authenticated server bridge; package installation does not provide hosted infrastructure. Registry hashes and fresh-consumer checks are recorded in [Step 14](docs/progress/step-14.md). npm auto-assigned latest as well as alpha; cleanup returned HTTP 400, so use exact alpha versions. The docs site has not been deployed publicly.

## Run local checks

```sh
pnpm install
# PostgreSQL API, SDK and dashboard tests (see Step 05 runbook first):
pnpm db:local
export TEST_DATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05
pnpm --filter @whitepay/api --filter @whitepay/node --filter @whitepay/dashboard test
# Step 13 local production-like stack (Docker; API + Postgres):
docker compose up -d --build postgres api
curl http://127.0.0.1:3001/ready
docker compose down -v
# Contract tests:
bash scripts/vendor-oz.sh
cd packages/contracts && FOUNDRY_PROFILE=step03 forge test
```

Use the [Step 05 manual API guide](docs/runbooks/step-05-api.md) for database setup and two-merchant curl checks. The relayer is now preview-only on PostgreSQL; keep the old SQLite worker stopped until Step 07.

## Original Step 02 context

Original narrative below is preserved as-is from the Step 02 milestone. The off-chain stack above was built on top of it.

### Local setup (Step 02 era)

Use Node.js 24 LTS and pnpm 10.25.0. The initial local checks were run on Node 25.8.1; CI targets Node 24.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Copy `.env.example` to `.env` only when needed; never commit credentials.

### References

- [Implementation state](docs/progress/STATE.md)
- Step reports: [00](docs/progress/step-00.md), [01](docs/progress/step-01.md), [02](docs/progress/step-02.md), [03](docs/progress/step-03.md), [04](docs/progress/step-04.md), [05](docs/progress/step-05.md), [06](docs/progress/step-06.md)
- Runbooks: [Step 04 deploy](docs/runbooks/step-04-deploy.md), [Step 13 service deploy](docs/runbooks/step-13-deploy.md), [Step 14 publish](docs/runbooks/step-14-publish.md)
- [Architecture](docs/architecture.md) · [Security](docs/security.md) · [Limitations](docs/limitations.md) · [Demo script](docs/demo-script.md)

Required target: Whitechain Sepolia **1874**, official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

### Experimental gasless proof (Step 02)

```sh
pnpm test:poc
pnpm test:poc:fork
```

10 local contract tests and 11 official-code fork tests. The fork uses synthetic local funding and performs no testnet writes. Solidity 0.8.24 and OpenZeppelin 5.4.0 are pinned.

For a real public-wallet readiness check, fill a copy of `docs/evidence/poc-config.example.json`, then run:

```sh
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-preflight.json
```

No commit or push before manual review and approval.

## External-write gates still needing operator approval

1. Final checkout deployment and its 1-USDT + 0.001-USDT fee payment were explicitly approved and confirmed. Do not rerun consumed commands; explorer source verification remains pending service recovery.
2. Any additional payment requires a fresh preview and explicit approval.
3. **"approve deploy services"** — supply a hosted target and managed database; the local stack in `docs/runbooks/step-13-deploy.md` is already verified.
4. **"approve publish"** — `npm publish` the alpha tarballs per `docs/runbooks/step-14-publish.md`.
5. **"approve submit"** — post the ETHGlobal submission form (operator does this directly).
