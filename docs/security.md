# Security baseline

No mainnet or real funds. Never commit secrets or sign arbitrary calldata. Deployments, broadcasts, hosted migrations, publication, and other external writes require explicit authorization.

The planned system must bind merchant, payer, chain, contract, token, exact amount, fee, expiry, and unique order to authorization. Relayer budgets, durable nonce management, and replay protection are required. Fulfillment must follow verified receipts and authenticated, idempotent webhooks.

Security-critical changes require the second teammate's review. No security audit has been performed.
