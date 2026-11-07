export const evidence = {
  chainId: 1874,
  token: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  checkout: '0x4d1761abb4ed290f23fcda00890039800e2e53f0',
  transaction:
    '0x77784da3835084852e0f3904ba6845011725ffade891175b4b4a96d93948b41c',
  payer: '0x9AfB652bB337eB4D5a09221Af7972D69B500e035',
  merchant: '0xB5bd941E218c88707a2BbABEb3cb0BDbE1543c9C',
  feeRecipient: '0x2F51C76D37BA9118ce8D5b9377329965ddb411c2',
  amountMinor: 1000000,
  feeMinor: 1000,
  totalMinor: 1001000,
  payerWbt: '0',
  block: 12383593,
  settledAt: '6 November 2026, 15:46:01 UTC',
};
export const links = {
  github: 'https://github.com/anumukul/WhitePay',
  docs: 'https://whitepay-docs.vercel.app',
  node: 'https://www.npmjs.com/package/@whitepay/node/v/0.1.0-alpha.0',
  react: 'https://www.npmjs.com/package/@whitepay/react/v/0.1.0-alpha.0',
  contract:
    'https://explorer.testnet.whitechain.io/address/' + evidence.checkout,
  payment: 'https://explorer.testnet.whitechain.io/tx/' + evidence.transaction,
  evidence:
    'https://github.com/anumukul/WhitePay/blob/main/docs/progress/step-09.md',
  saas: 'https://whitepay-saas.onrender.com',
  shop: 'https://github.com/anumukul/WhitePay/blob/main/apps/demo-shop/README.md',
};
export const slides = [
  {
    title: 'USDT checkout without customer WBT',
    label: '01 / The problem',
    body: 'A customer can hold the payment token and still be unable to check out. Native gas, network setup and merchant settlement plumbing add friction to a simple purchase.',
    points: [
      'Customers need a clear amount to authorize',
      'Merchants need a receipt they can verify',
      'Gas funding is a separate operational job',
    ],
    notes:
      'Introduce WhitePay as a Whitechain Sepolia testnet alpha. This identifies the integration problem without unsupported adoption or market-size claims.',
  },
  {
    title: 'The relayer pays gas. The customer authorizes USDT.',
    label: '02 / WhitePay',
    body: 'Two public SDKs connect checkout to a merchant API, a funded relayer and atomic onchain payouts. The price and any sponsorship fee are shown before the customer signs.',
    points: [
      '1 USDT merchant price',
      '0.001 USDT disclosed fee',
      '1.001 USDT total; payer WBT stays zero',
    ],
    notes:
      'The demonstrated fee is a testnet service policy, not a live gas conversion. USDT fee receipts do not replenish WBT automatically. SDKs are public alpha. The API and SaaS are hosted; merchant configuration and hosted worker delivery remain pending.',
  },
  {
    title: 'One purchase, two different responsibilities',
    label: '03 / Buyer and merchant',
    body: 'The customer reviews the exact terms and signs two authorizations. The merchant creates the session on its server and delivers only after verifying settlement evidence.',
    points: [
      'Buyer: review → authorize → confirmed receipt',
      'Merchant: session → signed webhook → one entitlement',
      'A browser success callback never grants the purchase',
    ],
    notes:
      'Existing EVM wallet prompts remain visible. Embedded seedless onboarding has not been established. The credits and shop apps implement separate customer ownership and fulfillment checks.',
  },
  {
    title: 'Authorization, settlement and fulfillment',
    label: '04 / Architecture and trust',
    body: 'The merchant bridge protects customer session ownership. PostgreSQL persists exact quotes and attempts. The checkout enforces signed payouts; the indexer and merchant verify the resulting receipt.',
    points: [
      'Merchant backend → API → funded relayer',
      'Whitechain checkout → official test USDT',
      'Matched event → outbox → verified fulfillment',
    ],
    notes:
      'Sources: docs/architecture.md and docs/progress/step-06.md through step-09.md. The operator can delay execution. Receipt-based L2 fulfillment is not Ethereum finality. Keys remain server-side.',
  },
  {
    title: 'A confirmed payment, with zero payer WBT',
    label: '05 / Real testnet evidence',
    body: 'The real widget payment at block 12383593 settled the official token on chain 1874. Historical checks verified exact payouts, a zero-WBT payer and read-only replay rejection.',
    points: [
      'Merchant +1 USDT; fee recipient +0.001 USDT',
      'Payer −1.001 USDT; WBT 0 → 0',
      'Funded relayer paid the native network fee',
    ],
    notes:
      'Source: docs/progress/step-09.md and https://explorer.testnet.whitechain.io/tx/' +
      evidence.transaction +
      '. Historical evidence, not a new payment or current balance check. Test assets have no monetary value.',
  },
  {
    title: 'Bind the terms. Reconcile uncertain execution.',
    label: '06 / Security and recovery',
    body: 'The order binds payer, merchant, token, amount, fee, domain and expiry. Atomic payouts and payer-scoped replay protection cover settlement; durable attempts and idempotent fulfillment cover retries.',
    points: [
      'Tampering, rollback and replay tests',
      'Simulation, fee limits and a safety cutoff',
      'Verify the raw webhook; deduplicate in one transaction',
    ],
    notes:
      'No third-party audit. Release findings remain around compose DB binding, readiness validation, process health and demo CI coverage. Public deployment must address these findings; do not claim production readiness.',
  },
  {
    title: 'The same SDKs, two independent merchants',
    label: '07 / Reusability',
    body: 'The SaaS grants credits; the digital shop unlocks downloads. Each owns its credentials, customer records and fulfillment. The small React component needs an authenticated merchant server bridge.',
    points: [
      'Public @whitepay/node and @whitepay/react alpha packages',
      'Frontend under 20 lines; server work is additional',
      'Two independent app tests use controlled receipts',
    ],
    notes:
      'Sources: apps/demo-saas/README.md, apps/demo-shop/README.md and docs/progress/step-14.md. Controlled receipts are not two live merchant settlements. Both package integrity and clean registry installs were verified.',
  },
  {
    title: 'A working proof, with explicit next gates',
    label: '08 / Whitechain and the roadmap',
    body: 'Whitechain supplies the official token and inspectable settlement. Operate alignment is the reusable integration. Source verification remains open; hosted worker delivery is pending. Video and final qualification are still to come.',
    points: [
      'Published SDKs, docs and a real official-USDT receipt',
      'Complete hosted fulfillment, source verification and adversarial checks',
      'No mainnet, refunds or recurring subscriptions in this MVP',
    ],
    notes:
      'Sponsor eligibility is not claimed. Step 04 source verification and hosted end-to-end fulfillment remain open. Video and an independent docs-only checkout walkthrough still require their own gates.',
  },
];
