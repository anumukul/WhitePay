export class DashboardApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function listPayments(apiKey: string, apiBaseUrl: string): Promise<unknown[]> {
  const res = await fetch(`${apiBaseUrl}/v1/payments`, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new DashboardApiError(401, "Invalid API key");
  if (!res.ok) throw new DashboardApiError(res.status, `API error ${res.status}`);
  const body = (await res.json()) as { data: unknown[] };
  return body.data;
}
