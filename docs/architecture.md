# Architecture

Planned flow: merchant backend → checkout session API → customer authorization → sponsored relayer → checkout contract → receipt verifier → transactional webhook outbox → merchant fulfillment.

The workspace contains shared network constants, the deployed experimental receiver, and later teammate prototypes for the final contract and offchain stack. Final interfaces and technology choices remain subject to their milestone acceptance. Step 01 verified six-decimal official USDT and permit/EIP-3009 in simulation; Step 02 now verifies a live funded zero-WBT settlement and has been manually accepted. [ADR 0001](decisions/0001-authorization-path.md) records the receiver-only EIP-3009 path and payer-scoped replay correction.

Record evidence-driven architectural decisions in `docs/decisions/` before changing core interfaces. Current implementation and milestone status are tracked in `docs/progress/STATE.md` and `docs/progress/step-02.md`.

Step 02's experimental receiver now has a verified live official-USDT payment, exact merchant/fee split, relayer WBT debit and zero-WBT payer, followed by read-only replay rejection. See `docs/progress/step-02.md`; manual acceptance is recorded. Teammate API/SQLite/relayer/worker/chain-client/SDK/app prototypes exist, but their later acceptance gates remain incomplete. The final checkout ABI passed Step 03 acceptance; production SDK integration remains subject to its later milestone.

Step 05 now implements the merchant API on PostgreSQL with immutable prices/session snapshots, full persisted order/token quote domains, strict signature admission and transactionally bound idempotency. Manual acceptance is pending. See docs/progress/step-05.md and ADR 0002. The final checkout was deployed and its live official-token payment/replays verified in Step 04; explorer source verification remains pending. The relayer/worker still use SQLite adapters and must be integrated with PostgreSQL before automated fulfillment is claimed.
