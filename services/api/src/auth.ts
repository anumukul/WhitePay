import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './db.js';
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
export async function mintApiKey(merchantId: string, expiresAt?: number) {
  if (
    expiresAt !== undefined &&
    (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
  )
    throw new Error('Expiry must be in the future');
  const id = `ak_${randomBytes(12).toString('hex')}`,
    secret = `wp_sk_${randomBytes(24).toString('hex')}`,
    prefix = secret.slice(0, 10);
  await getDb().query(
    'INSERT INTO api_keys(id,merchant_id,key_hash,prefix,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id, merchantId, hashKey(secret), prefix, Date.now(), expiresAt ?? null],
  );
  return { id, secret, prefix };
}
export async function authenticate(
  header: string | undefined,
): Promise<string | null> {
  const key = /^Bearer\s+(wp_sk_[a-f0-9]{48})$/i.exec(header ?? '')?.[1];
  if (!key) return null;
  return (
    (
      await getDb().query(
        'SELECT merchant_id FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$2)',
        [hashKey(key), Date.now()],
      )
    ).rows[0]?.merchant_id ?? null
  );
}
