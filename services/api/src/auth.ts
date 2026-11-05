import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db.js";

const KEY_PREFIX = "wp_sk_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function mintApiKey(merchantId: string): { id: string; secret: string; prefix: string } {
  const db = getDb();
  const id = `ak_${randomBytes(12).toString("hex")}`;
  const raw = randomBytes(24).toString("hex");
  const secret = `${KEY_PREFIX}${raw}`;
  const prefix = secret.slice(0, 10);
  db.prepare(
    `INSERT INTO api_keys (id, merchant_id, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, merchantId, hashKey(secret), prefix, Date.now());
  return { id, secret, prefix };
}

export function authenticate(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  if (!match) return null;
  const key = match[1].trim();
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = getDb()
    .prepare("SELECT merchant_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashKey(key)) as { merchant_id: string } | undefined;
  return row?.merchant_id ?? null;
}
