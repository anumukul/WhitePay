import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDbForTests, closeDb, getCursor } from "../src/db.js";
import { deliverWebhook, signPayload, verifySignature, type FetchLike } from "../src/webhooks.js";
import { scanOnce, type ChainReader, type SettledLog } from "../src/indexer.js";

let tmp: string;
before(() => { tmp = mkdtempSync(join(tmpdir(), "worker-")); });
after(() => { closeDb(); rmSync(tmp, { recursive: true, force: true }); });

function fresh() { resetDbForTests(join(tmp, `w-${Date.now()}-${Math.random()}.db`)); }

test("sign + verify round trip", () => {
  const sig = signPayload("sek", "1000", "{}");
  assert.equal(verifySignature({ secret: "sek", timestamp: "1000", payload: "{}", signature: sig }), true);
  assert.equal(verifySignature({ secret: "bad", timestamp: "1000", payload: "{}", signature: sig }), false);
});

test("deliverWebhook: 2xx first try marks delivered", async () => {
  fresh();
  const fetchImpl: FetchLike = async () => ({ ok: true, status: 200 });
  const r = await deliverWebhook({ eventId: "evt_1", url: "http://x", secret: "s", payload: "{}", fetchImpl });
  assert.equal(r.delivered, true);
  assert.equal(r.attempts, 1);
});

test("deliverWebhook: retries up to max then marks failed", async () => {
  fresh();
  let calls = 0;
  const fetchImpl: FetchLike = async () => { calls++; return { ok: false, status: 500 }; };
  const r = await deliverWebhook({ eventId: "evt_2", url: "http://x", secret: "s", payload: "{}", maxAttempts: 3, fetchImpl });
  assert.equal(r.delivered, false);
  assert.equal(r.attempts, 3);
  assert.equal(calls, 3);
});

test("deliverWebhook: already-delivered short-circuits (no refire)", async () => {
  fresh();
  const fetchImpl1: FetchLike = async () => ({ ok: true, status: 200 });
  await deliverWebhook({ eventId: "evt_3", url: "http://x", secret: "s", payload: "{}", fetchImpl: fetchImpl1 });
  let secondTryCalls = 0;
  const fetchImpl2: FetchLike = async () => { secondTryCalls++; return { ok: true, status: 200 }; };
  const r2 = await deliverWebhook({ eventId: "evt_3", url: "http://x", secret: "s", payload: "{}", fetchImpl: fetchImpl2 });
  assert.equal(r2.delivered, true);
  assert.equal(secondTryCalls, 0);
});

function fakeLog(block: number, orderId: string, amount: bigint = 5_000_000n): SettledLog {
  return {
    blockNumber: block,
    txHash: `0x${block.toString(16).padStart(64, "0")}`,
    logIndex: 0,
    orderId: `0x${orderId.padEnd(64, "0")}`,
    payer: "0xp".padEnd(42, "0"),
    merchant: "0xm".padEnd(42, "0"),
    token: "0xt".padEnd(42, "0"),
    amount,
    fee: 5_000n,
    feeRecipient: "0xf".padEnd(42, "0"),
    quoteId: "0xq".padEnd(66, "0"),
  };
}

test("indexer: respects confirmations and advances cursor", async () => {
  fresh();
  const reader: ChainReader = {
    getHead: async () => 100,
    getLogs: async (from, to) => [fakeLog(from, "a")],
  };
  const calls: string[] = [];
  const r = await scanOnce({
    scope: "test", reader, confirmations: 2, batchSize: 10,
    onSettlement: (_log, evtId) => { calls.push(evtId); },
  });
  assert.equal(r.processed, 1);
  assert.equal(r.advancedTo, 10); // from=1 (cursor+1), to=min(10, 98)
  assert.equal(getCursor("test"), 10);
  assert.equal(calls.length, 1);
});

test("indexer: duplicate log on rescan does not re-fire onSettlement", async () => {
  fresh();
  // Run once, cursor advances. Reset cursor and re-scan same range — settlement already recorded, so no refire.
  const log = fakeLog(5, "dup");
  const reader: ChainReader = {
    getHead: async () => 100,
    getLogs: async () => [log],
  };
  const fires: string[] = [];
  await scanOnce({ scope: "s", reader, confirmations: 2, batchSize: 10, onSettlement: (_l, e) => { fires.push(e); } });
  // Rewind cursor to replay
  const { setCursor } = await import("../src/db.js");
  setCursor("s", 0);
  await scanOnce({ scope: "s", reader, confirmations: 2, batchSize: 10, onSettlement: (_l, e) => { fires.push(e); } });
  assert.equal(fires.length, 1, "should fire exactly once across restarts");
});

test("indexer: no advance when head within confirmations window", async () => {
  fresh();
  const reader: ChainReader = {
    getHead: async () => 1,
    getLogs: async () => { throw new Error("should not fetch"); },
  };
  const r = await scanOnce({
    scope: "t2", reader, confirmations: 2, batchSize: 10, onSettlement: () => {},
  });
  assert.equal(r.processed, 0);
});
