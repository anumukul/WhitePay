'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createCustomer, createOrder, bindSession } from '../lib/db/index';
import { requireCustomer } from '../lib/customer';
import { client } from '../lib/payments/whitepay-adapter';
import { spendOneCredit } from '../lib/db/entitlements';
export async function startCustomer() {
  const c = await createCustomer();
  (await cookies()).set('saas_customer', c.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400,
  });
  redirect('/checkout');
}
export async function buyCredits() {
  const c = await requireCustomer();
  let target: string;
  try {
    const wp = client(),
      priceId = process.env.WHITEPAY_PRICE_ID;
    if (!priceId) throw new Error('price_not_configured');
    const [merchant, price] = await Promise.all([
      wp.merchant.retrieve(),
      wp.prices.retrieve(priceId),
    ]);
    if (
      price.amountMinor !== 5000000 ||
      price.currency !== 'USDT' ||
      price.tokenAddress.toLowerCase() !==
        '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7'
    )
      throw new Error('price_mismatch');
    const order = await createOrder(c.id, merchant.id);
    const session = await wp.checkout.createSession(
      { priceId, externalOrderId: order.id, customerReference: c.id },
      { idempotencyKey: order.id },
    );
    if (session.amountMinor !== 5000000) throw new Error('session_mismatch');
    await bindSession(order.id, c.id, session.id);
    target = '/checkout/' + order.id;
  } catch {
    redirect('/checkout?error=configuration');
  }
  redirect(target);
}
export async function spend() {
  const c = await requireCustomer();
  await spendOneCredit(c.id);
  revalidatePath('/credits');
}
