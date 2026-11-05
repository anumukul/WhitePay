import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";

export interface Merchant {
  id: string;
  name: string;
  payoutAddress: string;
  webhookUrl: string | null;
  webhookSecret: string;
}

export function createMerchant(input: {
  name: string;
  payoutAddress: string;
  webhookUrl?: string;
}): Merchant {
  const id = `mer_${randomBytes(10).toString("hex")}`;
  const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
  getDb()
    .prepare(
      `INSERT INTO merchants (id, name, payout_address, webhook_url, webhook_secret, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.payoutAddress, input.webhookUrl ?? null, webhookSecret, Date.now());
  return {
    id,
    name: input.name,
    payoutAddress: input.payoutAddress,
    webhookUrl: input.webhookUrl ?? null,
    webhookSecret,
  };
}

export function getMerchant(id: string): Merchant | null {
  const row = getDb()
    .prepare(
      "SELECT id, name, payout_address as payoutAddress, webhook_url as webhookUrl, webhook_secret as webhookSecret FROM merchants WHERE id = ?",
    )
    .get(id) as Merchant | undefined;
  return row ?? null;
}

export function createPrice(input: {
  merchantId: string;
  amountMinor: number;
  currency: string;
  tokenAddress: string;
}): { id: string } {
  const id = `price_${randomBytes(10).toString("hex")}`;
  getDb()
    .prepare(
      `INSERT INTO prices (id, merchant_id, amount_minor, currency, token_address, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.merchantId, input.amountMinor, input.currency, input.tokenAddress, Date.now());
  return { id };
}

export function getPrice(id: string, merchantId: string) {
  const row = getDb()
    .prepare(
      "SELECT id, merchant_id as merchantId, amount_minor as amountMinor, currency, token_address as tokenAddress FROM prices WHERE id = ? AND merchant_id = ?",
    )
    .get(id, merchantId) as
    | { id: string; merchantId: string; amountMinor: number; currency: string; tokenAddress: string }
    | undefined;
  return row ?? null;
}
