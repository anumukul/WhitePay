import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 ||
      (a === 192 && b === 0) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase(),
      first = parseInt(lower.split(':')[0] || '0', 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !lower.startsWith('2001:db8:') &&
      !lower.startsWith('2001:0:') &&
      !lower.startsWith('2002:')
    );
  }
  return false;
}
const loopback = (host: string) =>
  host === '127.0.0.1' || host === '::1' || host === 'localhost';
export function validateDestination(
  url: string,
  allowedOrigins: string[],
  allowLocal = false,
): URL {
  const parsed = new URL(url),
    host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !allowedOrigins.includes(parsed.origin)
  )
    throw new Error('webhook_origin_not_approved');
  if (
    parsed.protocol !== 'https:' &&
    !(allowLocal && parsed.protocol === 'http:' && loopback(host))
  )
    throw new Error('webhook_requires_https');
  if (isIP(host) && !isPublicAddress(host) && !(allowLocal && loopback(host)))
    throw new Error('webhook_private_destination');
  return parsed;
}
export function safeWebhookFetch(allowedOrigins: string[], allowLocal = false) {
  return async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    const parsed = validateDestination(url, allowedOrigins, allowLocal);
    return new Promise<{ ok: boolean; status: number }>((resolve, reject) => {
      const request = (parsed.protocol === 'https:' ? https : http).request(
        parsed,
        {
          method: init.method,
          headers: init.headers,
          timeout: 5000,
          signal: AbortSignal.timeout(5000),
          lookup: (async (host: string, options: any, callback: any) => {
            try {
              const addresses = await lookup(host, { all: true });
              const safe = addresses.filter(
                (a) =>
                  isPublicAddress(a.address) ||
                  (allowLocal && loopback(a.address)),
              );
              if (!safe.length) throw new Error('webhook_private_destination');
              if (options?.all) callback(null, safe);
              else callback(null, safe[0].address, safe[0].family);
            } catch {
              callback(new Error('webhook_dns_rejected'));
            }
          }) as any,
        },
        (response) => {
          response.resume();
          resolve({
            ok:
              response.statusCode !== undefined &&
              response.statusCode >= 200 &&
              response.statusCode < 300,
            status: response.statusCode ?? 0,
          });
        },
      );
      request.once('timeout', () =>
        request.destroy(new Error('webhook_timeout')),
      );
      request.once('error', () => reject(new Error('webhook_network_failure')));
      request.end(init.body);
    });
  };
}
