# Whitechain feedback

## Observed in Step 01 — 2026-11-05

Positive: the public RPC returned chain 1874 and supported fixed-block read-only token/signature calls. The explorer implementation API supplied ABI, fully verified source, and runtime bytecode that matched RPC. Official test USDT exposes both permit and EIP-3009, including recipient-only receive authorization; all 25 investigation checks passed.

Documentation discovery: the canonical testnet Markdown page states network parameters and RPC limits clearly. The docs index was accessible directly. Browser-fetch tooling could not retrieve the pages, while CLI requests succeeded; this is a tooling observation, not evidence of a Whitechain outage.

Friction: the official USDT address is a proxy; its proxy endpoint had no verified-source ABI, so the investigation needed an EIP-1967 storage lookup and a separate verified implementation request. Documentation showing this token's exact signing domain, overloads, and proxy workflow would shorten onboarding.

Unresolved: no dedicated official test-USDT acquisition instructions were identified in the documentation index. Need an official source or DevRel guidance before a funded proof. WBT faucet availability does not establish USDT availability. No funded transfer or wallet-provider UX tested yet.

[Reproducible evidence](docs/evidence/token-compatibility.md). Feedback will be updated from observed execution, without assuming the rest of the product works.
