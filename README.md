# WhitePay

Gas-sponsored USDT checkout infrastructure for merchants on Whitechain. Buyers pay in official USDT with **zero WBT**; a separately funded relayer covers gas. Receipts are on-chain and signed webhooks fan out to merchant backends.

## Submission status (testnet)

**Step 02 live proof verified and manually approved:** the experimental PoC settled 5 USDT to the merchant plus a 0.005-USDT fee, with exactly zero payer WBT and relayer-paid gas. [Payment receipt](https://explorer.testnet.whitechain.io/tx/0x93b866b4855b0fe05a86578ecbebe174671417c809c8598822fb04a3623c4641) and [manual acceptance checks](docs/progress/step-02.md) document exact balances, fees and read-only replay rejection. The final WhitePayCheckout is not deployed; Step 03 now corrects payer-scoped replay and its ABI reader, with Step 03 manual acceptance recorded; final security/deployment approval remains separate. Future deployments and payments require separate explicit transaction approval.

| Component                     | Status                   | Tests                                                                         | Note                                                               |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contract — `WhitePayCheckout` | STEP 03 APPROVED         | 35 contract tests (two 256-run fuzz tests), plus 11 official-token fork tests | Step 03, `docs/progress/step-03.md`; not deployed                  |
| Deploy script + smoke         | PREPARED, not broadcast  | 4/4                                                                           | Step 04, `docs/runbooks/step-04-deploy.md`                         |
| Merchant API                  | GREEN                    | 8/8                                                                           | Step 05, `services/api/`                                           |
| Relayer logic                 | GREEN (mock chain)       | 11/11                                                                         | Step 06, `services/relayer/`                                       |
| Indexer + signed webhooks     | GREEN                    | 7/7                                                                           | Step 07, `services/worker/`                                        |
| `@whitepay/node` SDK          | GREEN, packable          | 6/6                                                                           | Step 08, `packages/sdk-node/`                                      |
| `@whitepay/react` widget      | GREEN, packable          | 5/5                                                                           | Step 09, `packages/sdk-react/`                                     |
| Dashboard                     | GREEN                    | 3/3                                                                           | Step 10, `apps/dashboard/`                                         |
| Demo SaaS                     | GREEN                    | 3/3                                                                           | Step 11, `apps/demo-saas/` (on branch `feat/step-11-12-demo-saas`) |
| Demo Shop                     | GREEN                    | 3/3                                                                           | Step 12, `apps/demo-shop/` (same branch)                           |
| Service deploy                | PREPARED, not deployed   | —                                                                             | Step 13, `docs/runbooks/step-13-deploy.md`                         |
| npm publish of SDKs           | PREPARED, tarballs built | —                                                                             | Step 14, `docs/runbooks/step-14-publish.md`                        |
| Landing site                  | SHIPS                    | —                                                                             | Step 15, `apps/website/`                                           |
| Adversarial regression        | GREEN                    | 2/2                                                                           | Step 16, `tests/adversarial.test.mjs`                              |
| Demo video script             | PREPARED                 | —                                                                             | Step 17, `docs/demo-script.md`                                     |

Component counts above are historical teammate reports, not a fresh full-stack certification. Latest Step 02 verification: 28 root Node tests, 10 local PoC tests, 11 official-token fork tests and the live payment/replay checks. Demo apps referenced on another branch are not present on current main.

## Why on-chain USDT on Whitechain

Whitechain settles official Tether USD natively. WhitePay turns that into a Stripe-shaped merchant integration: a hosted checkout, a Node SDK, a React widget, signed webhooks — the same shape developers already know, but settled in real dollars on an L2 their buyers are already on. The payer never needs WBT; the merchant gets instant on-chain receipt.

## Run the whole thing locally

```sh
pnpm install
# All tests at once (each workspace has its own):
pnpm --filter '@whitepay/*' test
# Contract tests:
bash scripts/vendor-oz.sh
cd packages/contracts && FOUNDRY_PROFILE=step03 forge test
```

See individual READMEs in each workspace for setup.

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
- Step reports: [00](docs/progress/step-00.md), [01](docs/progress/step-01.md), [02](docs/progress/step-02.md), [03](docs/progress/step-03.md), [04](docs/progress/step-04.md)
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

1. **"approve deploy"** — broadcast `WhitePayCheckout` per `docs/runbooks/step-04-deploy.md`.
2. **"approve settlement"** — approve any future final-contract smoke payment separately. The Step 02 experimental payment already succeeded; do not rerun its consumed order/nonce.
3. **"approve deploy services"** — push Docker images per `docs/runbooks/step-13-deploy.md`.
4. **"approve publish"** — `npm publish` the alpha tarballs per `docs/runbooks/step-14-publish.md`.
5. **"approve submit"** — post the ETHGlobal submission form (operator does this directly).
