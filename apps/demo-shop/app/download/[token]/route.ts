import { requestCustomer } from '../../../lib/customer';
import { redeemDownload } from '../../../lib/db/entitlements';
export const runtime = 'nodejs';
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const c = requestCustomer(req);
  if (!c) return Response.json({ error: 'not_found' }, { status: 404 });
  const result = redeemDownload((await params).token, c.id);
  if (!result) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(result.content, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'cache-control': 'no-store',
    },
  });
}
