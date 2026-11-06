import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { resetDbForTests, closeDb, getDb } from '../src/db.js';
import { createMerchant, createPrice } from '../src/merchants.js';
import { buildOrderForSession } from '../src/orders.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mintApiKey } from '../src/auth.js';
const token = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
let dir: string,
  server: ReturnType<typeof createApp>,
  base: string,
  keyA: string,
  keyB: string,
  priceA: string,
  priceB: string;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'step05-'));
  await resetDbForTests(join(dir, 'api.db'));
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS =
    '0x4d1761ABB4eD290F23fcDA00890039800E2e53f0';
  process.env.WHITEPAY_FEE_RECIPIENT =
    '0x2F51C76D37BA9118ce8D5b9377329965ddb411c2';
  const a = await createMerchant({
      name: 'A',
      payoutAddress: '0x' + 'a'.repeat(40),
    }),
    b = await createMerchant({
      name: 'B',
      payoutAddress: '0x' + 'b'.repeat(40),
    });
  keyA = (await mintApiKey(a.id)).secret;
  keyB = (await mintApiKey(b.id)).secret;
  priceA = (
    await createPrice({
      merchantId: a.id,
      amountMinor: 1000000,
      currency: 'USDT',
      tokenAddress: token,
    })
  ).id;
  priceB = (
    await createPrice({
      merchantId: a.id,
      amountMinor: 2000000,
      currency: 'USDT',
      tokenAddress: token,
    })
  ).id;
  server = createApp();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (server?.listening)
    await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});
const req = (path: string, body?: unknown, key = keyA, headers = {}) =>
  fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const session = async (id: string) => {
  const r = await req('/v1/checkout/sessions', {
    priceId: priceA,
    externalOrderId: id,
  });
  assert.equal(r.status, 200);
  return (await r.json()) as any;
};
test('rejects arbitrary client amounts and forged merchant fields', async () => {
  for (const field of [
    { amountMinor: 1 },
    { merchantId: 'forged' },
    { fee: 0 },
  ])
    assert.equal(
      (
        await req('/v1/checkout/sessions', {
          priceId: priceA,
          externalOrderId: 'front' + JSON.stringify(field),
          ...field,
        })
      ).status,
      400,
    );
});
test('duplicate external order with changed price conflicts', async () => {
  await session('dup');
  assert.equal(
    (
      await req('/v1/checkout/sessions', {
        priceId: priceB,
        externalOrderId: 'dup',
      })
    ).status,
    409,
  );
});
test('idempotency key cannot alias a different request', async () => {
  const headers = { 'idempotency-key': 'bound' };
  assert.equal(
    (
      await req(
        '/v1/checkout/sessions',
        { priceId: priceA, externalOrderId: 'idem-a' },
        keyA,
        headers,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        '/v1/checkout/sessions',
        { priceId: priceA, externalOrderId: 'idem-b' },
        keyA,
        headers,
      )
    ).status,
    409,
  );
});
test('cross merchant cannot read session or build quote', async () => {
  const s = await session('cross');
  assert.equal(
    (await req('/v1/checkout/sessions/' + s.id, undefined, keyB)).status,
    404,
  );
  assert.equal(
    (
      await req(
        '/v1/checkout/sessions/' + s.id + '/order',
        { payerAddress: '0x' + 'c'.repeat(40) },
        keyB,
      )
    ).status,
    404,
  );
});
test('persisted quote retains original domain after configuration changes', async () => {
  const s = await session('domain');
  const path = '/v1/checkout/sessions/' + s.id + '/order';
  const body = { payerAddress: '0x' + 'c'.repeat(40) };
  const a = (await (await req(path, body)).json()) as any;
  const old = process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS;
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = '0x' + 'd'.repeat(40);
  try {
    const b = await (await req(path, body)).json();
    assert.deepEqual(a, b);
  } finally {
    process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = old;
  }
});
test('quote endpoint refuses zero payer', async () => {
  const s = await session('zero');
  assert.equal(
    (
      await req('/v1/checkout/sessions/' + s.id + '/order', {
        payerAddress: '0x' + '0'.repeat(40),
      })
    ).status,
    400,
  );
});
test('fabricated signatures never queue an order', async () => {
  const s = await session('fake');
  const q = (await (
    await req('/v1/checkout/sessions/' + s.id + '/order', {
      payerAddress: '0x' + 'c'.repeat(40),
    })
  ).json()) as any;
  assert.equal(
    (
      await req('/v1/submissions/' + q.submissionId + '/signatures', {
        orderSignature: '0x' + 'ab'.repeat(65),
        tokenSignature: '0x' + 'cd'.repeat(65),
      })
    ).status,
    400,
  );
});
test('product and immutable versioned price routes exist and isolate merchants', async () => {
  const r = await req('/v1/products', { name: 'Credits' });
  assert.equal(r.status, 201);
  const product = (await r.json()) as any;
  const p = await req('/v1/prices', {
    productId: product.id,
    amountMinor: 1000000,
    currency: 'USDT',
    tokenAddress: token,
  });
  assert.equal(p.status, 201);
  assert.equal(
    (await req('/v1/products/' + product.id, undefined, keyB)).status,
    404,
  );
  const f = await req(
    '/v1/prices',
    {
      productId: product.id,
      amountMinor: 1,
      currency: 'USDT',
      tokenAddress: token,
    },
    keyB,
  );
  assert.equal(f.status, 404);
});

test('expired and revoked merchant API keys are unauthorized', async () => {
  const db = getDb();
  for (const update of ['expires_at=0', 'revoked_at=1']) {
    const m = await createMerchant({
      name: 'expiry',
      payoutAddress: '0x' + 'e'.repeat(40),
    });
    const k = await mintApiKey(m.id);
    await db.query(`UPDATE api_keys SET ${update} WHERE id=$1`, [k.id]);
    assert.equal((await req('/v1/payments', undefined, k.secret)).status, 401);
  }
});
test('concurrent duplicate external orders and idempotency requests create one session', async () => {
  const body = { priceId: priceA, externalOrderId: 'concurrent' };
  const rows = await Promise.all(
    Array.from({ length: 8 }, () =>
      req('/v1/checkout/sessions', body, keyA, {
        'idempotency-key': 'concurrent',
      }),
    ),
  );
  for (const r of rows) assert.equal(r.status, 200);
  const sessions = (await Promise.all(rows.map((r) => r.json()))) as any[];
  assert.equal(new Set(sessions.map((s) => s.id)).size, 1);
});
test('versioned prices cannot change an existing session and database updates fail', async () => {
  const product = (await (
    await req('/v1/products', { name: 'Versions' })
  ).json()) as any;
  const make = (amountMinor: number) =>
    req('/v1/prices', {
      productId: product.id,
      amountMinor,
      currency: 'USDT',
      tokenAddress: token,
    });
  const v1 = (await (await make(1000000)).json()) as any;
  const created = (await (
    await req('/v1/checkout/sessions', {
      priceId: v1.id,
      externalOrderId: 'versions',
    })
  ).json()) as any;
  const v2 = (await (await make(2000000)).json()) as any;
  assert.equal(v2.version, 2);
  assert.notEqual(v1.id, v2.id);
  assert.equal(
    ((await (await req('/v1/checkout/sessions/' + created.id)).json()) as any)
      .amountMinor,
    1000000,
  );
  await assert.rejects(
    () =>
      getDb().query('UPDATE prices SET amount_minor=1 WHERE id=$1', [v1.id]),
    /immutable/,
  );
});
test('invalid amounts and alternate tokens are rejected', async () => {
  const prod = (await (
    await req('/v1/products', { name: 'Validation' })
  ).json()) as any;
  for (const change of [
    { amountMinor: 0 },
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { amountMinor: '1000000' },
    { tokenAddress: '0x' + '1'.repeat(40) },
  ])
    assert.equal(
      (
        await req('/v1/prices', {
          productId: prod.id,
          amountMinor: 1000000,
          currency: 'USDT',
          tokenAddress: token,
          ...change,
        })
      ).status,
      400,
    );
});
test('expired unsigned quote requires explicit renewal and old signatures fail', async () => {
  const s = await session('renewal');
  const owner = (
    await getDb().query(
      'SELECT merchant_id FROM checkout_sessions WHERE id=$1',
      [s.id],
    )
  ).rows[0].merchant_id;
  const account = privateKeyToAccount(generatePrivateKey());
  const expired = await buildOrderForSession({
    sessionId: s.id,
    merchantId: owner,
    payerAddress: account.address,
    nowMs: Date.now() - 7200000,
  });
  const oldSigs = {
    orderSignature: await account.signTypedData(expired.typedData as any),
    tokenSignature: await account.signTypedData(expired.tokenTypedData),
  };
  assert.equal(
    (
      await req(
        '/v1/submissions/' + expired.submissionId + '/signatures',
        oldSigs,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await req('/v1/checkout/sessions/' + s.id + '/order', {
        payerAddress: account.address,
      })
    ).status,
    409,
  );
  const renewed = (await (
    await req('/v1/checkout/sessions/' + s.id + '/renew', {
      payerAddress: account.address,
    })
  ).json()) as any;
  assert.notEqual(renewed.orderDigest, expired.orderDigest);
  assert.equal(
    renewed.typedData.message.orderId,
    expired.typedData.message.orderId,
  );
  assert.equal(
    (
      await req(
        '/v1/submissions/' + expired.submissionId + '/signatures',
        oldSigs,
      )
    ).status,
    400,
  );
  const sigs = {
    orderSignature: await account.signTypedData(renewed.typedData),
    tokenSignature: await account.signTypedData(renewed.tokenTypedData),
  };
  assert.equal(
    (await req('/v1/submissions/' + renewed.submissionId + '/signatures', sigs))
      .status,
    204,
  );
  assert.equal(
    (
      await req('/v1/checkout/sessions/' + s.id + '/renew', {
        payerAddress: account.address,
      })
    ).status,
    409,
  );
  const publicRow = (await (
    await req('/v1/submissions/' + renewed.submissionId)
  ).json()) as any;
  assert.equal(publicRow.orderSignature, undefined);
  assert.equal(publicRow.tokenSignature, undefined);
});
test('closed session cannot issue new authorizations', async () => {
  const s = await session('closed');
  await getDb().query(
    "UPDATE checkout_sessions SET status='settled' WHERE id=$1",
    [s.id],
  );
  assert.equal(
    (
      await req('/v1/checkout/sessions/' + s.id + '/order', {
        payerAddress: '0x' + 'c'.repeat(40),
      })
    ).status,
    409,
  );
});

test('session creation rolls back if idempotency persistence fails', async () => {
  const { transaction } = await import('../src/db.js');
  const { createSession } = await import('../src/sessions.js');
  const merchantId = (
    await getDb().query('SELECT merchant_id FROM prices WHERE id=$1', [priceA])
  ).rows[0].merchant_id;
  await assert.rejects(
    () =>
      transaction(async (c) => {
        await createSession(
          { merchantId, priceId: priceA, externalOrderId: 'rollback-session' },
          c,
        );
        throw new Error('response write failed');
      }),
    /response write failed/,
  );
  assert.equal(
    (
      await getDb().query(
        "SELECT id FROM checkout_sessions WHERE external_order_id='rollback-session'",
      )
    ).rows.length,
    0,
  );
});
test('cross-merchant submission and payment reads are hidden', async () => {
  const s = await session('hidden');
  const q = (await (
    await req('/v1/checkout/sessions/' + s.id + '/order', {
      payerAddress: '0x' + 'c'.repeat(40),
    })
  ).json()) as any;
  assert.equal(
    (await req('/v1/submissions/' + q.submissionId, undefined, keyB)).status,
    404,
  );
  const owner = (
    await getDb().query(
      'SELECT merchant_id FROM checkout_sessions WHERE id=$1',
      [s.id],
    )
  ).rows[0].merchant_id;
  await getDb().query(
    "INSERT INTO payments VALUES('pay_hidden',$1,$2,'settled',1000000,NULL,NULL,0)",
    [owner, s.id],
  );
  assert.equal(
    (await req('/v1/payments/pay_hidden', undefined, keyB)).status,
    404,
  );
  assert.equal((await req('/v1/payments/pay_hidden')).status, 200);
});

test('explicit unsigned renewal becomes available at the two-minute cutoff without extending the old quote', async () => {
  const s = await session('cutoff-renewal');
  const owner = (
    await getDb().query(
      'SELECT merchant_id FROM checkout_sessions WHERE id=$1',
      [s.id],
    )
  ).rows[0].merchant_id;
  const payer = privateKeyToAccount(generatePrivateKey()).address;
  const first = await buildOrderForSession({
    sessionId: s.id,
    merchantId: owner,
    payerAddress: payer,
  });
  const validBefore = first.typedData.message.validBefore;
  await assert.rejects(
    () =>
      buildOrderForSession({
        sessionId: s.id,
        merchantId: owner,
        payerAddress: payer,
        renew: true,
        nowMs: (validBefore - 121) * 1000,
      }),
    /quote_not_renewable/,
  );
  const renewed = await buildOrderForSession({
    sessionId: s.id,
    merchantId: owner,
    payerAddress: payer,
    renew: true,
    nowMs: (validBefore - 120) * 1000,
  });
  assert.notEqual(renewed.orderDigest, first.orderDigest);
  assert.equal(first.typedData.message.validBefore, validBefore);
  assert.equal(
    (
      await getDb().query(
        'SELECT count(*) FROM submission_quotes WHERE submission_id=$1',
        [first.submissionId],
      )
    ).rows[0].count,
    '2',
  );
});
