# Current limitations

Step 01 verified official token metadata (six decimals), proxy implementation source/runtime, EIP-712 domain, and permit/EIP-3009 behavior through read-only signatures. See [evidence](evidence/token-compatibility.md).

No positive-value successful payment, persisted nonce consumption, mined replay proof, final checkout contracts, backend, database, SDK, UI, webhooks, deployment, or npm publication exist yet. Simulation is not settlement. The receiver was an EOA supplied as eth_call caller, not a deployed checkout.

Official test USDT was acquired in a separate trading wallet, but the payer transfer and payer balance recheck remain pending. The token has proxy/governance and blocklist risks; compatibility must be rechecked before any proof or deployment. Embedded-wallet UX remains untested.

Docker CLI is installed locally but its daemon was unavailable during Step 00. Integration tests will require an isolated running database.

Testnet tokens have no claimed monetary value. Refunds, recurring billing, bridging, World ID, and mainnet are excluded.

Step 02 contains an experimental receiver with mock and fork tests. Fork balances are synthetic; the required live payer/merchant/fee/relayer evidence is missing. Payer funding, teammate review, and specific deployment/payment approvals remain prerequisites. The receiver has not been deployed and no live payment has been made.
