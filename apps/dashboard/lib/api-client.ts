export class DashboardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export async function dashboardRequest<T = any>(
  apiKey: string,
  apiBaseUrl: string,
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!/^wp_sk_[a-f0-9]{48}$/i.test(apiKey))
    throw new DashboardApiError(401, 'Invalid API key');
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new DashboardApiError(503, 'API unavailable');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new DashboardApiError(503, 'API unavailable');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(apiBaseUrl.replace(/\/$/, '') + path, {
      method,
      headers: {
        authorization: 'Bearer ' + apiKey,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (res.status === 401) throw new DashboardApiError(401, 'Invalid API key');
    if (!res.ok) {
      let code = 'request_failed';
      try {
        const b = await res.json();
        if (
          [
            'invalid_request',
            'invalid_webhook_url',
            'webhook_origin_not_approved',
            'rate_limited',
            'not_found',
            'webhook_not_configured',
          ].includes(b.error)
        )
          code = b.error;
      } catch {}
      throw new DashboardApiError(res.status, code);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (e) {
    if (e instanceof DashboardApiError) throw e;
    throw new DashboardApiError(503, 'API unavailable');
  } finally {
    clearTimeout(timer);
  }
}
export async function listPayments(
  apiKey: string,
  apiBaseUrl: string,
): Promise<any[]> {
  return (
    await dashboardRequest<{ data: any[] }>(apiKey, apiBaseUrl, '/v1/payments')
  ).data;
}
