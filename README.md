# WhitePay

Gas-sponsored USDT checkout infrastructure for SaaS and small businesses.

**Status: Step 00 baseline only. No working payment, deployment, published SDK, or verified token authorization yet. Testnet only.**

WhitePay is designed to settle directly to merchant-controlled wallets with independently auditable onchain receipts. A separately funded relayer will pay WBT gas; a disclosed USDT service fee may reimburse sponsorship. This remains a design until the live feasibility proof passes.

## Local setup

Use Node.js 24 LTS and pnpm 10.25.0. The initial local checks were run on Node 25.8.1; CI targets Node 24.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Copy `.env.example` to `.env` only when needed; never commit credentials. Baseline checks need no secrets, Docker, wallets, or RPC access.

`pnpm test:integration`, `pnpm test:e2e`, `pnpm test:contracts`, and `pnpm test:sepolia` deliberately exit nonzero with prerequisites until their milestones exist. Baseline CI does not imply those suites passed.

## Project references

- [Requirements and milestone agreement](PR.md)
- [Implementation state](docs/progress/STATE.md)
- [Step 00 evidence](docs/progress/step-00.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Limitations](docs/limitations.md)

Required target: Whitechain Sepolia **1874**, official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. USDT decimals and signing capabilities require live investigation. No replacement mock token can satisfy the payment proof.

Each milestone follows RED → GREEN → REFACTOR, manual review, approval, then a scoped commit and authorized push. Do not begin the next milestone automatically.
