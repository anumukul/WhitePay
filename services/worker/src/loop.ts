import { randomUUID } from 'node:crypto';
import { hashTypedData, decodeEventLog, parseAbi, type Hex } from 'viem';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import type { SettledLog } from '@whitepay/chain';
import { getDb, transaction } from './db.js';
import { buildPaymentSucceededEvent } from './events.js';
import type { WorkerConfig, WorkerReader, WorkerReceipt } from './types.js';
const TOKEN = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7';
const same = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
function matches(
  log: SettledLog,
  quote: any,
  receipt: WorkerReceipt,
  cfg: WorkerConfig,
) {
  const o = quote.order_payload,
    td = quote.order_typed_data;
  if (
    receipt.status !== 'success' ||
    !same(receipt.transactionHash, log.txHash) ||
    receipt.blockNumber !== log.blockNumber ||
    td.domain.chainId !== 1874 ||
    !same(td.domain.verifyingContract, cfg.checkoutAddress) ||
    hashTypedData(td) !== quote.order_digest
  )
    return false;
  for (const field of [
    'orderId',
    'payer',
    'merchant',
    'token',
    'amount',
    'fee',
    'feeRecipient',
    'quoteId',
  ] as const)
    if (!same(log[field], o[field])) return false;
  if (!same(log.token, TOKEN)) return false;
  try {
    const indexed = receipt.logs.find((l) => l.logIndex === log.logIndex);
    if (!indexed || !same(indexed.address, cfg.checkoutAddress)) return false;
    const settled = receipt.logs
      .filter((l) => same(l.address, cfg.checkoutAddress))
      .map((l) =>
        decodeEventLog({
          abi: whitepayCheckoutAbi,
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
        }),
      )
      .filter((e) => e.eventName === 'PaymentSettled');
    if (settled.length !== 1) return false;
    for (const field of [
      'orderId',
      'payer',
      'merchant',
      'token',
      'amount',
      'fee',
      'feeRecipient',
      'quoteId',
    ] as const)
      if (!same((settled[0].args as any)[field], o[field])) return false;
    const erc = parseAbi([
      'event Transfer(address indexed from,address indexed to,uint256 value)',
      'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
    ]);
    const events = receipt.logs
      .filter((l) => same(l.address, TOKEN))
      .map((l) =>
        decodeEventLog({
          abi: erc,
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
        }),
      );
    const auth = events.filter((e) => e.eventName === 'AuthorizationUsed');
    if (
      auth.length !== 1 ||
      !same(auth[0].args.authorizer, o.payer) ||
      auth[0].args.nonce !== quote.order_digest
    )
      return false;
    const transfers = events.filter((e) => e.eventName === 'Transfer');
    const expected = [
      [o.payer, cfg.checkoutAddress, BigInt(o.amount) + BigInt(o.fee)],
      [cfg.checkoutAddress, o.merchant, BigInt(o.amount)],
      ...(BigInt(o.fee) > 0n
        ? [[cfg.checkoutAddress, o.feeRecipient, BigInt(o.fee)]]
        : []),
    ];
    return (
      transfers.length === expected.length &&
      expected.every(
        ([from, to, value], i) =>
          same(transfers[i].args.from, from) &&
          same(transfers[i].args.to, to) &&
          transfers[i].args.value === value,
      )
    );
  } catch {
    return false;
  }
}
export async function scanAndPersist(cfg: WorkerConfig, reader: WorkerReader) {
  if (
    cfg.chainId !== 1874 ||
    (await reader.chainId()) !== 1874 ||
    !Number.isSafeInteger(cfg.fromBlock) ||
    cfg.fromBlock < 0 ||
    !Number.isSafeInteger(cfg.confirmations) ||
    cfg.confirmations < 1
  )
    throw new Error('invalid_worker_configuration');
  const batch = cfg.batchSize ?? 500;
  if (!Number.isSafeInteger(batch) || batch < 1 || batch > 2000)
    throw new Error('invalid_batch_size');
  const lock = await getDb().connect();
  let acquired = false;
  try {
    acquired = (
      await lock.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
        ['scan:' + cfg.scope],
      )
    ).rows[0].locked;
    if (!acquired)
      return {
        processed: 0,
        persisted: 0,
        advancedTo: null,
        duplicates: 0,
        rejected: 0,
        unmatched: 0,
      };
    const old = (
      await getDb().query('SELECT * FROM chain_cursors WHERE scope=$1', [
        cfg.scope,
      ])
    ).rows[0];
    if (
      old &&
      (old.chain_id !== 1874 || !same(old.checkout, cfg.checkoutAddress))
    )
      throw new Error('cursor_scope_mismatch');
    const cursor = old ? Number(old.last_block) : cfg.fromBlock - 1;
    if (old && old.last_block_hash !== (await reader.getBlockHash(cursor)))
      throw new Error('chain_reorg_requires_review');
    const safeHead = (await reader.getHead()) - cfg.confirmations + 1,
      from = cursor + 1,
      to = Math.min(from + batch - 1, safeHead);
    if (from > to)
      return {
        processed: 0,
        persisted: 0,
        advancedTo: cursor,
        duplicates: 0,
        rejected: 0,
        unmatched: 0,
      };
    const logs = await reader.getLogs(from, to),
      endHash = await reader.getBlockHash(to);
    const receipts = new Map<string, WorkerReceipt>();
    for (const log of logs) {
      if (log.blockNumber < from || log.blockNumber > to)
        throw new Error('log_outside_scan_range');
      if (!receipts.has(log.txHash)) {
        const r = await reader.getReceipt(log.txHash);
        if (!r) throw new Error('receipt_unavailable');
        if (r.blockHash !== (await reader.getBlockHash(log.blockNumber)))
          throw new Error('noncanonical_receipt');
        receipts.set(log.txHash, r);
      }
    }
    return await transaction(async (c) => {
      let persisted = 0,
        duplicates = 0,
        rejected = 0,
        unmatched = 0;
      for (const log of logs) {
        const receipt = receipts.get(log.txHash)!;
        const eventId = `1874:${log.txHash.toLowerCase()}:${log.logIndex}`;
        const inserted = await c.query(
          "INSERT INTO settlement_events(event_id,chain_id,checkout,tx_hash,log_index,block_number,block_hash,payload,state) VALUES($1,1874,$2,$3,$4,$5,$6,$7,'unmatched') ON CONFLICT DO NOTHING RETURNING event_id",
          [
            eventId,
            cfg.checkoutAddress.toLowerCase(),
            log.txHash,
            log.logIndex,
            log.blockNumber,
            receipt.blockHash,
            json(log),
          ],
        );
        if (!inserted.rowCount) {
          duplicates++;
          continue;
        }
        const rows = (
          await c.query(
            `SELECT q.*,s.merchant_id,s.session_id FROM submission_quotes q JOIN submissions s ON s.id=q.submission_id WHERE lower(q.order_payload->>'orderId')=$1 AND lower(q.order_payload->>'payer')=$2 AND lower(q.order_payload->>'quoteId')=$3`,
            [
              log.orderId.toLowerCase(),
              log.payer.toLowerCase(),
              log.quoteId.toLowerCase(),
            ],
          )
        ).rows;
        if (rows.length !== 1) {
          unmatched++;
          continue;
        }
        const quote = rows[0];
        if (!matches(log, quote, receipt, cfg)) {
          rejected++;
          await c.query(
            "UPDATE settlement_events SET state='rejected',reason='receipt_or_quote_mismatch' WHERE event_id=$1",
            [eventId],
          );
          continue;
        }
        const session = (
          await c.query(
            'SELECT status FROM checkout_sessions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
            [quote.session_id, quote.merchant_id],
          )
        ).rows[0];
        if (
          !session ||
          session.status !== 'open' ||
          (
            await c.query('SELECT id FROM payments WHERE session_id=$1', [
              quote.session_id,
            ])
          ).rowCount
        ) {
          rejected++;
          await c.query(
            "UPDATE settlement_events SET state='conflict',reason='session_already_closed' WHERE event_id=$1",
            [eventId],
          );
          continue;
        }
        const paymentId = 'pay_' + randomUUID();
        await c.query(
          "INSERT INTO payments(id,merchant_id,session_id,status,amount_minor,tx_hash,block_number,created_at) VALUES($1,$2,$3,'succeeded',$4,$5,$6,$7)",
          [
            paymentId,
            quote.merchant_id,
            quote.session_id,
            log.amount.toString(),
            log.txHash,
            log.blockNumber,
            Date.now(),
          ],
        );
        await c.query(
          "UPDATE submissions SET status='settled',tx_hash=$1,updated_at=$2 WHERE id=$3",
          [log.txHash, Date.now(), quote.submission_id],
        );
        await c.query(
          "UPDATE checkout_sessions SET status='settled' WHERE id=$1",
          [quote.session_id],
        );
        await c.query(
          "UPDATE settlement_events SET state='matched',payment_id=$1 WHERE event_id=$2",
          [paymentId, eventId],
        );
        const merchant = (
          await c.query('SELECT webhook_url FROM merchants WHERE id=$1', [
            quote.merchant_id,
          ])
        ).rows[0];
        if (merchant?.webhook_url) {
          const event = buildPaymentSucceededEvent({
            eventId,
            log,
            paymentId,
            sessionId: quote.session_id,
            merchantId: quote.merchant_id,
            chainId: 1874,
          });
          await c.query(
            'INSERT INTO webhook_outbox(id,event_id,payment_id,merchant_id,url,payload,next_attempt_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',
            [
              randomUUID(),
              eventId,
              paymentId,
              quote.merchant_id,
              merchant.webhook_url,
              JSON.stringify(event),
              Date.now(),
            ],
          );
        }
        persisted++;
      }
      if (endHash !== (await reader.getBlockHash(to)))
        throw new Error('chain_changed_during_scan');
      await c.query(
        'INSERT INTO chain_cursors VALUES($1,1874,$2,$3,$4) ON CONFLICT(scope) DO UPDATE SET last_block=EXCLUDED.last_block,last_block_hash=EXCLUDED.last_block_hash',
        [cfg.scope, cfg.checkoutAddress.toLowerCase(), to, endHash],
      );
      return {
        processed: logs.length,
        persisted,
        advancedTo: to,
        duplicates,
        rejected,
        unmatched,
      };
    });
  } finally {
    if (acquired)
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
        'scan:' + cfg.scope,
      ]);
    lock.release();
  }
}
