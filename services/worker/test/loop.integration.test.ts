// Integration test: real @whitepay/chain WhitePayChainClient × scanAndPersist × anvil.
// Deploys the Emitter helper, fires a real PaymentSettled event on-chain, then runs the
// worker loop with the real ChainReader and asserts the API database was updated.

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
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WhitePayChainClient } from "@whitepay/chain";
import { spawnAnvil, readForgeArtifact, repoRoot, type AnvilHandle } from "../../../packages/chain/test/anvil-helper.js";
import { scanAndPersist } from "../src/loop.js";
import { closeDb, resetDbForTests } from "../src/db.js";
import { resetApiDbForTests, closeApiDb, getApiDb, countPaymentsForMerchant } from "../src/api-queue.js";

let anvil: AnvilHandle;
let emitterAddress: `0x${string}`;
let readerClient: WhitePayChainClient;
let tmp: string;

const MOCK_TOKEN = "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7" as `0x${string}`;
const PAYER = "0x" + "a".repeat(40);
const MERCHANT_ADDR = "0x" + "b".repeat(40);
const MERCHANT_ID = "mer_integration";
const SESSION_ID = "cs_integration";

async function fireEvent(orderId: `0x${string}`, amount: bigint) {
  const chain = defineChain({
    id: 1874, name: "anvil",
    nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const sender = createWalletClient({
    account: privateKeyToAccount(anvil.deployerPrivateKey),
    chain,
    transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const fireAbi = [
    {
      type: "function", name: "fire", stateMutability: "nonpayable",
      inputs: [
        { name: "orderId", type: "bytes32" },
        { name: "payer", type: "address" },
        { name: "merchant", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "feeRecipient", type: "address" },
        { name: "quoteId", type: "bytes32" },
      ],
      outputs: [],
    },
  ] as const;
  const hash = await sender.writeContract({
    address: emitterAddress,
    abi: fireAbi,
    functionName: "fire",
    args: [
      orderId,
      PAYER as Address,
      MERCHANT_ADDR as Address,
      MOCK_TOKEN,
      amount,
      1_000n,
      ("0x" + "f".repeat(40)) as Address,
      ("0x" + "cc".repeat(32)) as `0x${string}`,
    ],
    chain,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { txHash: hash, blockNumber: Number(receipt.blockNumber) };
}

function seedSubmission(orderId: string): { submissionId: string } {
  const id = `sub_${randomBytes(8).toString("hex")}`;
  const order = {
    orderId, payer: PAYER, merchant: MERCHANT_ADDR,
    amount: "5000000", fee: "5000",
    feeRecipient: "0x" + "f".repeat(40), token: MOCK_TOKEN,
    validAfter: 1, validBefore: 2_000_000_000,
    quoteId: "0x" + randomBytes(32).toString("hex"),
  };
  getApiDb()
    .prepare(
      `INSERT INTO submissions (id, merchant_id, session_id, payer_address, order_payload, order_digest,
         order_signature, token_signature, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '0xsig', '0xtok', 'submitted', ?, ?)`,
    )
    .run(
      id, MERCHANT_ID, SESSION_ID, PAYER, JSON.stringify(order),
      "0x" + randomBytes(32).toString("hex"), Date.now(), Date.now(),
    );
  return { submissionId: id };
}

before(async () => {
  anvil = await spawnAnvil({ chainId: 1874 });
  const emitter = await readForgeArtifact(
    join(repoRoot(), "packages/contracts/out-step03/Emitter.sol/Emitter.json"),
  );
  const chain = defineChain({
    id: 1874, name: "anvil",
    nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
    rpcUrls: { default: { http: [anvil.rpcUrl] } },
  });
  const deployer = createWalletClient({
    account: privateKeyToAccount(anvil.deployerPrivateKey),
    chain, transport: http(anvil.rpcUrl),
  });
  const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const hash = await deployer.deployContract({ abi: emitter.abi as any, bytecode: emitter.bytecode, args: [] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  emitterAddress = receipt.contractAddress!;

  // Reader client points at the emitter address (scans logs there).
  readerClient = new WhitePayChainClient({
    rpcUrl: anvil.rpcUrl,
    expectedChainId: 1874,
    checkoutAddress: emitterAddress,
    confirmations: 1,
  });

  tmp = mkdtempSync(join(tmpdir(), "worker-int-"));
  resetDbForTests(join(tmp, "worker.db"));
  resetApiDbForTests(join(tmp, "api.db"));
  getApiDb().exec(`
    CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      payer_address TEXT NOT NULL,
      order_payload TEXT NOT NULL,
      order_digest TEXT NOT NULL UNIQUE,
      order_signature TEXT, token_signature TEXT,
      status TEXT NOT NULL, tx_hash TEXT, error_reason TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, session_id TEXT NOT NULL,
      status TEXT NOT NULL, amount_minor INTEGER NOT NULL,
      tx_hash TEXT, block_number INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE checkout_sessions (
      id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, price_id TEXT NOT NULL,
      external_order_id TEXT NOT NULL, status TEXT NOT NULL, redirect_url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO checkout_sessions (id, merchant_id, price_id, external_order_id, status, redirect_url, created_at)
      VALUES ('cs_integration', 'mer_integration', 'price_1', 'ord_1', 'open', 'http://x', 0);
  `);
});

after(async () => {
  closeDb();
  closeApiDb();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  await anvil?.stop();
});

test("INTEGRATION: real event fired via anvil is scanned and persisted to API", async () => {
  const orderId = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  seedSubmission(orderId);
  // Fire a real tx on anvil.
  const { txHash, blockNumber } = await fireEvent(orderId, 5_000_000n);
  // Mine a couple more blocks so confirmations=1 is satisfied.
  await fireEvent(("0x" + "ee".repeat(32)) as `0x${string}`, 1n);  // unmatched event — advance block

  const r = await scanAndPersist(
    { scope: "int-s4", confirmations: 1, batchSize: 1000 },
    readerClient.asChainReader(),
  );
  assert.ok(r.processed >= 1, `expected processed >= 1, got ${r.processed}`);
  assert.equal(r.persisted, 1);
  assert.equal(countPaymentsForMerchant(MERCHANT_ID), 1);
  const pay = getApiDb()
    .prepare("SELECT tx_hash, amount_minor, block_number FROM payments WHERE merchant_id = ?")
    .get(MERCHANT_ID) as { tx_hash: string; amount_minor: number; block_number: number };
  assert.equal(pay.tx_hash.toLowerCase(), txHash.toLowerCase());
  assert.equal(pay.amount_minor, 5_000_000);
  assert.equal(pay.block_number, blockNumber);
});
