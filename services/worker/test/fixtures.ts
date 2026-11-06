import { encodeEventTopics, parseAbi, type Hex } from 'viem';
import { fixture, getDb } from '../../relayer/test/fixtures.js';
import { runOnce } from '../../relayer/src/loop.js';
import type {
  WorkerConfig,
  WorkerReader,
  WorkerReceipt,
} from '../src/types.js';
export async function workerFixture() {
  const f = await fixture();
  const approval = await f.approve();
  f.cfg.mode = 'execute';
  await runOnce(f.cfg, f.chain, 10, approval);
  const hash = f.mine();
  const base = f.state.receipts.get(hash)!;
  const auth = {
    address: f.cfg.tokenAddress,
    topics: encodeEventTopics({
      abi: parseAbi([
        'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
      ]),
      eventName: 'AuthorizationUsed',
      args: { authorizer: f.row.payer_address, nonce: f.row.order_digest },
    }) as Hex[],
    data: '0x' as Hex,
  };
  const o = f.row.order_payload;
  const log = {
    blockNumber: 10,
    txHash: hash,
    logIndex: 1,
    orderId: o.orderId,
    payer: o.payer,
    merchant: o.merchant,
    token: o.token,
    amount: BigInt(o.amount),
    fee: BigInt(o.fee),
    feeRecipient: o.feeRecipient,
    quoteId: o.quoteId,
  };
  const blockHash = '0x' + 'a'.repeat(64);
  const receipt: WorkerReceipt = {
    transactionHash: hash,
    blockHash,
    blockNumber: 10,
    status: 'success',
    logs: [auth, ...base.logs].map((l, i) => ({ ...l, logIndex: i })),
  };
  const state = {
    head: 12,
    hash: blockHash,
    receipt: receipt as WorkerReceipt | null,
    logs: [log],
  };
  const cfg: WorkerConfig = {
    scope: 'test-worker:' + f.session.id,
    chainId: 1874,
    checkoutAddress: f.cfg.checkoutAddress,
    fromBlock: 10,
    confirmations: 2,
  };
  const reader: WorkerReader = {
    chainId: async () => 1874,
    getHead: async () => state.head,
    getBlockHash: async () => state.hash,
    getLogs: async (from, to) =>
      state.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to),
    getReceipt: async () => state.receipt,
  };
  await getDb().query(
    "UPDATE merchants SET webhook_url='https://merchant.example/webhook' WHERE id=$1",
    [f.merchant.id],
  );
  return { ...f, cfg, reader, workerState: state, log, receipt };
}
export { getDb };
