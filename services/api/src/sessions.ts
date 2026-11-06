import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { getDb, transaction } from './db.js';
import { sessionSchema } from './validation.js';
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}
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
  status: 'open' | 'settled' | 'canceled';
  amountMinor: number;
  currency: string;
  tokenAddress: string;
  successUrl: string | null;
  payoutAddress: string;
}
const select = `SELECT id,redirect_url AS "redirectUrl",external_order_id AS "externalOrderId",price_id AS "priceId",status,amount_minor AS "amountMinor",currency,token_address AS "tokenAddress",success_url AS "successUrl",payout_address AS "payoutAddress" FROM checkout_sessions`;
const convert = (r: any): CheckoutSession => ({
  ...r,
  amountMinor: Number(r.amountMinor),
});
export async function createSession(
  input: CreateSessionInput,
  client?: PoolClient,
): Promise<CheckoutSession> {
  const { merchantId, ...body } = input;
  sessionSchema.parse(body);
  const work = async (c: PoolClient) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify([merchantId, input.externalOrderId]),
    ]);
    const existing = (
      await c.query(select + ' WHERE merchant_id=$1 AND external_order_id=$2', [
        merchantId,
        input.externalOrderId,
      ])
    ).rows[0];
    if (existing) {
      if (
        existing.priceId !== input.priceId ||
        (existing.successUrl ?? null) !== (input.successUrl ?? null)
      )
        throw new HttpError(409, 'external_order_conflict');
      return convert(existing);
    }
    const p = (
      await c.query(
        'SELECT p.*,m.payout_address FROM prices p JOIN merchants m ON m.id=p.merchant_id WHERE p.id=$1 AND p.merchant_id=$2',
        [input.priceId, merchantId],
      )
    ).rows[0];
    if (!p) throw new HttpError(404, 'price_not_found');
    const id = `cs_${randomBytes(14).toString('hex')}`;
    const base = process.env.CHECKOUT_PAGE_BASE_URL ?? 'http://localhost:3000';
    const redirectUrl = `${base.replace(/\/$/, '')}/checkout/${id}`;
    await c.query(
      `INSERT INTO checkout_sessions(id,merchant_id,price_id,external_order_id,status,redirect_url,success_url,amount_minor,currency,token_address,payout_address,created_at) VALUES($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        merchantId,
        input.priceId,
        input.externalOrderId,
        redirectUrl,
        input.successUrl ?? null,
        p.amount_minor,
        p.currency,
        p.token_address,
        p.payout_address,
        Date.now(),
      ],
    );
    return convert((await c.query(select + ' WHERE id=$1', [id])).rows[0]);
  };
  return client ? work(client) : transaction(work);
}
export async function getSession(
  id: string,
  merchantId: string,
): Promise<CheckoutSession | null> {
  const row = (
    await getDb().query(select + ' WHERE id=$1 AND merchant_id=$2', [
      id,
      merchantId,
    ])
  ).rows[0];
  return row ? convert(row) : null;
}
export async function listPaymentsForMerchant(merchantId: string) {
  return (
    await getDb().query(
      'SELECT id,session_id AS "sessionId",status,amount_minor::float8 AS "amountMinor",tx_hash AS "txHash",block_number AS "blockNumber",created_at AS "createdAt" FROM payments WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',
      [merchantId],
    )
  ).rows;
}
export async function getPaymentForMerchant(id: string, merchantId: string) {
  return (
    (
      await getDb().query(
        'SELECT id,session_id AS "sessionId",status,amount_minor::float8 AS "amountMinor",tx_hash AS "txHash",block_number AS "blockNumber",created_at AS "createdAt" FROM payments WHERE id=$1 AND merchant_id=$2',
        [id, merchantId],
      )
    ).rows[0] ?? null
  );
}
