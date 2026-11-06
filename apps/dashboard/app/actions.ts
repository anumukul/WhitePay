'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, credentials } from '../lib/server';
import { deleteDashboardSession } from '../lib/session';
const value = (f: FormData, name: string) => String(f.get(name) ?? '').trim();
async function action(
  path: string,
  body: unknown,
  target: string,
  method?: string,
) {
  try {
    await api(path, body, method);
  } catch {
    redirect(target + '?error=request');
  }
  redirect(target);
}
export async function logout() {
  const c = await cookies();
  deleteDashboardSession(c.get('whitepay_dashboard')?.value);
  c.delete('whitepay_dashboard');
  c.delete('dashboard_api_key');
  redirect('/');
}
export async function createProduct(form: FormData) {
  await action('/v1/products', { name: value(form, 'name') }, '/products');
}
export async function renameProduct(form: FormData) {
  const id = value(form, 'id');
  if (!/^prod_[a-z0-9]+$/i.test(id)) redirect('/products?error=request');
  await action(
    '/v1/products/' + id,
    { name: value(form, 'name') },
    '/products',
    'PATCH',
  );
}
export async function createPrice(form: FormData) {
  const raw = value(form, 'amountMinor');
  if (!/^\d+$/.test(raw)) redirect('/products?error=request');
  await action(
    '/v1/prices',
    {
      productId: value(form, 'productId'),
      amountMinor: Number(raw),
      currency: 'USDT',
      tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    },
    '/products',
  );
}
export async function renameMerchant(form: FormData) {
  await action(
    '/v1/merchant',
    { name: value(form, 'name') },
    '/settings',
    'PATCH',
  );
}
export type SettingsResult = {
  secret?: string;
  message?: string;
  error?: string;
};
export async function newApiKey(
  _state: SettingsResult,
  _form: FormData,
): Promise<SettingsResult> {
  try {
    await credentials();
    const result = await api('/v1/api-keys', {});
    revalidatePath('/settings');
    return {
      secret: result.secret,
      message: 'New API key. Copy securely now; it is shown once.',
    };
  } catch {
    return { error: 'Could not create an API key.' };
  }
}
export async function revokeApiKey(form: FormData) {
  const id = value(form, 'id');
  if (!/^ak_[a-z0-9]+$/i.test(id)) redirect('/settings?error=request');
  await action('/v1/api-keys/' + id + '/revoke', {}, '/settings');
}
export async function saveWebhook(
  _state: SettingsResult,
  form: FormData,
): Promise<SettingsResult> {
  try {
    await credentials();
    const result = await api('/v1/webhook-endpoints', {
      url: value(form, 'url'),
      rotateSecret: form.get('rotateSecret') === 'on',
    });
    return {
      secret: result.signingSecret,
      message: result.signingSecret
        ? 'Webhook saved. Copy the signing secret securely now; it is shown once.'
        : 'Webhook saved.',
    };
  } catch {
    return { error: 'Webhook could not be saved. Check the destination URL.' };
  }
}
export async function sendWebhookTest(
  _state: SettingsResult,
  _form: FormData,
): Promise<SettingsResult> {
  try {
    await credentials();
    const result = await api('/v1/webhook-endpoints/test', {});
    revalidatePath('/settings');
    return {
      message: result.delivered
        ? 'Delivered successfully.'
        : `Delivery failed (status ${result.responseStatus}).`,
    };
  } catch {
    return {
      message:
        'Test delivery was blocked or failed. This destination may need administrator approval.',
    };
  }
}
