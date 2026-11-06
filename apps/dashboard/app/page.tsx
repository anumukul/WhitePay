import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { dashboardRequest } from '../lib/api-client';
import {
  createDashboardSession,
  dashboardCookieOptions,
  getDashboardSession,
} from '../lib/session';
export const dynamic = 'force-dynamic';
async function login(form: FormData) {
  'use server';
  const key = String(form.get('apiKey') ?? '').trim();
  try {
    await dashboardRequest(
      key,
      process.env.WHITEPAY_API_URL ?? 'http://localhost:3001',
      '/v1/merchant',
    );
  } catch {
    redirect('/?error=auth');
  }
  const token = createDashboardSession(key),
    c = await cookies();
  c.delete('dashboard_api_key');
  c.set('whitepay_dashboard', token, dashboardCookieOptions());
  redirect('/payments');
}
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const c = await cookies();
  if (getDashboardSession(c.get('whitepay_dashboard')?.value))
    redirect('/payments');
  const error = (await searchParams).error;
  return (
    <main>
      <h1>Merchant sign in</h1>
      <p>Use your merchant API key. It stays on the dashboard server.</p>
      {error && (
        <p role="alert">Sign in again with a valid merchant API key.</p>
      )}
      <form action={login}>
        <label htmlFor="apiKey">API key</label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          required
        />
        <button type="submit">Sign in</button>
      </form>
      <p>Whitechain Sepolia testnet only.</p>
    </main>
  );
}
