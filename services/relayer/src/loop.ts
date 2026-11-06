import { getDb } from './db.js';
import { pollQueued, markFailed } from './queue.js';
import { submit, recover } from './submit.js';
import type {
  RelayerConfig,
  ChainAdapter,
  LoopResult,
  ApprovedPayment,
} from './types.js';
const SAFE = new Set([
  'invalid_configuration',
  'session_not_open',
  'token_mismatch',
  'payer_mismatch',
  'merchant_mismatch',
  'amount_mismatch',
  'fee_mismatch',
  'time_expired',
  'domain_mismatch',
  'stored_quote_mismatch',
  'authorization_mismatch',
  'invalid_signature',
  'wrong_chain',
  'gas_exceeded',
  'gas_price_exceeded',
  'unknown_pending_nonce',
  'l1_fee_exceeded',
  'budget_exceeded',
  'insufficient_relayer_balance',
]);
export async function runOnce(
  cfg: RelayerConfig,
  chain: ChainAdapter,
  batch = 10,
  approval?: ApprovedPayment,
  submissionId?: string,
): Promise<LoopResult> {
  const lock = await getDb().connect();
  const key = `relay:${cfg.expectedChainId}:${chain.relayerAddress.toLowerCase()}`;
  let acquired = false;
  try {
    acquired = (
      await lock.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
        [key],
      )
    ).rows[0].locked;
    if (!acquired) return { processed: 0, details: [] };
    const attempt = (
      await getDb().query(
        "SELECT * FROM relay_attempts WHERE chain_id=$1 AND relayer=$2 AND state IN ('reserved','signed','pending','quarantined') ORDER BY nonce LIMIT 1",
        [cfg.expectedChainId, chain.relayerAddress.toLowerCase()],
      )
    ).rows[0];
    if (attempt) {
      if (submissionId && attempt.submission_id !== submissionId)
        return {
          processed: 0,
          details: [
            {
              id: attempt.submission_id,
              status: 'pending',
              reason: 'another_attempt_requires_reconciliation',
            },
          ],
        };
      const row = (
        await getDb().query(
          'SELECT sub.*,s.status AS session_status,s.amount_minor,s.payout_address,s.token_address FROM submissions sub JOIN checkout_sessions s ON s.id=sub.session_id WHERE sub.id=$1',
          [attempt.submission_id],
        )
      ).rows[0];
      try {
        return {
          processed: 1,
          details: [await recover(attempt, row, cfg, chain)],
        };
      } catch {
        return {
          processed: 1,
          details: [
            {
              id: row.id,
              status: 'pending',
              reason: 'recovery_requires_review',
            },
          ],
        };
      }
    }
    if (cfg.mode === 'reconcile') return { processed: 0, details: [] };
    const row = (await pollQueued(batch, submissionId))[0];
    if (!row) return { processed: 0, details: [] };
    try {
      return {
        processed: 1,
        details: [await submit(row, cfg, chain, approval)],
      };
    } catch (e) {
      const reason =
        e instanceof Error && SAFE.has(e.message)
          ? e.message
          : 'simulation_or_rpc_failure';
      const saved = (
        await getDb().query(
          'SELECT id FROM relay_attempts WHERE order_digest=$1',
          [row.order_digest],
        )
      ).rows[0];
      if (saved)
        return {
          processed: 1,
          details: [
            {
              id: row.id,
              status: 'pending',
              reason: 'durable_attempt_requires_recovery',
            },
          ],
        };
      if (cfg.mode === 'execute') await markFailed(row.id, reason);
      return {
        processed: 1,
        details: [{ id: row.id, status: 'failed', reason }],
      };
    }
  } finally {
    if (acquired)
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
        key,
      ]);
    lock.release();
  }
}
