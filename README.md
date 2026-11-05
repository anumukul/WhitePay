# WhitePay

Gas-sponsored USDT checkout infrastructure for SaaS and small businesses.

**Status: Step 02 local proof prepared; one-off official-USDT acquisition verified, payer transfer and live WhitePay proof still pending. No WhitePay contract deployment, mined checkout, or published SDK. Testnet only.**

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

- [Implementation state](docs/progress/STATE.md)
- [Step 02 implementation report](docs/progress/step-02.md)
- [Step 00 evidence](docs/progress/step-00.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Limitations](docs/limitations.md)

Required target: Whitechain Sepolia **1874**, official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. Live Step 01 probes read six USDT decimals and verified permit/EIP-3009 signatures in simulation. See [token evidence](docs/evidence/token-compatibility.md); this does not prove a funded payment. No replacement mock token can satisfy the payment proof.

Each milestone follows RED → GREEN → REFACTOR, manual review, approval, then a scoped commit and authorized push. The detailed project instructions are maintained locally and excluded from this repository. Do not begin the next milestone automatically.

## Read-only token investigation

```sh
pnpm probe:token docs/evidence/token-probe-manual.json
```

Requires public network access, no keys or credentials. Writes local evidence and makes read-only RPC/explorer calls. It never broadcasts. Review the [authorization-path proposal](docs/decisions/0001-authorization-path.md) and [Step 01 report](docs/progress/step-01.md) before authorizing the next milestone.

## Experimental gasless proof (Step 02)

```sh
pnpm test:poc
pnpm test:poc:fork
```

Expect 10 local contract tests and 6 official-code fork tests. The fork uses synthetic local funding and performs no testnet writes. Solidity 0.8.24 and OpenZeppelin 5.4.0 are pinned; Foundry may need network access to download the compiler the first time.

For a real public-wallet readiness check, fill a copy of `docs/evidence/poc-config.example.json`, then run:

```sh
pnpm poc:preflight docs/evidence/poc-config.json docs/evidence/poc-preflight.json
```

Use public addresses only. [PoC evidence and live checklist](docs/evidence/gasless-poc.md) explain wallet requirements, gas caps, and the explicit deployment/payment review gates. No commit or push before manual review and approval.
