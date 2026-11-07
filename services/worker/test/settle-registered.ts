// Controlled test chain only: settle a genuinely signed API submission through the real worker.
import {
  keccak256,
  toHex,
  parseAbi,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from 'viem';
import { getDb } from '@whitepay/api/src/db.js';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import { scanAndPersist } from '../src/loop.js';
export async function settleRegisteredSubmission(submissionId: string) {
  const row = (
    await getDb().query(
      "SELECT * FROM submissions WHERE id=$1 AND status='queued'",
      [submissionId],
    )
  ).rows[0];
  if (!row) throw new Error('queued_test_submission_required');
  const o = row.order_payload,
    checkout = row.order_typed_data.domain.verifyingContract;
  const hash = keccak256(toHex('controlled-test:' + row.order_digest)),
    blockHash = keccak256(toHex('controlled-block:' + row.order_digest));
  const erc = parseAbi([
    'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
    'event Transfer(address indexed from,address indexed to,uint256 value)',
  ]);
  const logs: any[] = [
    {
      address: o.token,
      topics: encodeEventTopics({
        abi: erc,
        eventName: 'AuthorizationUsed',
        args: { authorizer: o.payer, nonce: row.order_digest },
      }),
      data: '0x',
    },
  ];
  for (const [from, to, value] of [
    [o.payer, checkout, BigInt(o.amount) + BigInt(o.fee)],
    [checkout, o.merchant, BigInt(o.amount)],
    [checkout, o.feeRecipient, BigInt(o.fee)],
  ])
    if (value !== 0n)
      logs.push({
        address: o.token,
        topics: encodeEventTopics({
          abi: erc,
          eventName: 'Transfer',
          args: { from: from as Hex, to: to as Hex },
        }),
        data: encodeAbiParameters(parseAbiParameters('uint256'), [
          value as bigint,
        ]),
      });
  const logIndex = logs.length;
  logs.push({
    address: checkout,
    topics: encodeEventTopics({
      abi: whitepayCheckoutAbi,
      eventName: 'PaymentSettled',
      args: { orderId: o.orderId, payer: o.payer, merchant: o.merchant },
    }),
    data: encodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,address,bytes32'),
      [o.token, BigInt(o.amount), BigInt(o.fee), o.feeRecipient, o.quoteId],
    ),
  });
  const receipt = {
    status: 'success' as const,
    transactionHash: hash,
    blockNumber: 1000,
    blockHash,
    logs: logs.map((l, i) => ({ ...l, logIndex: i })),
  };
  const event = {
    ...o,
    amount: BigInt(o.amount),
    fee: BigInt(o.fee),
    txHash: hash,
    blockNumber: 1000,
    logIndex,
  };
  const result = await scanAndPersist(
    {
      scope: 'controlled-test:' + row.order_digest,
      chainId: 1874,
      checkoutAddress: checkout,
      fromBlock: 1000,
      confirmations: 2,
    },
    {
      chainId: async () => 1874,
      getHead: async () => 1001,
      getBlockHash: async () => blockHash,
      getLogs: async () => [event],
      getReceipt: async () => receipt,
    },
  );
  if (result.persisted !== 1) throw new Error('controlled_worker_test_failed');
  return hash;
}
