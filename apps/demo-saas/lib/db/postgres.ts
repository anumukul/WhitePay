import { Pool, type PoolClient } from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
let pool: Pool | undefined, initialization: Promise<void> | undefined;
const schema = `CREATE TABLE customers(id text PRIMARY KEY,token_hash text NOT NULL UNIQUE,expires_at bigint NOT NULL);
CREATE TABLE orders(id text PRIMARY KEY,customer_id text NOT NULL REFERENCES customers(id),merchant_id text NOT NULL,session_id text UNIQUE,amount_minor integer NOT NULL CHECK(amount_minor=5000000),status text NOT NULL DEFAULT 'open',created_at bigint NOT NULL);
CREATE TABLE webhook_events(event_id text PRIMARY KEY,order_id text NOT NULL REFERENCES orders(id),received_at bigint NOT NULL);
CREATE TABLE entitlements(order_id text PRIMARY KEY REFERENCES orders(id),customer_id text NOT NULL REFERENCES customers(id),payment_id text NOT NULL UNIQUE,credits_granted integer NOT NULL CHECK(credits_granted=100),created_at bigint NOT NULL);
CREATE TABLE credit_ledger(id bigserial PRIMARY KEY,customer_id text NOT NULL REFERENCES customers(id),delta integer NOT NULL,order_id text REFERENCES orders(id),created_at bigint NOT NULL);`;
function getPool() {
  if (!pool) {
    const url = process.env.DEMO_DATABASE_URL;
    if (!url || !/^postgres(ql)?:\/\//.test(url))
      throw Error('DEMO_DATABASE_URL must identify PostgreSQL');
    pool = new Pool({
      connectionString: url,
      max: 5,
      options: '-c search_path=whitepay_saas',
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', () => {});
  }
  return pool;
}
async function ready() {
  if (!initialization)
    initialization = (async () => {
      const c = await getPool().connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(187411)');
        await c.query('CREATE SCHEMA IF NOT EXISTS whitepay_saas');
        await c.query(
          'CREATE TABLE IF NOT EXISTS whitepay_saas.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL)',
        );
        const hash = createHash('sha256').update(schema).digest('hex'),
          old = (
            await c.query(
              'SELECT checksum FROM schema_migrations WHERE version=1',
            )
          ).rows[0];
        if (old && old.checksum !== hash)
          throw Error('SaaS migration checksum mismatch');
        if (!old) {
          await c.query(schema);
          await c.query('INSERT INTO schema_migrations VALUES(1,$1)', [hash]);
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    })().catch((e) => {
      initialization = undefined;
      throw e;
    });
  await initialization;
}
async function query(sql: string, values: unknown[] = []) {
  await ready();
  return getPool().query(sql, values);
}
async function transaction<T>(fn: (c: PoolClient) => Promise<T>) {
  await ready();
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function close() {
  const old = pool;
  pool = undefined;
  initialization = undefined;
  await old?.end();
}
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export async function createCustomer(now = Date.now()) {
  const id = 'customer_' + randomUUID(),
    token = randomBytes(32).toString('hex');
  await query('INSERT INTO customers VALUES($1,$2,$3)', [
    id,
    hash(token),
    now + 86400000,
  ]);
  return { id, token };
}
export async function customerFromToken(
  token: string | undefined,
  now = Date.now(),
): Promise<{ id: string } | null> {
  if (!token) return null;
  return (
    (
      await query(
        'SELECT id FROM customers WHERE token_hash=$1 AND expires_at>$2',
        [hash(token), now],
      )
    ).rows[0] ?? null
  );
}
export async function createOrder(customerId: string, merchantId: string) {
  const id = 'order_' + randomUUID();
  await query("INSERT INTO orders VALUES($1,$2,$3,NULL,5000000,'open',$4)", [
    id,
    customerId,
    merchantId,
    Date.now(),
  ]);
  return (await orderForCustomer(id, customerId))!;
}
export async function orderForCustomer(
  id: string,
  customerId: string,
): Promise<
  | {
      id: string;
      customerId: string;
      merchantId: string;
      sessionId: string | null;
      amountMinor: number;
      status: string;
    }
  | undefined
> {
  return (
    await query(
      'SELECT id,customer_id AS "customerId",merchant_id AS "merchantId",session_id AS "sessionId",amount_minor AS "amountMinor",status FROM orders WHERE id=$1 AND customer_id=$2',
      [id, customerId],
    )
  ).rows[0];
}
export async function bindSession(
  orderId: string,
  customerId: string,
  sessionId: string,
) {
  const r = await query(
    "UPDATE orders SET session_id=$1 WHERE id=$2 AND customer_id=$3 AND status='open' AND (session_id IS NULL OR session_id=$1)",
    [sessionId, orderId, customerId],
  );
  if (r.rowCount !== 1) throw Error('order_session_mismatch');
}
export async function ownsSession(customerId: string, sessionId: string) {
  return (
    (
      await query(
        'SELECT id FROM orders WHERE customer_id=$1 AND session_id=$2',
        [customerId, sessionId],
      )
    ).rowCount === 1
  );
}
export async function creditBalance(customerId: string) {
  return Number(
    (
      await query(
        'SELECT COALESCE(SUM(delta),0) AS balance FROM credit_ledger WHERE customer_id=$1',
        [customerId],
      )
    ).rows[0].balance,
  );
}
export async function getEntitlement(orderId: string, customerId: string) {
  return (
    await query(
      'SELECT order_id AS "orderId",payment_id AS "paymentId",credits_granted AS "creditsGranted" FROM entitlements WHERE order_id=$1 AND customer_id=$2',
      [orderId, customerId],
    )
  ).rows[0];
}
export async function spendOneCredit(customerId: string) {
  return transaction(async (c) => {
    await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [
      customerId,
    ]);
    const balance = Number(
      (
        await c.query(
          'SELECT COALESCE(SUM(delta),0) AS balance FROM credit_ledger WHERE customer_id=$1',
          [customerId],
        )
      ).rows[0].balance,
    );
    if (balance <= 0) return { ok: false, balance };
    await c.query(
      'INSERT INTO credit_ledger(customer_id,delta,created_at) VALUES($1,-1,$2)',
      [customerId, Date.now()],
    );
    return { ok: true, balance: balance - 1 };
  });
}
// Called only after the SDK has verified the HTTP webhook signature.
export async function fulfill(
  event: { id: string; data: any },
  wp: { payments: { retrieve: (id: string) => Promise<any> } },
) {
  const d = event.data,
    order = (
      await query('SELECT * FROM orders WHERE session_id=$1', [d.sessionId])
    ).rows[0];
  if (
    !order ||
    order.merchant_id !== d.merchantId ||
    d.amountMinor !== '5000000' ||
    d.fee !== '5000'
  )
    throw Error('payment_order_mismatch');
  const payment = await wp.payments.retrieve(d.paymentId);
  if (
    payment.status !== 'succeeded' ||
    payment.sessionId !== order.session_id ||
    payment.amountMinor !== order.amount_minor ||
    payment.txHash !== d.txHash ||
    payment.blockNumber !== d.blockNumber
  )
    throw Error('unconfirmed_payment');
  return transaction(async (c) => {
    await c.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [order.id]);
    const inserted = await c.query(
      'INSERT INTO webhook_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',
      [event.id, order.id, Date.now()],
    );
    if (!inserted.rowCount) return { duplicate: true, granted: false };
    if (
      (
        await c.query('SELECT order_id FROM entitlements WHERE order_id=$1', [
          order.id,
        ])
      ).rowCount
    )
      return { duplicate: true, granted: false };
    await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [
      order.customer_id,
    ]);
    await c.query('INSERT INTO entitlements VALUES($1,$2,$3,100,$4)', [
      order.id,
      order.customer_id,
      payment.id,
      Date.now(),
    ]);
    await c.query(
      'INSERT INTO credit_ledger(customer_id,delta,order_id,created_at) VALUES($1,100,$2,$3)',
      [order.customer_id, order.id, Date.now()],
    );
    await c.query("UPDATE orders SET status='paid' WHERE id=$1", [order.id]);
    return { duplicate: false, granted: true };
  });
}
