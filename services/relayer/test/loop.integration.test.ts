// Integration test: real @whitepay/chain WhitePayChainClient × runOnce loop × anvil chain.
// Proves the composition that the plan requires ("anvil + two services").
// The submission's signatures are not real EIP-712 signatures, so the on-chain call
// MUST revert — the test asserts the loop surfaces the chain revert cleanly.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WhitePayChainClient, whitepayCheckoutAbi } from "@whitepay/chain";
import { spawnAnvil, readForgeArtifact, repoRoot, type AnvilHandle } from "../../../packages/chain/test/anvil-helper.js";
import { runOnce } from "../src/loop.js";
import { closeDb, resetDbForTests } from "../src/db.js";
import { resetApiDbForTests, closeApiDb, getApiDb, getSubmissionStatus } from "../src/queue.js";
import type { RelayerConfig } from "../src/types.js";

let anvil: AnvilHandle;
let checkoutAddress: `0x${string}`;
let client: WhitePayChainClient;
let tmp: string;

const MOCK_TOKEN = "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7" as `0x${string}`;

function cfg(): RelayerConfig {
  return {
    expectedChainId: 1874,
    checkoutAddress,
    maxGasPerSettle: 500_000n,
    maxGasPriceWei: 20_000_000_000n,
    dailyBudgetWei: 100_000_000_000_000_000n,
    maxFeeBasisPointsDrift: 1,
  };
}

function seedQueuedSubmission(): { id: string } {
  const id = `sub_${randomBytes(8).toString("hex")}`;
  const order = {
    orderId: "0x" + randomBytes(32).toString("hex"),
    payer: anvil.payerAddress,
    merchant: "0x" + "b".repeat(40),
    amount: "5000000",
    fee: "5000",
    feeRecipient: "0x" + "f".repeat(40),
    token: MOCK_TOKEN,
    validAfter: 1,
    validBefore: 2_000_000_000,
    quoteId: "0x" + randomBytes(32).toString("hex"),
  };
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, 'mer_x', 'cs_x', ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    )
    .run(
      id, anvil.payerAddress, JSON.stringify(order), "0x" + randomBytes(32).toString("hex"),
      "0x" + "ab".repeat(65), "0x" + "cd".repeat(65),
      Date.now(), Date.now(),
    );
  return { id };
}

before(async () => {
  anvil = await spawnAnvil({ chainId: 1874 });

  // Deploy WhitePayCheckout with the mock token in the allowlist.
  const artifact = await readForgeArtifact(
    join(repoRoot(), "packages/contracts/out-step03/WhitePayCheckout.sol/WhitePayCheckout.json"),
  );
  const chain = defineChain({
    id: 1874,
    name: "anvil",
    nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const deployer = createWalletClient({
    account: privateKeyToAccount(anvil.deployerPrivateKey),
    chain,
    transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const hash = await deployer.deployContract({
    abi: whitepayCheckoutAbi,
    bytecode: artifact.bytecode,
    args: [1874n, [MOCK_TOKEN]],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  checkoutAddress = receipt.contractAddress!;

  client = new WhitePayChainClient({
    rpcUrl: anvil.rpcUrl,
    expectedChainId: 1874,
    checkoutAddress,
    relayerPrivateKey: anvil.relayerPrivateKey,
    confirmations: 1,
  });

  tmp = mkdtempSync(join(tmpdir(), "relayer-int-"));
  resetDbForTests(join(tmp, "relayer.db"));
  resetApiDbForTests(join(tmp, "api.db"));
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
      error_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
});

after(async () => {
  closeDb();
  closeApiDb();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  await anvil?.stop();
});

test("INTEGRATION: real chain client gets called from the loop; invalid sigs surface as chain_error", async () => {
  const { id } = seedQueuedSubmission();
  const r = await runOnce(cfg(), client.asChainAdapter());

  assert.equal(r.processed, 1);
  // With fake signatures, either estimation reverts (expected) or send does.
  // Either way: loop surfaces failure, not success.
  assert.equal(r.submitted, 0);
  assert.equal(r.failed, 1);
  assert.equal(getSubmissionStatus(id), "failed");
  const row = getApiDb()
    .prepare("SELECT error_reason, tx_hash FROM submissions WHERE id = ?")
    .get(id) as { error_reason: string; tx_hash: string | null };
  // The reason could be 'chain_error:...' (estimate reverted, caught by processOne)
  // or 'insufficient_relayer_balance' / 'gas_exceeded' etc. — but NEVER 'submitted'.
  assert.ok(
    row.error_reason.startsWith("chain_error") || /^[a-z_]+$/.test(row.error_reason),
    `unexpected error_reason: ${row.error_reason}`,
  );
  assert.equal(row.tx_hash, null);
});

test("INTEGRATION: chain adapter nowSeconds is sane (within a minute of real time)", () => {
  const adapter = client.asChainAdapter();
  const n = adapter.nowSeconds();
  const real = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(n - real) < 60);
});

test("INTEGRATION: real chain balance of pre-funded relayer is well above gas cap", async () => {
  const bal = await client.getRelayerBalance();
  const gasCap = 500_000n * 20_000_000_000n; // 1e16 wei
  assert.ok(bal > gasCap, `${bal} should exceed gasCap ${gasCap}`);
});
