import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { getPrice } from "./merchants.js";

export interface CreateSessionInput {
  merchantId: string;
  priceId: string;
  externalOrderId: string;
  successUrl?: string;
}

export interface CheckoutSession {
  id: string;
  redirectUrl: string;
  externalOrderId: string;
  priceId: string;
  status: "open" | "settled" | "canceled";
  amountMinor: number;
  currency: string;
  tokenAddress: string;
}

export function createSession(input: CreateSessionInput): CheckoutSession {
  const price = getPrice(input.priceId, input.merchantId);
  if (!price) throw new HttpError(404, "price_not_found");

  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id, redirect_url as redirectUrl, external_order_id as externalOrderId, price_id as priceId, status FROM checkout_sessions WHERE merchant_id = ? AND external_order_id = ?",
    )
    .get(input.merchantId, input.externalOrderId) as
    | { id: string; redirectUrl: string; externalOrderId: string; priceId: string; status: string }
    | undefined;
  if (existing) {
    return {
      ...existing,
      status: existing.status as "open",
      amountMinor: price.amountMinor,
      currency: price.currency,
      tokenAddress: price.tokenAddress,
    };
  }

  const id = `cs_${randomBytes(14).toString("hex")}`;
  const base = process.env.CHECKOUT_PAGE_BASE_URL ?? "http://localhost:3000";
  const redirectUrl = `${base}/checkout/${id}`;
  db.prepare(
    `INSERT INTO checkout_sessions (id, merchant_id, price_id, external_order_id, status, redirect_url, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)`,
  ).run(id, input.merchantId, input.priceId, input.externalOrderId, redirectUrl, Date.now());

  return {
    id,
    redirectUrl,
    externalOrderId: input.externalOrderId,
    priceId: input.priceId,
    status: "open",
    amountMinor: price.amountMinor,
    currency: price.currency,
    tokenAddress: price.tokenAddress,
  };
}

export function getSession(id: string, merchantId: string): CheckoutSession | null {
  const row = getDb()
    .prepare(
      `SELECT cs.id, cs.redirect_url as redirectUrl, cs.external_order_id as externalOrderId,
              cs.price_id as priceId, cs.status,
              p.amount_minor as amountMinor, p.currency, p.token_address as tokenAddress
       FROM checkout_sessions cs JOIN prices p ON p.id = cs.price_id
       WHERE cs.id = ? AND cs.merchant_id = ?`,
    )
    .get(id, merchantId) as CheckoutSession | undefined;
  return row ?? null;
}

export function listPaymentsForMerchant(merchantId: string) {
  return getDb()
    .prepare(
      `SELECT id, session_id as sessionId, status, amount_minor as amountMinor, tx_hash as txHash, block_number as blockNumber, created_at as createdAt
       FROM payments WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .all(merchantId);
}

export function getPaymentForMerchant(id: string, merchantId: string) {
  return getDb()
    .prepare(
      `SELECT id, session_id as sessionId, status, amount_minor as amountMinor, tx_hash as txHash, block_number as blockNumber, created_at as createdAt
       FROM payments WHERE id = ? AND merchant_id = ?`,
    )
    .get(id, merchantId);
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "HttpError";
  }
}
