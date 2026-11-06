import type { SettledLog } from '@whitepay/chain';

export interface PaymentSucceededEvent {
  id: string;
  type: 'payment.succeeded';
  data: {
    orderId: string;
    paymentId: string;
    sessionId: string;
    merchantId: string;
    amountMinor: string;
    fee: string;
    currency: 'USDT';
    txHash: string;
    blockNumber: number;
    chainId: number;
    token: string;
    quoteId: string;
  };
}

export function buildPaymentSucceededEvent(input: {
  eventId: string;
  log: SettledLog;
  paymentId: string;
  sessionId: string;
  merchantId: string;
  chainId: number;
}): PaymentSucceededEvent {
  return {
    id: input.eventId,
    type: 'payment.succeeded',
    data: {
      orderId: input.log.orderId,
      paymentId: input.paymentId,
      sessionId: input.sessionId,
      merchantId: input.merchantId,
      amountMinor: input.log.amount.toString(),
      fee: input.log.fee.toString(),
      currency: 'USDT',
      txHash: input.log.txHash,
      blockNumber: input.log.blockNumber,
      chainId: input.chainId,
      token: input.log.token,
      quoteId: input.log.quoteId,
    },
  };
}
