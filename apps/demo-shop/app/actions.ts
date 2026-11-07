'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCustomer, createOrder, bindSession } from '../lib/db/index';
import { requireCustomer } from '../lib/customer';
import { client } from '../lib/payments/whitepay-adapter';
import { PRODUCT_PRICE_MINOR } from '../lib/product';
export async function startCustomer() {
  const c = createCustomer();
  const base = process.env.APP_BASE_URL ?? 'http://localhost:3400';
  (await cookies()).set('shop_customer', c.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: base.startsWith('https://'),
    path: '/',
    maxAge: 86400,
  });
  redirect('/checkout');
}
export async function buyTemplate() {
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
      price.amountMinor !== PRODUCT_PRICE_MINOR ||
      price.currency !== 'USDT' ||
      price.tokenAddress.toLowerCase() !==
        '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7'
    )
      throw new Error('price_mismatch');
    const order = createOrder(c.id, merchant.id);
    const session = await wp.checkout.createSession(
      { priceId, externalOrderId: order.id, customerReference: c.id },
      { idempotencyKey: order.id },
    );
    if (session.amountMinor !== PRODUCT_PRICE_MINOR)
      throw new Error('session_mismatch');
    bindSession(order.id, c.id, session.id);
    target = '/checkout/' + order.id;
  } catch {
    redirect('/checkout?error=configuration');
  }
  redirect(target);
}
