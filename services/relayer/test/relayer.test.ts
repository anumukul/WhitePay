import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDbForTests, closeDb } from "../src/db.js";
import { submit } from "../src/submit.js";
import type { ChainAdapter, RelayerConfig, SignedSubmission } from "../src/types.js";

const CHAIN_ID = 1874;
const TOKEN = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
const MERCHANT = "0x".padEnd(42, "b");
const CHECKOUT = "0x".padEnd(42, "c");

const baseConfig: RelayerConfig = {
  expectedChainId: CHAIN_ID,
  checkoutAddress: CHECKOUT,
  maxGasPerSettle: 500_000n,
  maxGasPriceWei: 20_000_000_000n,     // 20 gwei
  dailyBudgetWei: 100_000_000_000_000_000n,  // 0.1 WBT
  maxFeeBasisPointsDrift: 1,            // ±0.01%
};

function makeSub(overrides: Partial<SignedSubmission["order"]> = {}): SignedSubmission {
  return {
    order: {
      orderId: "0x" + "a".repeat(64),
      payer: "0x".padEnd(42, "p"),
      merchant: MERCHANT,
      amount: 5_000_000n,
      fee: 5_000n,
      feeRecipient: "0x".padEnd(42, "f"),
      token: TOKEN,
      validAfter: 999,
      validBefore: 2000,
      quoteId: "0x" + "q".repeat(64),
      ...overrides,
    },
    orderSignature: "0x" + "1".repeat(130),
    tokenSignature: "0x" + "2".repeat(130),
    expectedPriceMinor: 5_000_000n,
    expectedToken: TOKEN,
    expectedMerchant: MERCHANT,
    expectedFeeBasisPoints: 10,  // 0.10% of 5e6 = 5000
  };
}

function makeChain(opts: Partial<{ gas: bigint; balance: bigint; now: number; broadcastErr: string }> = {}): ChainAdapter & {
  calls: number;
} {
  let calls = 0;
  return {
    get calls() { return calls; },
    chainId: async () => CHAIN_ID,
    nowSeconds: () => opts.now ?? 1500,
    getRelayerBalance: async () => opts.balance ?? 10n ** 17n,
    estimateSettleGas: async () => opts.gas ?? 150_000n,
    sendSettle: async () => {
      calls++;
      if (opts.broadcastErr) throw new Error(opts.broadcastErr);
      return `0x${"deadbeef".repeat(8)}`;
    },
  };
}

let tmp: string;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "relayer-"));
  resetDbForTests(join(tmp, "relayer.db"));
});

after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test("happy path: submits and records", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const chain = makeChain();
  const r = await submit(makeSub(), baseConfig, chain);
  assert.equal(r.ok, true);
  assert.equal(chain.calls, 1);
});

test("rejects wrong chain", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const chain = { ...makeChain(), chainId: async () => 1 } as ChainAdapter;
  const r = await submit(makeSub(), baseConfig, chain);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "wrong_chain");
});

test("rejects amount mismatch (frontend tampering)", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const sub = makeSub({ amount: 5_000_001n });
  const r = await submit(sub, baseConfig, makeChain());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "amount_mismatch");
});

test("rejects merchant tampering", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const sub = makeSub({ merchant: "0x".padEnd(42, "x") });
  const r = await submit(sub, baseConfig, makeChain());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "merchant_mismatch");
});

test("rejects fee out of band", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const sub = makeSub({ fee: 10_000n }); // 2x expected
  const r = await submit(sub, baseConfig, makeChain());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "fee_out_of_band");
});

test("rejects expired order", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const r = await submit(makeSub(), baseConfig, makeChain({ now: 3000 }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "time_expired");
});

test("rejects gas estimate over cap", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const r = await submit(makeSub(), baseConfig, makeChain({ gas: 1_000_000n }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "gas_exceeded");
});

test("rejects when daily budget would be exceeded", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const tightBudget: RelayerConfig = { ...baseConfig, dailyBudgetWei: 1n };
  const r = await submit(makeSub(), tightBudget, makeChain());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "budget_exceeded");
});

test("rejects when relayer balance too low", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  // Balance must be below gasCap (150_000 * 20gwei = 3e15) but budget must leave room,
  // so balance check (ordered after budget check) actually fires.
  const r = await submit(makeSub(), baseConfig, makeChain({ balance: 1_000_000_000_000n }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "insufficient_relayer_balance");
});

test("prevents duplicate submission for same orderId", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const chain = makeChain();
  const first = await submit(makeSub(), baseConfig, chain);
  assert.equal(first.ok, true);
  const second = await submit(makeSub(), baseConfig, chain);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.code, "already_submitted");
  assert.equal(chain.calls, 1);
});

test("budget accumulates across submissions on same day", async () => {
  resetDbForTests(join(tmp, `relayer-${Date.now()}-${Math.random()}.db`));
  const chain = makeChain();
  const sub1 = makeSub({ orderId: "0x" + "1".repeat(64) });
  const sub2 = makeSub({ orderId: "0x" + "2".repeat(64) });
  const tightBudget: RelayerConfig = {
    ...baseConfig,
    dailyBudgetWei: 150_000n * 20_000_000_000n + 1n, // enough for one but not two
  };
  const r1 = await submit(sub1, tightBudget, chain);
  const r2 = await submit(sub2, tightBudget, chain);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.error.code, "budget_exceeded");
});
