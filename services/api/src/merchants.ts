import { randomBytes } from 'node:crypto';
import { getDb, transaction } from './db.js';
import { address, text, priceSchema } from './validation.js';
import { HttpError } from './sessions.js';
export interface Merchant {
  id: string;
  name: string;
  payoutAddress: string;
  webhookUrl: string | null;
  webhookSecret: string;
}
export async function createMerchant(input: {
  name: string;
  payoutAddress: string;
  webhookUrl?: string;
}): Promise<Merchant> {
  text.parse(input.name);
  address.parse(input.payoutAddress);
  const m = {
    id: `mer_${randomBytes(10).toString('hex')}`,
    name: input.name,
    payoutAddress: input.payoutAddress,
    webhookUrl: input.webhookUrl ?? null,
    webhookSecret: `whsec_${randomBytes(24).toString('hex')}`,
  };
  await getDb().query('INSERT INTO merchants VALUES($1,$2,$3,$4,$5,$6)', [
    m.id,
    m.name,
    m.payoutAddress,
    m.webhookUrl,
    m.webhookSecret,
    Date.now(),
  ]);
  return m;
}
export async function getMerchant(id: string): Promise<Merchant | null> {
  return (
    (
      await getDb().query(
        'SELECT id,name,payout_address AS "payoutAddress",webhook_url AS "webhookUrl",webhook_secret AS "webhookSecret" FROM merchants WHERE id=$1',
        [id],
      )
    ).rows[0] ?? null
  );
}
export async function createProduct(merchantId: string, name: string) {
  text.parse(name);
  const id = `prod_${randomBytes(10).toString('hex')}`;
  await getDb().query('INSERT INTO products VALUES($1,$2,$3,$4)', [
    id,
    merchantId,
    name,
    Date.now(),
  ]);
  return { id, name };
}
export async function getProduct(id: string, merchantId: string) {
  return (
    (
      await getDb().query(
        'SELECT id,name FROM products WHERE id=$1 AND merchant_id=$2',
        [id, merchantId],
      )
    ).rows[0] ?? null
  );
}
export async function createPrice(input: {
  merchantId: string;
  productId?: string;
  amountMinor: number;
  currency: string;
  tokenAddress: string;
}) {
  const { merchantId, ...fields } = input;
  priceSchema.parse(fields);
  return transaction(async (c) => {
    let version = 1;
    if (input.productId) {
      const found = (
        await c.query(
          'SELECT id FROM products WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
          [input.productId, merchantId],
        )
      ).rows[0];
      if (!found) throw new HttpError(404, 'product_not_found');
      version = Number(
        (
          await c.query(
            'SELECT COALESCE(MAX(version),0)+1 AS version FROM prices WHERE product_id=$1',
            [input.productId],
          )
        ).rows[0].version,
      );
    }
    const id = `price_${randomBytes(10).toString('hex')}`;
    await c.query(
      'INSERT INTO prices(id,merchant_id,product_id,version,amount_minor,currency,token_address,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        merchantId,
        input.productId ?? null,
        version,
        input.amountMinor,
        input.currency,
        input.tokenAddress,
        Date.now(),
      ],
    );
    return { id, version };
  });
}
export async function getPrice(id: string, merchantId: string) {
  const row = (
    await getDb().query(
      'SELECT id,merchant_id AS "merchantId",product_id AS "productId",version,amount_minor AS "amountMinor",currency,token_address AS "tokenAddress" FROM prices WHERE id=$1 AND merchant_id=$2',
      [id, merchantId],
    )
  ).rows[0];
  return row ? { ...row, amountMinor: Number(row.amountMinor) } : null;
}
