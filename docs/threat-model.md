# Initial threat model

Assets: payer and merchant USDT, relayer WBT, credentials, signatures, payment truth, and entitlements.

Threats: quote tampering; cross-chain signature replay; EIP-3009 front-running; duplicate billing after restart; sponsorship draining; forged settlement; webhook replay and SSRF; cross-merchant access; leaked signing secrets.

These are required future test categories, not controls already implemented. See PR.md sections 5, 6, 9, and 20.
