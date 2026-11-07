import { requestCustomer } from '../../../lib/customer';
import { creditBalance } from '../../../lib/db/entitlements';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const c = await requestCustomer(req);
  if (!c) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(
    { credits: await creditBalance(c.id) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
