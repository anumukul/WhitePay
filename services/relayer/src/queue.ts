import { getDb } from './db.js';
export async function pollQueued(limit = 10, submissionId?: string) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid queue batch');
  return (
    await getDb().query(
      `SELECT sub.*, s.amount_minor,s.currency,s.token_address,s.payout_address,s.status AS session_status
 FROM submissions sub JOIN checkout_sessions s ON s.id=sub.session_id AND s.merchant_id=sub.merchant_id
 WHERE sub.status='queued' AND sub.order_signature IS NOT NULL AND sub.token_signature IS NOT NULL
 AND ($2::text IS NULL OR sub.id=$2)
 ORDER BY sub.created_at,sub.id LIMIT $1`,
      [limit, submissionId ?? null],
    )
  ).rows;
}
export async function markFailed(id: string, reason: string) {
  await getDb().query(
    "UPDATE submissions SET status='failed',error_reason=$1,updated_at=$2 WHERE id=$3 AND status='queued'",
    [reason, Date.now(), id],
  );
}
