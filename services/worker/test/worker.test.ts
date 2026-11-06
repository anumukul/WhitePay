import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '@whitepay/api/src/db.js';
import { workerFixture, getDb } from './fixtures.js';
import { scanAndPersist } from '../src/loop.js';
import { dispatchOnce, signPayload, verifySignature } from '../src/webhooks.js';
import { validateDestination, isPublicAddress } from '../src/destination.js';
after(async () => {
  await closeDb();
});
async function ready() {
  const f = await workerFixture();
  await scanAndPersist(f.cfg, f.reader);
  return f;
}
test('fresh HMAC verifies; stale timestamp, malformed hex and tampered payload fail', () => {
  const timestamp = Math.floor(Date.now() / 1000).toString(),
    secret = 'test-only',
    payload = '{}',
    signature = signPayload(secret, timestamp, payload);
  assert.ok(verifySignature({ timestamp, secret, payload, signature }));
  assert.equal(
    verifySignature({ timestamp, secret, payload: 'changed', signature }),
    false,
  );
  assert.equal(
    verifySignature({
      timestamp: '1',
      secret,
      payload,
      signature: signPayload(secret, '1', payload),
    }),
    false,
  );
  assert.equal(
    verifySignature({ timestamp, secret, payload, signature: 'zz' }),
    false,
  );
});
test('failed delivery schedules delayed retry and uses a fresh signature on retry', async () => {
  const f = await ready();
  const now = Date.now();
  let calls = 0;
  const timestamps: string[] = [];
  const fetchImpl = async (_u: string, init: any) => {
    calls++;
    timestamps.push(init.headers['x-whitepay-timestamp']);
    return { ok: calls > 1, status: calls > 1 ? 200 : 500 };
  };
  await dispatchOnce({
    allowedOrigins: ['https://merchant.example'],
    nowMs: now,
    fetchImpl,
  });
  assert.equal(
    (
      await dispatchOnce({
        allowedOrigins: ['https://merchant.example'],
        nowMs: now,
        fetchImpl,
      })
    ).processed,
    0,
  );
  await dispatchOnce({
    allowedOrigins: ['https://merchant.example'],
    nowMs: now + 2000,
    fetchImpl,
  });
  assert.equal(calls, 2);
  assert.notEqual(timestamps[0], timestamps[1]);
  assert.equal(
    (await getDb().query('SELECT state FROM webhook_outbox')).rows[0].state,
    'delivered',
  );
});
test('concurrent delivery workers claim one event', async () => {
  await ready();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, status: 200 };
  };
  await Promise.all([
    dispatchOnce({ allowedOrigins: ['https://merchant.example'], fetchImpl }),
    dispatchOnce({ allowedOrigins: ['https://merchant.example'], fetchImpl }),
  ]);
  assert.equal(calls, 1);
});
test('crash after merchant accepts retries the same event id after lease expiry', async () => {
  await ready();
  const now = Date.now();
  await getDb().query(
    "CREATE FUNCTION crash_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='delivered' THEN RAISE EXCEPTION 'injected delivery crash'; END IF; RETURN NEW; END $$;CREATE TRIGGER crash_delivery BEFORE UPDATE ON webhook_outbox FOR EACH ROW EXECUTE FUNCTION crash_delivery()",
  );
  const ids: string[] = [];
  const fetchImpl = async (_u: string, init: any) => {
    ids.push(init.headers['x-whitepay-event-id']);
    return { ok: true, status: 200 };
  };
  await assert.rejects(
    () =>
      dispatchOnce({
        allowedOrigins: ['https://merchant.example'],
        fetchImpl,
        nowMs: now,
        leaseMs: 1000,
      }),
    /injected delivery crash/,
  );
  await getDb().query('DROP TRIGGER crash_delivery ON webhook_outbox');
  await dispatchOnce({
    allowedOrigins: ['https://merchant.example'],
    fetchImpl,
    nowMs: now + 2000,
    leaseMs: 1000,
  });
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(new Set(ids).size, 1);
});
test('destination allowlist and private IP rules reject unsafe targets', () => {
  for (const url of [
    'http://169.254.169.254/latest',
    'https://127.0.0.1/internal',
    'https://merchant.example@127.0.0.1/',
    'https://evil.example/hook',
  ])
    assert.throws(() => validateDestination(url, ['https://merchant.example']));
  assert.equal(isPublicAddress('127.0.0.1'), false);
  assert.equal(isPublicAddress('10.1.2.3'), false);
  assert.equal(isPublicAddress('::ffff:127.0.0.1'), false);
});
test('actual local HTTP delivery signs the exact immutable payload', async () => {
  const f = await workerFixture();
  const merchant = (
    await getDb().query('SELECT webhook_secret FROM merchants WHERE id=$1', [
      f.merchant.id,
    ])
  ).rows[0];
  let verified = false;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    verified = verifySignature({
      secret: merchant.webhook_secret,
      payload: body,
      timestamp: String(req.headers['x-whitepay-timestamp']),
      signature: String(req.headers['x-whitepay-signature']),
    });
    res.statusCode = verified ? 204 : 400;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await getDb().query('UPDATE merchants SET webhook_url=$1 WHERE id=$2', [
      origin + '/hook',
      f.merchant.id,
    ]);
    await scanAndPersist(f.cfg, f.reader);
    const result = await dispatchOnce({
      allowedOrigins: [origin],
      allowLocal: true,
    });
    assert.equal(result.state, 'delivered');
    assert.equal(verified, true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('real HTTP retry grants an entitlement only once when first acknowledgment fails', async () => {
  const f = await workerFixture();
  const merchant = (
    await getDb().query('SELECT webhook_secret FROM merchants WHERE id=$1', [
      f.merchant.id,
    ])
  ).rows[0];
  const seen = new Set<string>();
  let credits = 0,
    calls = 0;
  const server = createServer(async (req, res) => {
    let payload = '';
    for await (const chunk of req) payload += chunk;
    const valid = verifySignature({
      secret: merchant.webhook_secret,
      payload,
      timestamp: String(req.headers['x-whitepay-timestamp']),
      signature: String(req.headers['x-whitepay-signature']),
    });
    if (!valid) {
      res.writeHead(400).end();
      return;
    }
    calls++;
    const event = JSON.parse(payload);
    if (!seen.has(event.id)) {
      seen.add(event.id);
      credits += 100;
    }
    res.writeHead(calls === 1 ? 503 : 204).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await getDb().query('UPDATE merchants SET webhook_url=$1 WHERE id=$2', [
      origin + '/hook',
      f.merchant.id,
    ]);
    await scanAndPersist(f.cfg, f.reader);
    const now = Date.now();
    const cfg = { allowedOrigins: [origin], allowLocal: true };
    assert.equal((await dispatchOnce({ ...cfg, nowMs: now })).state, 'pending');
    assert.equal(
      (await dispatchOnce({ ...cfg, nowMs: now + 2000 })).state,
      'delivered',
    );
    assert.equal(calls, 2);
    assert.equal(credits, 100);
    assert.equal(seen.size, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('exhausted webhook retries become dead and are not delivered again', async () => {
  await ready();
  let calls = 0;
  const cfg = {
    allowedOrigins: ['https://merchant.example'],
    maxAttempts: 2,
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 503 };
    },
  };
  const now = Date.now();
  assert.equal((await dispatchOnce({ ...cfg, nowMs: now })).state, 'pending');
  assert.equal(
    (await dispatchOnce({ ...cfg, nowMs: now + 2000 })).state,
    'dead',
  );
  assert.equal(
    (await dispatchOnce({ ...cfg, nowMs: now + 100000 })).processed,
    0,
  );
  assert.equal(calls, 2);
});

test('delivery runner drains the durable outbox and stops cleanly', async () => {
  await ready();
  const { startDeliveryDaemon } = await import('../src/daemon.js');
  let received!: () => void;
  const delivered = new Promise<void>((r) => (received = r));
  const runner = startDeliveryDaemon(
    {
      allowedOrigins: ['https://merchant.example'],
      fetchImpl: async () => {
        received();
        return { ok: true, status: 204 };
      },
    },
    10,
  );
  try {
    await delivered;
  } finally {
    await runner.stop();
  }
  assert.equal(
    (await getDb().query('SELECT state FROM webhook_outbox')).rows[0].state,
    'delivered',
  );
});
