import { hashTypedData, keccak256, toHex } from "viem";
import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { getSession, HttpError } from "./sessions.js";
import { getMerchant } from "./merchants.js";

export type Hex = `0x${string}`;

export interface OrderPayload {
  orderId: Hex;
  payer: Hex;
  merchant: Hex;
  amount: string;
  fee: string;
  feeRecipient: Hex;
  token: Hex;
  validAfter: number;
  validBefore: number;
  quoteId: Hex;
}

export interface OrderDomain {
  name: "WhitePayCheckout";
  version: "1";
  chainId: number;
  verifyingContract: Hex;
}

export interface OrderTypedData {
  domain: OrderDomain;
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    Order: Array<{ name: string; type: string }>;
  };
  primaryType: "Order";
  message: OrderPayload;
}

const ORDER_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Order: [
    { name: "orderId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "feeRecipient", type: "address" },
    { name: "token", type: "address" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "quoteId", type: "bytes32" },
  ],
} as const;

export interface BuildOrderInput {
  session: {
    id: string;
    priceId: string;
    externalOrderId: string;
    amountMinor: number;
    tokenAddress: string;
  };
  merchant: { id: string; payoutAddress: string };
  payerAddress: Hex;
  feeBasisPoints: number;
  validitySeconds: number;
  checkoutContract: Hex;
  chainId: number;
  feeRecipient: Hex;
  nowSec: number;
}

export function buildOrderTypedData(input: BuildOrderInput): {
  typedData: OrderTypedData;
  digest: Hex;
} {
  const amount = BigInt(input.session.amountMinor);
  const fee = (amount * BigInt(input.feeBasisPoints)) / 10_000n;
  const validAfter = input.nowSec - 60;
  const validBefore = input.nowSec + input.validitySeconds;

  // orderId and quoteId bind the session + merchant + payer so the digest is unique per attempt.
  const orderId = keccak256(
    toHex(`order:${input.merchant.id}:${input.session.id}:${input.payerAddress}`),
  ) as Hex;
  const quoteId = keccak256(
    toHex(
      `quote:${input.merchant.id}:${input.session.id}:${input.payerAddress}:${input.nowSec}`,
    ),
  ) as Hex;

  const message: OrderPayload = {
    orderId,
    payer: input.payerAddress,
    merchant: input.merchant.payoutAddress as Hex,
    amount: amount.toString(),
    fee: fee.toString(),
    feeRecipient: input.feeRecipient,
    token: input.session.tokenAddress as Hex,
    validAfter,
    validBefore,
    quoteId,
  };

  const typedData: OrderTypedData = {
    domain: {
      name: "WhitePayCheckout",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.checkoutContract,
    },
    types: ORDER_TYPES,
    primaryType: "Order",
    message,
  };

  const digest = hashTypedData({
    domain: typedData.domain,
    types: { Order: ORDER_TYPES.Order },
    primaryType: "Order",
    message: {
      ...message,
      amount,
      fee: BigInt(fee),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
    },
  }) as Hex;

  return { typedData, digest };
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}
function envAddr(name: string, def: Hex): Hex {
  const v = process.env[name];
  return (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : def) as Hex;
}

export interface OrderEndpointResult {
  submissionId: string;
  typedData: OrderTypedData;
  orderDigest: Hex;
  status: "awaiting_signature" | "queued" | "submitted" | "settled" | "failed";
}

export function buildOrderForSession(input: {
  sessionId: string;
  merchantId: string;
  payerAddress: string;
  nowMs?: number;
}): OrderEndpointResult {
  const session = getSession(input.sessionId, input.merchantId);
  if (!session) throw new HttpError(404, "session_not_found");
  const merchant = getMerchant(input.merchantId);
  if (!merchant) throw new HttpError(404, "merchant_not_found");

  const payerAddress = input.payerAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(payerAddress)) throw new HttpError(400, "invalid_payer_address");

  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id, order_payload as orderPayload, order_digest as orderDigest, status FROM submissions WHERE session_id = ? AND payer_address = ?",
    )
    .get(input.sessionId, payerAddress) as
    | { id: string; orderPayload: string; orderDigest: string; status: string }
    | undefined;

  if (existing) {
    const message = JSON.parse(existing.orderPayload) as OrderPayload;
    const typedData: OrderTypedData = {
      domain: {
        name: "WhitePayCheckout",
        version: "1",
        chainId: envInt("WHITECHAIN_CHAIN_ID", 1874),
        verifyingContract: envAddr(
          "WHITEPAY_CHECKOUT_CONTRACT_ADDRESS",
          "0x0000000000000000000000000000000000000000",
        ),
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message,
    };
    return {
      submissionId: existing.id,
      typedData,
      orderDigest: existing.orderDigest as Hex,
      status: existing.status as OrderEndpointResult["status"],
    };
  }

  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const { typedData, digest } = buildOrderTypedData({
    session: {
      id: session.id,
      priceId: session.priceId,
      externalOrderId: session.externalOrderId,
      amountMinor: session.amountMinor,
      tokenAddress: session.tokenAddress,
    },
    merchant: { id: merchant.id, payoutAddress: merchant.payoutAddress },
    payerAddress: payerAddress as Hex,
    feeBasisPoints: envInt("WHITEPAY_FEE_BASIS_POINTS", 10),
    validitySeconds: envInt("WHITEPAY_QUOTE_VALIDITY_SECONDS", 900),
    checkoutContract: envAddr(
      "WHITEPAY_CHECKOUT_CONTRACT_ADDRESS",
      "0x0000000000000000000000000000000000000000",
    ),
    chainId: envInt("WHITECHAIN_CHAIN_ID", 1874),
    feeRecipient: envAddr("WHITEPAY_FEE_RECIPIENT", merchant.payoutAddress as Hex),
    nowSec: now,
  });

  const submissionId = `sub_${randomBytes(12).toString("hex")}`;
  db.prepare(
    `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'awaiting_signature', ?, ?)`,
  ).run(
    submissionId,
    input.merchantId,
    session.id,
    payerAddress,
    JSON.stringify(typedData.message),
    digest.toLowerCase(),
    Date.now(),
    Date.now(),
  );

  return { submissionId, typedData, orderDigest: digest, status: "awaiting_signature" };
}

export function recordSignatures(input: {
  submissionId: string;
  merchantId: string;
  orderSignature: string;
  tokenSignature: string;
}): { ok: boolean; reason?: "not_found" | "already_signed" } {
  if (!/^0x[0-9a-fA-F]+$/.test(input.orderSignature) || !/^0x[0-9a-fA-F]+$/.test(input.tokenSignature)) {
    throw new HttpError(400, "invalid_signature_format");
  }
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM submissions WHERE id = ? AND merchant_id = ?")
    .get(input.submissionId, input.merchantId) as { status: string } | undefined;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "awaiting_signature") return { ok: false, reason: "already_signed" };

  db.prepare(
    "UPDATE submissions SET order_signature = ?, token_signature = ?, status = 'queued', updated_at = ? WHERE id = ?",
  ).run(input.orderSignature, input.tokenSignature, Date.now(), input.submissionId);
  return { ok: true };
}

export interface SubmissionRow {
  id: string;
  sessionId: string;
  payerAddress: string;
  orderDigest: string;
  status: string;
  orderSignature: string | null;
  tokenSignature: string | null;
  txHash: string | null;
  createdAt: number;
  updatedAt: number;
}

export function getSubmissionForMerchant(id: string, merchantId: string): SubmissionRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, session_id as sessionId, payer_address as payerAddress, order_digest as orderDigest,
              status, order_signature as orderSignature, token_signature as tokenSignature,
              tx_hash as txHash, created_at as createdAt, updated_at as updatedAt
       FROM submissions WHERE id = ? AND merchant_id = ?`,
    )
    .get(id, merchantId) as SubmissionRow | undefined;
  return row ?? null;
}
