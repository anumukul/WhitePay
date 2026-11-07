import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { customerFromToken } from './db/index';
export async function customer() {
  const token = (await cookies()).get('saas_customer')?.value;
  return customerFromToken(token);
}
export async function requireCustomer() {
  const c = await customer();
  if (!c) redirect('/');
  return c;
}
export function requestCustomer(req: Request) {
  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('saas_customer='))
    ?.slice('saas_customer='.length);
  return customerFromToken(token);
}
