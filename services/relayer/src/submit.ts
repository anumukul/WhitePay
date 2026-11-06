import { randomUUID } from 'node:crypto';
import {
  keccak256,
  serializeTransaction,
  parseTransaction,
  recoverTransactionAddress,
  decodeEventLog,
  parseAbi,
  type Hex,
  type TransactionSerializedEIP1559,
} from 'viem';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import { getDb } from './db.js';
import { validate } from './validate.js';
import { markFailed } from './queue.js';
import type {
  ApprovedPayment,
  ChainAdapter,
  RelayerConfig,
  UnsignedTransaction,
  Result,
  ReceiptEvidence,
} from './types.js';
const eq = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
const stringify = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
const hydrate = (v: any): UnsignedTransaction => ({
  ...v,
  gas: BigInt(v.gas),
  value: 0n,
  maxFeePerGas: BigInt(v.maxFeePerGas),
  maxPriorityFeePerGas: BigInt(v.maxPriorityFeePerGas),
});
const day = () => new Date().toISOString().slice(0, 10);
async function used(cfg: RelayerConfig, address: string) {
  return BigInt(
    (
      await getDb().query(
        'SELECT COALESCE(sum(reserved_wei+charged_wei),0) AS used FROM relay_attempts WHERE chain_id=$1 AND relayer=$2 AND budget_day=$3',
        [cfg.expectedChainId, address.toLowerCase(), day()],
      )
    ).rows[0].used,
  );
}
function receiptMatches(r: ReceiptEvidence, row: any, cfg: RelayerConfig) {
  try {
    const events = r.logs
      .filter((l) => eq(l.address, cfg.checkoutAddress))
      .map((l) =>
        decodeEventLog({
          abi: whitepayCheckoutAbi,
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
        }),
      )
      .filter((e) => e.eventName === 'PaymentSettled');
    if (events.length !== 1) return false;
    const args = events[0].args as any,
      o = row.order_payload;
    for (const key of [
      'orderId',
      'payer',
      'merchant',
      'token',
      'amount',
      'fee',
      'feeRecipient',
      'quoteId',
    ])
      if (!eq(args[key], o[key])) return false;
    const tokenEvents = r.logs.filter((l) => eq(l.address, cfg.tokenAddress));
    const transfers = tokenEvents.flatMap((l) => {
      try {
        const d = decodeEventLog({
          abi: parseAbi([
            'event Transfer(address indexed from,address indexed to,uint256 value)',
          ]),
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
        });
        return [d.args];
      } catch {
        return [];
      }
    });
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
          eq(transfers[i].from, from) &&
          eq(transfers[i].to, to) &&
          transfers[i].value === value,
      )
    );
  } catch {
    return false;
  }
}
export async function submit(
  row: any,
  cfg: RelayerConfig,
  chain: ChainAdapter,
  approval?: ApprovedPayment,
): Promise<Result> {
  const data = await validate(row, cfg, await chain.nowSeconds());
  if ((await chain.chainId()) !== 1874) throw new Error('wrong_chain');
  if (
    cfg.priorityFeeWei < 0n ||
    cfg.priorityFeeWei > cfg.maxGasPriceWei ||
    cfg.maxGasPriceWei <= 0n ||
    cfg.maxL1FeeWei < 0n ||
    cfg.dailyBudgetWei <= 0n ||
    cfg.maxGasPerSettle <= 0n ||
    cfg.minimumValiditySeconds < 1
  )
    throw new Error('invalid_configuration');
  const estimate = await chain.simulate(data),
    gas = (estimate * 120n + 99n) / 100n;
  if (estimate <= 0n || gas > cfg.maxGasPerSettle)
    throw new Error('gas_exceeded');
  const observedGasPrice = await chain.gasPrice();
  if (observedGasPrice > cfg.maxGasPriceWei)
    throw new Error('gas_price_exceeded');
  const nonce = await chain.getNonce('latest');
  if ((await chain.getNonce('pending')) !== nonce)
    throw new Error('unknown_pending_nonce');
  const tx: UnsignedTransaction = {
    type: 'eip1559',
    chainId: 1874,
    nonce,
    to: cfg.checkoutAddress,
    data,
    value: 0n,
    gas,
    maxFeePerGas: cfg.maxGasPriceWei,
    maxPriorityFeePerGas: cfg.priorityFeeWei,
  };
  const quotedL1 = await chain.l1Fee(tx);
  if (quotedL1 > cfg.maxL1FeeWei) throw new Error('l1_fee_exceeded');
  const reserve = gas * cfg.maxGasPriceWei + cfg.maxL1FeeWei,
    hash = keccak256(serializeTransaction(tx));
  if ((await used(cfg, chain.relayerAddress)) + reserve > cfg.dailyBudgetWei)
    throw new Error('budget_exceeded');
  const outstanding = BigInt(
    (
      await getDb().query(
        'SELECT COALESCE(sum(reserved_wei),0) AS amount FROM relay_attempts WHERE chain_id=$1 AND relayer=$2',
        [1874, chain.relayerAddress.toLowerCase()],
      )
    ).rows[0].amount,
  );
  if ((await chain.getRelayerBalance()) < outstanding + reserve)
    throw new Error('insufficient_relayer_balance');
  const preview: Result = {
    id: row.id,
    status: 'preview',
    unsignedHash: hash,
    gas: gas.toString(),
    reserveWei: reserve.toString(),
    transactionPreview: {
      nonce,
      gasLimit: gas.toString(),
      maxFeePerGasWei: tx.maxFeePerGas.toString(),
      maxPriorityFeePerGasWei: tx.maxPriorityFeePerGas.toString(),
      nativeValueWei: '0',
      calldataHash: keccak256(data),
      gasEstimate: estimate.toString(),
      quotedL1FeeWei: quotedL1.toString(),
      observedGasPriceWei: observedGasPrice.toString(),
    },
  };
  if (cfg.mode !== 'execute') return preview;
  if (
    !approval ||
    approval.chainId !== 1874 ||
    !eq(approval.relayer, chain.relayerAddress) ||
    !eq(approval.checkout, cfg.checkoutAddress) ||
    approval.orderDigest !== row.order_digest ||
    approval.unsignedHash !== hash
  )
    return { ...preview, reason: 'specific_approval_required' };
  // Commit the exact nonce, unsigned payload and conservative budget reservation before signing.
  const attempt = (
    await getDb().query(
      `INSERT INTO relay_attempts(id,submission_id,order_digest,chain_id,relayer,nonce,unsigned_tx,unsigned_hash,state,budget_day,reserved_wei,created_at,updated_at) VALUES($1,$2,$3,1874,$4,$5,$6,$7,'reserved',$8,$9,$10,$10) RETURNING *`,
      [
        randomUUID(),
        row.id,
        row.order_digest,
        chain.relayerAddress.toLowerCase(),
        nonce,
        stringify(tx),
        hash,
        day(),
        reserve.toString(),
        Date.now(),
      ],
    )
  ).rows[0];
  return recover(attempt, row, cfg, chain);
}
async function verifySigned(raw: Hex, unsignedHash: Hex, relayer: string) {
  if (!raw.startsWith('0x02')) throw new Error('signed_transaction_mismatch');
  const parsed = parseTransaction(raw as TransactionSerializedEIP1559);
  const { r, s, v, yParity, ...unsigned } = parsed;
  if (
    keccak256(serializeTransaction(unsigned)) !== unsignedHash ||
    !eq(
      await recoverTransactionAddress({
        serializedTransaction: raw as TransactionSerializedEIP1559,
      }),
      relayer,
    )
  )
    throw new Error('signed_transaction_mismatch');
}
export async function recover(
  attempt: any,
  row: any,
  cfg: RelayerConfig,
  chain: ChainAdapter,
): Promise<Result> {
  const id = row.id,
    tx = hydrate(attempt.unsigned_tx);
  if (
    !eq(attempt.relayer, chain.relayerAddress) ||
    attempt.chain_id !== 1874 ||
    !eq(tx.to, cfg.checkoutAddress) ||
    keccak256(serializeTransaction(tx)) !== attempt.unsigned_hash
  )
    throw new Error('attempt_integrity_error');
  if (tx.nonce !== Number(attempt.nonce))
    throw new Error('attempt_integrity_error');
  if (attempt.raw_transaction) {
    await verifySigned(
      attempt.raw_transaction,
      attempt.unsigned_hash,
      chain.relayerAddress,
    );
    if (keccak256(attempt.raw_transaction) !== attempt.tx_hash)
      throw new Error('attempt_integrity_error');
  }
  if (cfg.mode === 'preview')
    return {
      id,
      status: 'preview',
      unsignedHash: attempt.unsigned_hash,
      reason: 'recovery_requires_execute_mode',
    };
  if ((await chain.chainId()) !== 1874) throw new Error('wrong_chain');
  if (attempt.state === 'quarantined')
    return {
      id,
      status: 'quarantined',
      reason: attempt.reason ?? 'manual_reconciliation_required',
      txHash: attempt.tx_hash ?? undefined,
    };
  if (attempt.tx_hash) {
    const receipt = await chain.receipt(attempt.tx_hash);
    if (receipt) {
      if (
        !eq(receipt.transactionHash, attempt.tx_hash) ||
        receipt.gasUsed > tx.gas ||
        receipt.effectiveGasPrice > tx.maxFeePerGas ||
        receipt.l1Fee < 0n
      )
        throw new Error('receipt_integrity_error');
      const cost = receipt.gasUsed * receipt.effectiveGasPrice + receipt.l1Fee;
      const matched =
        receipt.status === 'success' && receiptMatches(receipt, row, cfg);
      const status = matched
        ? 'mined'
        : receipt.status === 'reverted'
          ? 'failed'
          : 'quarantined';
      const reason = matched
        ? null
        : receipt.status === 'reverted'
          ? 'transaction_reverted'
          : 'receipt_event_mismatch';
      // One transaction reconciles actual debit and API status. The indexer owns settled/fulfillment.
      const client = await getDb().connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE relay_attempts SET state=$1,reason=$2,reserved_wei=0,charged_wei=$3,updated_at=$4 WHERE id=$5',
          [status, reason, cost.toString(), Date.now(), attempt.id],
        );
        await client.query(
          'UPDATE submissions SET status=$1,tx_hash=$2,error_reason=$3,updated_at=$4 WHERE id=$5',
          [
            status === 'failed' ? 'failed' : 'submitted',
            attempt.tx_hash,
            reason,
            Date.now(),
            id,
          ],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return {
        id,
        status,
        txHash: attempt.tx_hash,
        reason: reason ?? undefined,
      };
    }
  }
  if (cfg.mode === 'reconcile')
    return {
      id,
      status: 'pending',
      reason: 'receipt_pending_no_rebroadcast',
      txHash: attempt.tx_hash ?? undefined,
    };
  if ((await chain.getNonce('latest')) > Number(attempt.nonce)) {
    if (attempt.tx_hash && (await chain.transactionKnown(attempt.tx_hash)))
      return {
        id,
        status: 'pending',
        reason: 'awaiting_receipt_confirmations',
        txHash: attempt.tx_hash,
      };
    await getDb().query(
      "UPDATE relay_attempts SET state='quarantined',reason='nonce_consumed_without_receipt' WHERE id=$1",
      [attempt.id],
    );
    return {
      id,
      status: 'quarantined',
      reason: 'nonce_consumed_without_receipt',
    };
  }
  async function stopAtCutoff(now: number): Promise<Result | undefined> {
    if (row.order_payload.validBefore > now + cfg.minimumValiditySeconds)
      return;
    if (attempt.broadcast_attempted)
      return {
        id,
        status: 'pending',
        reason: 'expired_broadcast_requires_reconciliation',
        txHash: attempt.tx_hash ?? undefined,
      };
    // This invocation has not called broadcast. Clear only its own pre-send marker.
    await getDb().query(
      "UPDATE relay_attempts SET state='failed',reserved_wei=0,broadcast_attempted=false,reason='time_expired' WHERE id=$1",
      [attempt.id],
    );
    await markFailed(id, 'time_expired');
    return { id, status: 'failed', reason: 'time_expired' };
  }
  const now = await chain.nowSeconds();
  const expired = await stopAtCutoff(now);
  if (expired) return expired;
  if ((await used(cfg, chain.relayerAddress)) > cfg.dailyBudgetWei)
    return {
      id,
      status: 'pending',
      reason: 'current_budget_rejects_saved_transaction',
    };
  if (day() !== attempt.budget_day)
    return {
      id,
      status: 'pending',
      reason: 'reservation_day_changed_manual_review',
    };
  // Never alter an approved payload during recovery, even if current caps/configuration changed.
  if (
    tx.maxFeePerGas > cfg.maxGasPriceWei ||
    tx.maxPriorityFeePerGas > cfg.priorityFeeWei ||
    tx.gas > cfg.maxGasPerSettle ||
    BigInt(attempt.reserved_wei) > cfg.dailyBudgetWei
  )
    return {
      id,
      status: 'pending',
      reason: 'current_limits_reject_saved_transaction',
    };
  if (!attempt.raw_transaction) {
    // A reserved attempt has never broadcast: revalidate quote/session before resuming signing.
    const data = await validate(row, cfg, now);
    if (data !== tx.data) throw new Error('saved_calldata_mismatch');
    if ((await chain.getNonce('pending')) !== Number(attempt.nonce))
      return { id, status: 'pending', reason: 'pending_nonce_changed' };
    const raw = await chain.sign(tx);
    await verifySigned(raw, attempt.unsigned_hash, chain.relayerAddress);
    attempt.raw_transaction = raw;
    attempt.tx_hash = keccak256(raw);
    // Persist signed bytes/hash before any network send. A restart can only resend these same bytes.
    const signedRecord = await getDb().query(
      "UPDATE relay_attempts SET raw_transaction=$1,tx_hash=$2,state='signed',updated_at=$3 WHERE id=$4 AND raw_transaction IS NULL RETURNING id",
      [raw, attempt.tx_hash, Date.now(), attempt.id],
    );
    if (signedRecord.rowCount !== 1) {
      const existing = (
        await getDb().query('SELECT * FROM relay_attempts WHERE id=$1', [
          attempt.id,
        ])
      ).rows[0];
      return recover(existing, row, cfg, chain);
    }
  }
  const pendingReserve = BigInt(
    (
      await getDb().query(
        'SELECT COALESCE(sum(reserved_wei),0) AS amount FROM relay_attempts WHERE chain_id=1874 AND relayer=$1',
        [chain.relayerAddress.toLowerCase()],
      )
    ).rows[0].amount,
  );
  if ((await chain.getRelayerBalance()) < pendingReserve)
    return {
      id,
      status: 'pending',
      reason: 'balance_below_reserved_budget',
      txHash: attempt.tx_hash,
    };
  // L1 fee is not protocol-capped. Recheck oracle against the reserved margin before each send.
  if (
    (await chain.l1Fee(tx, attempt.raw_transaction)) > cfg.maxL1FeeWei ||
    (await chain.gasPrice()) > tx.maxFeePerGas
  )
    return {
      id,
      status: 'pending',
      reason: 'fees_above_saved_limits',
      txHash: attempt.tx_hash,
    };
  // Signing may wait on a human password prompt; fee/balance RPC may also stall.
  // The earlier time check cannot authorize a send after either delay.
  const expiredAfterSigning = await stopAtCutoff(await chain.nowSeconds());
  if (expiredAfterSigning) return expiredAfterSigning;
  // Mark ambiguity durably before RPC: a timeout is never treated as definitely unbroadcast.
  await getDb().query(
    "UPDATE relay_attempts SET state='pending',broadcast_attempted=true,updated_at=$1 WHERE id=$2",
    [Date.now(), attempt.id],
  );
  const expiredAfterPersistence = await stopAtCutoff(await chain.nowSeconds());
  if (expiredAfterPersistence) return expiredAfterPersistence;
  try {
    const hash = await chain.broadcast(attempt.raw_transaction);
    if (!eq(hash, attempt.tx_hash)) throw new Error('broadcast_hash_mismatch');
  } catch {
    return {
      id,
      status: 'pending',
      reason: 'broadcast_outcome_unknown',
      txHash: attempt.tx_hash,
    };
  }
  await getDb().query(
    "UPDATE submissions SET status='submitted',tx_hash=$1,updated_at=$2 WHERE id=$3",
    [attempt.tx_hash, Date.now(), id],
  );
  return { id, status: 'submitted', txHash: attempt.tx_hash };
}
