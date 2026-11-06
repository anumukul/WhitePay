import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { scanAndPersist } from "../src/loop.js";
import { resetDbForTests, closeDb, getCursor } from "../src/db.js";
import { resetApiDbForTests, closeApiDb, getApiDb, countPaymentsForMerchant } from "../src/api-queue.js";
import type { ChainReader, SettledLog } from "@whitepay/chain";
import type { FetchLike } from "../src/webhooks.js";
import { verifySignature } from "../src/webhooks.js";

let tmp: string;

function freshDbs(): void {
  tmp = mkdtempSync(join(tmpdir(), "worker-s4-"));
  resetDbForTests(join(tmp, "worker.db"));
  resetApiDbForTests(join(tmp, "api.db"));
  // Create the API schema the worker expects to read/write.
  getApiDb().exec(`
    CREATE TABLE merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      payout_address TEXT NOT NULL,
      webhook_url TEXT,
      webhook_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      payer_address TEXT NOT NULL,
      order_payload TEXT NOT NULL,
      order_digest TEXT NOT NULL UNIQUE,
      order_signature TEXT,
      token_signature TEXT,
      status TEXT NOT NULL,
      tx_hash TEXT,
      error_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      tx_hash TEXT,
      block_number INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE checkout_sessions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      price_id TEXT NOT NULL,
      external_order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      redirect_url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

function seedMerchant(id: string, webhookUrl: string | null, secret = "whsec_test"): void {
  getApiDb()
    .prepare(
      `INSERT OR IGNORE INTO merchants (id, name, payout_address, webhook_url, webhook_secret, created_at)
       VALUES (?, ?, '0x', ?, ?, ?)`,
    )
    .run(id, `M ${id}`, webhookUrl, secret, Date.now());
}

function cleanup(): void {
  closeDb();
  closeApiDb();
  rmSync(tmp, { recursive: true, force: true });
}

function seedSubmission(overrides: { orderId?: string; merchantId?: string; sessionId?: string; status?: string } = {}): { orderId: string; submissionId: string; merchantId: string; sessionId: string } {
  const id = `sub_${randomBytes(8).toString("hex")}`;
  const merchantId = overrides.merchantId ?? "mer_" + randomBytes(5).toString("hex");
  const sessionId = overrides.sessionId ?? "cs_" + randomBytes(7).toString("hex");
  const orderId = overrides.orderId ?? "0x" + randomBytes(32).toString("hex");
  const order = {
    orderId,
    payer: "0x" + "a".repeat(40),
    merchant: "0x" + "b".repeat(40),
    amount: "5000000",
    fee: "5000",
    feeRecipient: "0x" + "f".repeat(40),
    token: "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7",
    validAfter: 1,
    validBefore: 2_000_000_000,
    quoteId: "0x" + randomBytes(32).toString("hex"),
  };
  getApiDb()
    .prepare(
      `INSERT INTO checkout_sessions (id, merchant_id, price_id, external_order_id, status, redirect_url, created_at)
       VALUES (?, ?, 'price_1', 'ord_1', 'open', 'http://x', ?)`,
    )
    .run(sessionId, merchantId, Date.now());
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, ?, ?, '0xpayer', ?, ?, '0xsig', '0xtok', ?, ?, ?)`,
    )
    .run(
      id, merchantId, sessionId, JSON.stringify(order),
      "0x" + randomBytes(32).toString("hex"), overrides.status ?? "submitted",
      Date.now(), Date.now(),
    );
  return { orderId, submissionId: id, merchantId, sessionId };
}

function fakeLog(block: number, orderId: string, amount: bigint = 5_000_000n, logIndex = 0): SettledLog {
  return {
    blockNumber: block,
    txHash: `0x${block.toString(16).padStart(64, "0")}`,
    logIndex,
    orderId,
    payer: "0x" + "a".repeat(40),
    merchant: "0x" + "b".repeat(40),
    token: "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7",
    amount,
    fee: 5_000n,
    feeRecipient: "0x" + "f".repeat(40),
    quoteId: "0x" + "c".repeat(64),
  };
}

function reader(logs: SettledLog[], head = 100): ChainReader {
  return {
    getHead: async () => head,
    getLogs: async (_from, _to) => logs,
  };
}

before(() => { freshDbs(); });
after(() => { cleanup(); });

test("scanAndPersist inserts a payments row and marks submission settled", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, null);
  const log = fakeLog(10, seeded.orderId);
  const r = await scanAndPersist({ scope: "test1", confirmations: 2, batchSize: 100 }, reader([log]));
  assert.equal(r.processed, 1);
  assert.equal(r.persisted, 1);
  assert.equal(r.unmatched, 0);
  assert.equal(r.duplicates, 0);
  assert.equal(countPaymentsForMerchant(seeded.merchantId), 1);
  const sub = getApiDb()
    .prepare("SELECT status, tx_hash FROM submissions WHERE id = ?")
    .get(seeded.submissionId) as { status: string; tx_hash: string };
  assert.equal(sub.status, "settled");
  assert.equal(sub.tx_hash, log.txHash);
  const cs = getApiDb()
    .prepare("SELECT status FROM checkout_sessions WHERE id = ?")
    .get(seeded.sessionId) as { status: string };
  assert.equal(cs.status, "settled");
});

test("scanAndPersist on second pass (worker restart replay) does not double-insert", async () => {
  freshDbs();
  const seeded = seedSubmission();
  const log = fakeLog(10, seeded.orderId);
  await scanAndPersist({ scope: "r1", confirmations: 2 }, reader([log]));
  // Simulate restart: rewind cursor, scan again — worker's settlements table prevents refire.
  const { setCursor } = await import("../src/db.js");
  setCursor("r1", 0);
  const r2 = await scanAndPersist({ scope: "r1", confirmations: 2 }, reader([log]));
  assert.equal(r2.persisted, 0);
  assert.equal(countPaymentsForMerchant(seeded.merchantId), 1);
});

test("unmatched orderId is counted and does NOT create a payments row", async () => {
  freshDbs();
  const seeded = seedSubmission(); // seeded with one orderId
  const stranger = "0x" + "ff".repeat(32);
  const log = fakeLog(10, stranger);
  const r = await scanAndPersist({ scope: "u1", confirmations: 2 }, reader([log]));
  assert.equal(r.processed, 1);
  assert.equal(r.unmatched, 1);
  assert.equal(r.persisted, 0);
  assert.equal(countPaymentsForMerchant(seeded.merchantId), 0);
});

test("mixed batch: some match, some don't — each counted correctly", async () => {
  freshDbs();
  const s1 = seedSubmission();
  const s2 = seedSubmission();
  const head = 100;
  const logs = [
    fakeLog(10, s1.orderId),
    fakeLog(11, "0x" + "ff".repeat(32)),  // no match
    fakeLog(12, s2.orderId),
  ];
  const r = await scanAndPersist({ scope: "m1", confirmations: 2 }, reader(logs, head));
  // processed counts every log that cleared the worker's own eventId dedup (all 3 are fresh).
  // persisted counts those that also matched a known submission.
  assert.equal(r.processed, 3);
  assert.equal(r.persisted, 2);
  assert.equal(r.unmatched, 1);
});

test("duplicate log (same tx + session) inserted once (dedup fallback at DB layer)", async () => {
  freshDbs();
  const seeded = seedSubmission();
  // Two logs with same block/txHash/orderId (shouldn't happen on a sane chain, but defend).
  const log = fakeLog(10, seeded.orderId);
  const dupLog = { ...log, logIndex: 1 };  // different eventId, same tx — rare but defensive
  const r = await scanAndPersist({ scope: "d1", confirmations: 2 }, reader([log, dupLog]));
  assert.equal(r.processed, 2);
  assert.equal(r.persisted, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(countPaymentsForMerchant(seeded.merchantId), 1);
});

test("scanAndPersist respects worker's existing cursor + confirmations behavior", async () => {
  freshDbs();
  const r = await scanAndPersist(
    { scope: "c1", confirmations: 2, batchSize: 5 },
    reader([], 100),
  );
  assert.equal(r.advancedTo, 5); // from=1 to=min(5, 98)
  assert.equal(getCursor("c1"), 5);
});

test("merchant isolation preserved: scan writes to the right merchant's payments", async () => {
  freshDbs();
  const a = seedSubmission({ merchantId: "mer_A" });
  const b = seedSubmission({ merchantId: "mer_B" });
  seedMerchant("mer_A", null);
  seedMerchant("mer_B", null);
  // Different scopes so cursors are independent.
  await scanAndPersist({ scope: "iso-a", confirmations: 2 }, reader([fakeLog(10, a.orderId)]));
  await scanAndPersist({ scope: "iso-b", confirmations: 2 }, reader([fakeLog(11, b.orderId)]));
  assert.equal(countPaymentsForMerchant("mer_A"), 1);
  assert.equal(countPaymentsForMerchant("mer_B"), 1);
});

// ─────────────────── S5 webhook delivery tests ───────────────────

test("S5: merchant with webhook_url receives a signed delivery once", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, "http://merchant.local/hook", "whsec_merchant");
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { ok: true, status: 200 };
  };
  const log = fakeLog(10, seeded.orderId);
  const r = await scanAndPersist({ scope: "wh1", confirmations: 2, fetchImpl }, reader([log]));
  assert.equal(r.webhooksDelivered, 1);
  assert.equal(r.webhooksFailed, 0);
  assert.equal(r.webhooksSkipped, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://merchant.local/hook");

  // Sig header is HMAC-SHA256 over timestamp.payload with merchant secret.
  const { headers, body } = calls[0];
  assert.ok(headers["x-whitepay-signature"]);
  assert.ok(headers["x-whitepay-timestamp"]);
  assert.equal(headers["x-whitepay-event-id"], `${log.txHash}:${log.logIndex}`);
  assert.equal(
    verifySignature({
      secret: "whsec_merchant",
      timestamp: headers["x-whitepay-timestamp"],
      payload: body,
      signature: headers["x-whitepay-signature"],
    }),
    true,
    "the delivered signature must verify under the merchant's secret",
  );
  // Payload shape
  const parsed = JSON.parse(body);
  assert.equal(parsed.type, "payment.succeeded");
  assert.equal(parsed.data.orderId, log.orderId);
  assert.equal(parsed.data.amountMinor, "5000000");
  assert.equal(parsed.data.merchantId, seeded.merchantId);
});

test("S5: merchant with no webhook_url → delivery skipped (payment still recorded)", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, null);
  const fetchImpl: FetchLike = async () => ({ ok: true, status: 200 });
  const log = fakeLog(10, seeded.orderId);
  const r = await scanAndPersist({ scope: "wh2", confirmations: 2, fetchImpl }, reader([log]));
  assert.equal(r.persisted, 1);
  assert.equal(r.webhooksDelivered, 0);
  assert.equal(r.webhooksSkipped, 1);
});

test("S5: 500 responses retried up to max then counted as failed; payment stays recorded", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, "http://merchant.local/hook");
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls++;
    return { ok: false, status: 500 };
  };
  const log = fakeLog(10, seeded.orderId);
  const r = await scanAndPersist(
    { scope: "wh3", confirmations: 2, fetchImpl, webhookMaxAttempts: 3 },
    reader([log]),
  );
  assert.equal(r.persisted, 1);
  assert.equal(r.webhooksDelivered, 0);
  assert.equal(r.webhooksFailed, 1);
  assert.equal(calls, 3);
});

test("S5: duplicate on-chain log → payment inserted once AND webhook delivered once", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, "http://merchant.local/hook");
  const sends: string[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    sends.push(init.headers["x-whitepay-event-id"]);
    return { ok: true, status: 200 };
  };
  const log = fakeLog(10, seeded.orderId);
  const dup = { ...log, logIndex: 1 }; // distinct eventId → both go through onSettlement
  const r = await scanAndPersist({ scope: "wh4", confirmations: 2, fetchImpl }, reader([log, dup]));
  assert.equal(r.persisted, 1);
  assert.equal(r.duplicates, 1);
  // Payment inserted once; webhook delivered once (the duplicate short-circuits before webhook).
  assert.equal(r.webhooksDelivered, 1);
  assert.equal(sends.length, 1);
});

test("S5: worker restart (cursor rewind) does not re-deliver already-delivered webhook", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, "http://merchant.local/hook");
  const sends: string[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    sends.push(init.headers["x-whitepay-event-id"]);
    return { ok: true, status: 200 };
  };
  const log = fakeLog(10, seeded.orderId);
  await scanAndPersist({ scope: "wh5", confirmations: 2, fetchImpl }, reader([log]));
  // Simulate restart: rewind cursor, scan same log again.
  const { setCursor } = await import("../src/db.js");
  setCursor("wh5", 0);
  const r2 = await scanAndPersist({ scope: "wh5", confirmations: 2, fetchImpl }, reader([log]));
  assert.equal(r2.persisted, 0, "worker's eventId dedup prevents re-persist");
  assert.equal(sends.length, 1, "webhook delivered exactly once across restarts");
});

test("S5: fetch throws → counted as failed, not propagated", async () => {
  freshDbs();
  const seeded = seedSubmission();
  seedMerchant(seeded.merchantId, "http://merchant.local/hook");
  const fetchImpl: FetchLike = async () => { throw new Error("DNS failure"); };
  const log = fakeLog(10, seeded.orderId);
  const r = await scanAndPersist(
    { scope: "wh6", confirmations: 2, fetchImpl, webhookMaxAttempts: 2 },
    reader([log]),
  );
  assert.equal(r.persisted, 1);
  assert.equal(r.webhooksFailed, 1);
});
