# Architecture

Planned flow: merchant backend → checkout session API → customer authorization → sponsored relayer → checkout contract → receipt verifier → transactional webhook outbox → merchant fulfillment.

The workspace contains shared network constants, the deployed experimental receiver, and later teammate prototypes for the final contract and offchain stack. Final interfaces and technology choices remain subject to their milestone acceptance. Step 01 verified six-decimal official USDT and permit/EIP-3009 in simulation; Step 02 now verifies a live funded zero-WBT settlement and has been manually accepted. [ADR 0001](decisions/0001-authorization-path.md) records the receiver-only EIP-3009 path and payer-scoped replay correction.

Record evidence-driven architectural decisions in `docs/decisions/` before changing core interfaces. Current implementation and milestone status are tracked in `docs/progress/STATE.md` and `docs/progress/step-02.md`.

Step 02's experimental receiver now has a verified live official-USDT payment, exact merchant/fee split, relayer WBT debit and zero-WBT payer, followed by read-only replay rejection. See `docs/progress/step-02.md`; manual acceptance is recorded. Teammate API/SQLite/relayer/worker/chain-client/SDK/app prototypes exist, but their later acceptance gates remain incomplete. No final checkout ABI or production SDK integration has been approved.
