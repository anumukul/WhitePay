# Architecture

Planned flow: merchant backend → checkout session API → customer authorization → sponsored relayer → checkout contract → receipt verifier → transactional webhook outbox → merchant fulfillment.

Only the shared network constants and baseline workspace exist. Contract ABI, authorization path, API framework, database library, wallet integration, and hosting remain undecided. Step 01 investigates the exact official token; Step 02 proves zero-WBT settlement before general SDK development.

Canonical requirements: [PR.md](../PR.md). Record evidence-driven architectural decisions in `docs/decisions/` before changing core interfaces.
