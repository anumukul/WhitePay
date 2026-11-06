# Changelog

## 0.1.0-alpha.0

Initial Whitechain Sepolia testnet release. Verified official-USDT payment quote,
price/fee disclosure, two payer authorizations, account/chain/expiry guards,
server-confirmed settlement and receipt display. Includes a same-origin backend
client and EIP1193 wallet-provider interface.

Requires React, a customer-authorized merchant bridge and a separately funded
relayer. Fulfillment must use verified server webhooks, not browser callbacks.
