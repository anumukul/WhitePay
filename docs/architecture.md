# Architecture

Planned flow: merchant backend → checkout session API → customer authorization → sponsored relayer → checkout contract → receipt verifier → transactional webhook outbox → merchant fulfillment.

Only the shared network constants and baseline workspace exist. Contract ABI, authorization path, API framework, database library, wallet integration, and hosting remain undecided. Step 01 verified six-decimal official USDT and both permit/EIP-3009 in read-only simulation. [ADR 0001](decisions/0001-authorization-path.md) proposes receiver-only EIP-3009; approval is pending. Step 02 must prove funded zero-WBT settlement before general SDK development.

Canonical requirements: [PR.md](../PR.md). Record evidence-driven architectural decisions in `docs/decisions/` before changing core interfaces.
