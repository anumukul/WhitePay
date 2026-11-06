# Current limitations

Step 01 verified official token metadata (six decimals), proxy implementation source/runtime, EIP-712 domain, and permit/EIP-3009 behavior through read-only signatures. See [evidence](evidence/token-compatibility.md).

Step 02 now has a mined positive-value official-USDT payment through the deployed experimental receiver, persisted order/token nonce consumption, and read-only replay rejection. See the Step 02 report for exact receipt and balances. This proves the experimental token authorization path; final checkout deployment, full backend/SDK/UI integration, production wallet UX, hosted services and package publication remain unaccepted or incomplete. Replay rejection used eth_call and spent no extra gas; no deliberately reverted replay transaction was mined.

The payer received 10 official test USDT and paid 5.005, retaining 4.995 and exactly zero WBT. This remainder cannot fund another default 5.005-USDT proof. The token retains proxy/governance and blocklist risks; recheck compatibility before later activity. Embedded-wallet UX remains untested. Earlier trading-wallet approvals have not been revoked.

Docker CLI is installed locally but its daemon was unavailable during Step 00. Integration tests will require an isolated running database.

Testnet tokens have no claimed monetary value. Refunds, recurring billing, bridging, World ID, and mainnet are excluded.

The live receiver is experimental EOA-only code. Direct token donations lack a recovery function. AI review replaced unavailable teammate review at the user's request and is not an independent human audit. Canonical L2 receipt/runtime verification is complete; explorer source publication and Ethereum finality are not claimed. The later final WhitePayCheckout still needs R-01 replay correction and its own review before deployment. Step 02 has been manually accepted; later milestone approvals remain separate.
