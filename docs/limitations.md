# Current limitations

Step 01 verified official token metadata (six decimals), proxy implementation source/runtime, EIP-712 domain, and permit/EIP-3009 behavior through read-only signatures. See [evidence](evidence/token-compatibility.md).

No positive-value successful payment, persisted nonce consumption, mined replay proof, checkout contracts, backend, database, SDK, UI, webhooks, deployment, or npm publication exist yet. Simulation is not settlement. The receiver was an EOA supplied as eth_call caller, not a deployed checkout.

Official test USDT acquisition is unresolved. The token has proxy/governance and blocklist risks; compatibility must be rechecked before any proof or deployment. Embedded-wallet UX remains untested.

Docker CLI is installed locally but its daemon was unavailable during Step 00. Integration tests will require an isolated running database.

Testnet tokens have no claimed monetary value. Refunds, recurring billing, bridging, World ID, and mainnet are excluded.
