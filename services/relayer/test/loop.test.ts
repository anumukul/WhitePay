import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runOnce } from "../src/loop.js";
import { resetDbForTests, closeDb } from "../src/db.js";
import { resetApiDbForTests, closeApiDb, getApiDb, getSubmissionStatus } from "../src/queue.js";
import type { ChainAdapter, Order } from "@whitepay/chain";
import type { RelayerConfig } from "../src/types.js";

const TOKEN = "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7";
const MERCHANT = "0x" + "b".repeat(40);
const PAYER = "0x" + "a".repeat(40);
const FEE_REC = "0x" + "f".repeat(40);

const cfg: RelayerConfig = {
  expectedChainId: 1874,
  checkoutAddress: ("0x" + "c".repeat(40)) as string,
  maxGasPerSettle: 500_000n,
  maxGasPriceWei: 20_000_000_000n,
  dailyBudgetWei: 100_000_000_000_000_000n,
  maxFeeBasisPointsDrift: 1,
};

let tmp: string;

function freshDbs(): void {
  tmp = mkdtempSync(join(tmpdir(), "relayer-s3-"));
  resetDbForTests(join(tmp, "relayer.db"));
  resetApiDbForTests(join(tmp, "api.db"));
  // Create the submissions table shape that services/api owns.
  // Mirrors services/api/src/db.ts migrate().
  getApiDb().exec(`
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function cleanup(): void {
  closeDb();
  closeApiDb();
  rmSync(tmp, { recursive: true, force: true });
}

function seedSubmission(overrides: Partial<{
  status: string; orderId: string; amount: bigint; fee: bigint; validAfter: number; validBefore: number;
}> = {}): { id: string; orderId: string } {
  const id = `sub_${randomBytes(8).toString("hex")}`;
  const orderId = overrides.orderId ?? ("0x" + randomBytes(32).toString("hex"));
  const order = {
    orderId,
    payer: PAYER,
    merchant: MERCHANT,
    amount: (overrides.amount ?? 5_000_000n).toString(),
    fee: (overrides.fee ?? 5_000n).toString(),
    feeRecipient: FEE_REC,
    token: TOKEN,
    validAfter: overrides.validAfter ?? 1,
    validBefore: overrides.validBefore ?? 2_000_000_000,
    quoteId: "0x" + randomBytes(32).toString("hex"),
  };
  const digest = "0x" + randomBytes(32).toString("hex");
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, 'mer_x', 'cs_x', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, PAYER, JSON.stringify(order), digest,
      "0x" + "aa".repeat(65), "0x" + "bb".repeat(65),
      overrides.status ?? "queued", Date.now(), Date.now(),
    );
  return { id, orderId };
}

function fakeChain(opts: Partial<{ gas: bigint; balance: bigint; broadcast: boolean }> = {}): ChainAdapter & { calls: number } {
  let calls = 0;
  const chain: ChainAdapter & { calls: number } = {
    get calls() { return calls; },
    chainId: async () => 1874,
    nowSeconds: () => 1_000_000_000,
    getRelayerBalance: async () => opts.balance ?? 10n ** 17n,
    estimateSettleGas: async () => opts.gas ?? 150_000n,
    sendSettle: async () => {
      calls++;
      if (opts.broadcast === false) throw new Error("rpc_down");
      return "0x" + "de".repeat(32);
    },
  };
  return chain;
}

before(() => { freshDbs(); });
after(() => { cleanup(); });

test("runOnce processes queued submissions and marks submitted with tx hash", async () => {
  freshDbs();
  const { id } = seedSubmission();
  const chain = fakeChain();
  const r = await runOnce(cfg, chain);
  assert.equal(r.processed, 1);
  assert.equal(r.submitted, 1);
  assert.equal(r.failed, 0);
  assert.equal(getSubmissionStatus(id), "submitted");
  const row = getApiDb()
    .prepare("SELECT tx_hash as txHash FROM submissions WHERE id = ?")
    .get(id) as { txHash: string };
  assert.ok(row.txHash.startsWith("0x"));
});

test("runOnce skips submissions whose status isn't queued", async () => {
  freshDbs();
  seedSubmission({ status: "awaiting_signature" });
  seedSubmission({ status: "submitted" });
  seedSubmission({ status: "failed" });
  const r = await runOnce(cfg, fakeChain());
  assert.equal(r.processed, 0);
});

test("runOnce marks submissions failed when chain send throws", async () => {
  freshDbs();
  const { id } = seedSubmission();
  const chain = fakeChain({ broadcast: false });
  const r = await runOnce(cfg, chain);
  assert.equal(r.submitted, 0);
  assert.equal(r.failed, 1);
  const status = getSubmissionStatus(id);
  assert.equal(status, "failed");
  const row = getApiDb()
    .prepare("SELECT tx_hash FROM submissions WHERE id = ?")
    .get(id) as { tx_hash: string };
  assert.match(row.tx_hash, /^error:chain_error/);
});

test("runOnce marks failed when validation rejects (time expired)", async () => {
  freshDbs();
  const { id } = seedSubmission({ validBefore: 100 }); // chain.nowSeconds = 1e9, so expired
  const chain = fakeChain();
  const r = await runOnce(cfg, chain);
  assert.equal(r.failed, 1);
  assert.equal(getSubmissionStatus(id), "failed");
  const row = getApiDb().prepare("SELECT tx_hash FROM submissions WHERE id = ?").get(id) as { tx_hash: string };
  assert.ok(row.tx_hash.includes("time_expired"));
});

test("runOnce is idempotent: second pass finds nothing (statuses already moved)", async () => {
  freshDbs();
  seedSubmission();
  const chain = fakeChain();
  const r1 = await runOnce(cfg, chain);
  const r2 = await runOnce(cfg, chain);
  assert.equal(r1.processed, 1);
  assert.equal(r2.processed, 0);
  assert.equal(chain.calls, 1);
});

test("runOnce processes multiple queued in batch, each gets its own tx hash", async () => {
  freshDbs();
  const { id: a } = seedSubmission();
  const { id: b } = seedSubmission();
  const { id: c } = seedSubmission();
  const r = await runOnce(cfg, fakeChain(), 10);
  assert.equal(r.processed, 3);
  assert.equal(r.submitted, 3);
  for (const id of [a, b, c]) assert.equal(getSubmissionStatus(id), "submitted");
});

test("runOnce stops processing if budget exhausted mid-batch", async () => {
  freshDbs();
  seedSubmission();
  seedSubmission();
  const tight: RelayerConfig = {
    ...cfg,
    dailyBudgetWei: 150_000n * 20_000_000_000n + 1n, // enough for exactly one
  };
  const r = await runOnce(tight, fakeChain());
  assert.equal(r.processed, 2);
  assert.equal(r.submitted, 1);
  assert.equal(r.failed, 1);
  assert.ok(r.details[1].reason === "budget_exceeded");
});

test("runOnce ignores queued rows whose signatures are missing", async () => {
  freshDbs();
  const id = `sub_${randomBytes(8).toString("hex")}`;
  const order = {
    orderId: "0x" + "aa".repeat(32),
    payer: PAYER, merchant: MERCHANT,
    amount: "5000000", fee: "5000", feeRecipient: FEE_REC, token: TOKEN,
    validAfter: 1, validBefore: 2_000_000_000, quoteId: "0x" + "bb".repeat(32),
  };
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, 'mer_x', 'cs_x', ?, ?, ?, NULL, NULL, 'queued', ?, ?)`,
    )
    .run(id, PAYER, JSON.stringify(order), "0x" + "cc".repeat(32), Date.now(), Date.now());
  const r = await runOnce(cfg, fakeChain());
  assert.equal(r.processed, 0);
});

test("malformed order payload marks failed with invalid_payload", async () => {
  freshDbs();
  const id = `sub_${randomBytes(8).toString("hex")}`;
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, 'mer_x', 'cs_x', ?, 'not-json', ?, ?, ?, 'queued', ?, ?)`,
    )
    .run(id, PAYER, "0x" + "cc".repeat(32), "0x" + "aa".repeat(65), "0x" + "bb".repeat(65), Date.now(), Date.now());
  const r = await runOnce(cfg, fakeChain());
  assert.equal(r.failed, 1);
  const row = getApiDb().prepare("SELECT tx_hash FROM submissions WHERE id = ?").get(id) as { tx_hash: string };
  assert.match(row.tx_hash, /invalid_payload/);
});
