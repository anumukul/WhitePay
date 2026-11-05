# Architecture

Planned flow: merchant backend → checkout session API → customer authorization → sponsored relayer → checkout contract → receipt verifier → transactional webhook outbox → merchant fulfillment.

The workspace contains shared network constants and an experimental Solidity receiver used only for Step 02 feasibility work. The final contract ABI, API framework, database library, wallet integration, and hosting remain undecided. Step 01 verified six-decimal official USDT and both permit/EIP-3009 in read-only simulation. [ADR 0001](decisions/0001-authorization-path.md) records the proposed receiver-only EIP-3009 path; final approval is pending. Step 02 must prove funded zero-WBT settlement before general SDK development.

Record evidence-driven architectural decisions in `docs/decisions/` before changing core interfaces. Current implementation and milestone status are tracked in `docs/progress/STATE.md` and `docs/progress/step-02.md`.

Step 02 adds only an experimental receiver, tests, and public read-only preflight under `packages/contracts/poc/` and `scripts/poc/`. Official-code fork tests pass with synthetic local funding; live settlement remains unproven. No final contract ABI or SDK implementation has been approved.
