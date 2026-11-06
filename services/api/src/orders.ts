import { hashTypedData, keccak256, toHex, recoverTypedDataAddress } from 'viem';
import { randomBytes } from 'node:crypto';
import { getDb, transaction } from './db.js';
import { HttpError } from './sessions.js';
import { address, signatureSchema, USDT } from './validation.js';

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
  name: 'WhitePayCheckout';
  version: '1';
  chainId: number;
  verifyingContract: Hex;
}

export interface OrderTypedData {
  domain: OrderDomain;
  types: {
    EIP712Domain: ReadonlyArray<{ name: string; type: string }>;
    Order: ReadonlyArray<{ name: string; type: string }>;
  };
  primaryType: 'Order';
  message: OrderPayload;
}

const ORDER_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Order: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'merchant', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'feeRecipient', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'quoteId', type: 'bytes32' },
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
    toHex(
      `order:${input.merchant.id}:${input.session.id}:${input.payerAddress}`,
    ),
  ) as Hex;
  const quoteId = keccak256(
    toHex(
      `quote:${input.merchant.id}:${input.session.id}:${input.payerAddress}:${input.nowSec}:${randomBytes(16).toString('hex')}`,
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
      name: 'WhitePayCheckout',
      version: '1',
      chainId: input.chainId,
      verifyingContract: input.checkoutContract,
    },
    types: ORDER_TYPES,
    primaryType: 'Order',
    message,
  };

  const digest = hashTypedData({
    domain: typedData.domain,
    types: { Order: ORDER_TYPES.Order },
    primaryType: 'Order',
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

export interface OrderEndpointResult {
  submissionId: string;
  typedData: OrderTypedData;
  tokenTypedData: any;
  orderDigest: Hex;
  status:
    | 'awaiting_signature'
    | 'queued'
    | 'submitted'
    | 'settled'
    | 'failed'
    | 'expired';
}
const RECEIVE = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
];
function settings() {
  const chainId = Number(process.env.WHITECHAIN_CHAIN_ID ?? 1874),
    feeBasisPoints = Number(process.env.WHITEPAY_FEE_BASIS_POINTS ?? 10),
    validitySeconds = Number(
      process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS ?? 900,
    );
  const checkoutContract = process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS,
    feeRecipient = process.env.WHITEPAY_FEE_RECIPIENT;
  if (
    chainId !== 1874 ||
    !Number.isInteger(feeBasisPoints) ||
    feeBasisPoints < 0 ||
    feeBasisPoints > 10000 ||
    !Number.isInteger(validitySeconds) ||
    validitySeconds < 60 ||
    validitySeconds > 3600 ||
    !address.safeParse(checkoutContract).success ||
    !address.safeParse(feeRecipient).success
  )
    throw new HttpError(503, 'invalid_quote_configuration');
  return {
    chainId,
    feeBasisPoints,
    validitySeconds,
    checkoutContract: checkoutContract as Hex,
    feeRecipient: feeRecipient as Hex,
  };
}
function result(row: any): OrderEndpointResult {
  return {
    submissionId: row.id,
    typedData: row.order_typed_data,
    tokenTypedData: row.token_typed_data,
    orderDigest: row.order_digest,
    status: row.status,
  };
}
export async function buildOrderForSession(input: {
  sessionId: string;
  merchantId: string;
  payerAddress: string;
  nowMs?: number;
  renew?: boolean;
}): Promise<OrderEndpointResult> {
  address.parse(input.payerAddress);
  const payer = input.payerAddress.toLowerCase();
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return transaction(async (c) => {
    const row = (
      await c.query(
        'SELECT * FROM checkout_sessions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
        [input.sessionId, input.merchantId],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, 'session_not_found');
    if (row.status !== 'open') throw new HttpError(409, 'session_not_open');
    const old = (
      await c.query(
        'SELECT * FROM submissions WHERE session_id=$1 AND payer_address=$2',
        [row.id, payer],
      )
    ).rows[0];
    if (old) {
      const expired = old.order_payload.validBefore <= now;
      if (!input.renew) {
        if (expired && old.status === 'awaiting_signature')
          throw new HttpError(409, 'quote_expired');
        return result(old);
      }
      const closing = old.order_payload.validBefore <= now + 120;
      if (!closing || !['awaiting_signature', 'expired'].includes(old.status))
        throw new HttpError(409, 'quote_not_renewable');
    }
    const cfg = settings();
    const roles = [
      payer,
      row.payout_address,
      cfg.feeRecipient,
      cfg.checkoutContract,
    ].map((v) => v.toLowerCase());
    if (new Set(roles).size !== 4)
      throw new HttpError(400, 'invalid_payment_roles');
    if (row.token_address.toLowerCase() !== USDT)
      throw new HttpError(400, 'unsupported_token');
    const { typedData, digest } = buildOrderTypedData({
      session: {
        id: row.id,
        priceId: row.price_id,
        externalOrderId: row.external_order_id,
        amountMinor: Number(row.amount_minor),
        tokenAddress: row.token_address,
      },
      merchant: { id: input.merchantId, payoutAddress: row.payout_address },
      payerAddress: payer as Hex,
      ...cfg,
      nowSec: now,
    });
    const tokenTypedData = {
      domain: {
        name: 'Tether USD',
        version: '1',
        chainId: 1874,
        verifyingContract: row.token_address,
      },
      types: {
        EIP712Domain: ORDER_TYPES.EIP712Domain,
        ReceiveWithAuthorization: RECEIVE,
      },
      primaryType: 'ReceiveWithAuthorization',
      message: {
        from: payer,
        to: cfg.checkoutContract,
        value: (
          BigInt(typedData.message.amount) + BigInt(typedData.message.fee)
        ).toString(),
        validAfter: typedData.message.validAfter,
        validBefore: typedData.message.validBefore,
        nonce: digest,
      },
    };
    const id = old?.id ?? `sub_${randomBytes(12).toString('hex')}`;
    const values = [
      id,
      input.merchantId,
      row.id,
      payer,
      JSON.stringify(typedData.message),
      JSON.stringify(typedData),
      JSON.stringify(tokenTypedData),
      digest,
      Date.now(),
    ];
    const out = await c.query(
      `INSERT INTO submissions(id,merchant_id,session_id,payer_address,order_payload,order_typed_data,token_typed_data,order_digest,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'awaiting_signature',$9,$9) ON CONFLICT(session_id,payer_address) DO UPDATE SET order_payload=EXCLUDED.order_payload,order_typed_data=EXCLUDED.order_typed_data,token_typed_data=EXCLUDED.token_typed_data,order_digest=EXCLUDED.order_digest,status='awaiting_signature',order_signature=NULL,token_signature=NULL,updated_at=EXCLUDED.updated_at RETURNING *`,
      values,
    );
    const saved = out.rows[0];
    await c.query(
      'INSERT INTO submission_quotes(order_digest,submission_id,order_payload,order_typed_data,token_typed_data,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_digest) DO NOTHING',
      [
        saved.order_digest,
        saved.id,
        JSON.stringify(saved.order_payload),
        JSON.stringify(saved.order_typed_data),
        JSON.stringify(saved.token_typed_data),
        Date.now(),
      ],
    );
    return result(out.rows[0]);
  });
}
export async function recordSignatures(input: {
  submissionId: string;
  merchantId: string;
  orderSignature: string;
  tokenSignature: string;
}): Promise<{ ok: boolean; reason?: 'not_found' | 'already_signed' }> {
  signatureSchema.parse({
    orderSignature: input.orderSignature,
    tokenSignature: input.tokenSignature,
  });
  return transaction(async (c) => {
    // Match quote creation's lock order so renewals cannot race signature submission.
    const lookup = (
      await c.query(
        'SELECT session_id FROM submissions WHERE id=$1 AND merchant_id=$2',
        [input.submissionId, input.merchantId],
      )
    ).rows[0];
    if (!lookup) return { ok: false, reason: 'not_found' };
    const session = (
      await c.query(
        'SELECT status FROM checkout_sessions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
        [lookup.session_id, input.merchantId],
      )
    ).rows[0];
    if (session.status !== 'open') throw new HttpError(409, 'session_not_open');
    const row = (
      await c.query(
        'SELECT * FROM submissions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
        [input.submissionId, input.merchantId],
      )
    ).rows[0];
    if (row.status !== 'awaiting_signature')
      return { ok: false, reason: 'already_signed' };
    const now = Math.floor(Date.now() / 1000);
    if (
      row.order_payload.validBefore <= now ||
      row.order_payload.validAfter >= now
    )
      throw new HttpError(409, 'quote_expired');
    try {
      for (const [data, signature] of [
        [row.order_typed_data, input.orderSignature],
        [row.token_typed_data, input.tokenSignature],
      ] as const) {
        const signer = await recoverTypedDataAddress({
          ...data,
          signature: signature as Hex,
        });
        if (signer.toLowerCase() !== row.payer_address)
          throw new Error('wrong signer');
      }
    } catch {
      throw new HttpError(400, 'invalid_signature');
    }
    await c.query(
      "UPDATE submissions SET order_signature=$1,token_signature=$2,status='queued',updated_at=$3 WHERE id=$4",
      [input.orderSignature, input.tokenSignature, Date.now(), row.id],
    );
    return { ok: true };
  });
}
export interface SubmissionRow {
  id: string;
  sessionId: string;
  payerAddress: string;
  orderDigest: string;
  status: string;
  txHash: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}
export async function getSubmissionForMerchant(
  id: string,
  merchantId: string,
): Promise<SubmissionRow | null> {
  return (
    (
      await getDb().query(
        'SELECT id,session_id AS "sessionId",payer_address AS "payerAddress",order_digest AS "orderDigest",status,tx_hash AS "txHash",error_reason AS "errorReason",created_at AS "createdAt",updated_at AS "updatedAt" FROM submissions WHERE id=$1 AND merchant_id=$2',
        [id, merchantId],
      )
    ).rows[0] ?? null
  );
}
