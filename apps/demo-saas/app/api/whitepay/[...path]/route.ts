import { createCheckoutFetchBridge } from '@whitepay/node';
import { client } from '../../../../lib/payments/whitepay-adapter';
import { requestCustomer } from '../../../../lib/customer';
import { ownsSession } from '../../../../lib/db/index';
export const runtime = 'nodejs';
function handler(req: Request) {
  return createCheckoutFetchBridge({
    whitepay: client(),
    origin: process.env.APP_BASE_URL ?? 'http://localhost:3300',
    checkoutAddress: '0x4d1761abb4ed290f23fcda00890039800e2e53f0',
    feeRecipient:
      process.env.WHITEPAY_FEE_RECIPIENT ??
      '0x2F51C76D37BA9118ce8D5b9377329965ddb411c2',
    feeBasisPoints: 10,
    authorizeSession: async (r, id) => {
      const c = await requestCustomer(r);
      return !!c && (await ownsSession(c.id, id));
    },
  })(req);
}
export const GET = handler;
export const POST = handler;
