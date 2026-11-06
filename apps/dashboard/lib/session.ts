import { createHash, randomBytes } from 'node:crypto';
type Store = Map<string, { apiKey: string; expiresAt: number }>;
const runtime = globalThis as typeof globalThis & {
  whitepayDashboardSessions?: Store;
};
const sessions =
  runtime.whitepayDashboardSessions ??
  (runtime.whitepayDashboardSessions = new Map());
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const lifetime = 8 * 60 * 60 * 1000;
export function createDashboardSession(apiKey: string, now = Date.now()) {
  for (const [key, s] of sessions) if (s.expiresAt <= now) sessions.delete(key);
  if (sessions.size >= 1000) throw new Error('session_capacity');
  const token = randomBytes(32).toString('hex');
  sessions.set(hash(token), { apiKey, expiresAt: now + lifetime });
  return token;
}
export function getDashboardSession(
  token: string | undefined,
  now = Date.now(),
) {
  if (!token) return null;
  const key = hash(token),
    s = sessions.get(key);
  if (!s || s.expiresAt <= now) {
    sessions.delete(key);
    return null;
  }
  return { apiKey: s.apiKey };
}
export function deleteDashboardSession(token: string | undefined) {
  if (token) sessions.delete(hash(token));
}
export const dashboardCookieOptions = (
  production = process.env.NODE_ENV === 'production',
) => ({
  httpOnly: true,
  secure: production,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: lifetime / 1000,
});
