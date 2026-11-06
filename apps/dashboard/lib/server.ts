import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardSession } from './session';
import { dashboardRequest, DashboardApiError } from './api-client';
export async function credentials() {
  const token = (await cookies()).get('whitepay_dashboard')?.value;
  const s = getDashboardSession(token);
  if (!s || !token) redirect('/');
  return { token, apiKey: s.apiKey };
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const s = await credentials();
  try {
    return await dashboardRequest<T>(
      s.apiKey,
      process.env.WHITEPAY_API_URL ?? 'http://localhost:3001',
      path,
      body,
      method,
    );
  } catch (e) {
    if (e instanceof DashboardApiError && e.status === 401)
      redirect('/?error=expired');
    throw e;
  }
}
export const usdt = (minor: number) => {
  const amount = BigInt(minor),
    whole = amount / 1000000n,
    fraction = (amount % 1000000n)
      .toString()
      .padStart(6, '0')
      .replace(/0+$/, '');
  return `${whole}${fraction ? '.' + fraction : ''} USDT`;
};
