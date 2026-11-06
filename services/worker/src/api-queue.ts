// Settlement mutations are exclusively owned by the validated transactional indexer.
import { getDb } from './db.js';
export async function countPaymentsForMerchant(merchantId: string) {
  return Number(
    (
      await getDb().query(
        'SELECT count(*) FROM payments WHERE merchant_id=$1',
        [merchantId],
      )
    ).rows[0].count,
  );
}
