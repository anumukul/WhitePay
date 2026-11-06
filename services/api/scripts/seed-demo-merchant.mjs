#!/usr/bin/env node
// Seeds one merchant + one price + one open checkout session into the API's SQLite DB.
// Prints the API key and session id so you can test the order/signatures endpoints.
//
// Usage:
//   node --experimental-sqlite --import tsx/esm services/api/scripts/seed-demo-merchant.mjs
//
// Writes to the same DATABASE_URL the running API uses (default data/api.db relative to cwd).
// Safe to run multiple times — creates a new merchant+price+session each run.

import { createMerchant, createPrice } from "../src/merchants.js";
import { mintApiKey } from "../src/auth.js";
import { createSession } from "../src/sessions.js";
import { getDb } from "../src/db.js";

getDb(); // migrate

const merchant = createMerchant({
  name: "Seed Demo",
  payoutAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});
const key = mintApiKey(merchant.id);
const price = createPrice({
  merchantId: merchant.id,
  amountMinor: 5_000_000,
  currency: "USDT",
  tokenAddress: "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7",
});
const session = createSession({
  merchantId: merchant.id,
  priceId: price.id,
  externalOrderId: `demo_${Date.now()}`,
});

console.log(JSON.stringify({
  merchantId: merchant.id,
  apiKey: key.secret,
  priceId: price.id,
  sessionId: session.id,
}, null, 2));
