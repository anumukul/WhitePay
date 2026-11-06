import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WhitePayConfig {
  secretKey: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}
export interface CreateSessionInput {
  priceId: string;
  externalOrderId: string;
  customerReference?: string;
  successUrl?: string;
}
export interface CheckoutSession {
  id: string;
  redirectUrl: string;
  externalOrderId: string;
  priceId: string;
  status: 'open' | 'settled' | 'canceled';
  amountMinor: number;
  currency: 'USDT';
  tokenAddress: string;
  customerReference: string | null;
  successUrl: string | null;
  payoutAddress: string;
}
export interface Payment {
  id: string;
  sessionId: string;
  status: 'succeeded';
  amountMinor: number;
  txHash: string;
  blockNumber: number;
  createdAt: number;
}
export interface Product {
  id: string;
  name: string;
}
export interface PriceInput {
  productId: string;
  amountMinor: number;
  currency: 'USDT';
  tokenAddress: string;
}
export interface Price extends PriceInput {
  id: string;
  version: number;
}
export interface Quote {
  submissionId: string;
  orderDigest: string;
  typedData: Record<string, unknown>;
  tokenTypedData: Record<string, unknown>;
}
export interface VerifyWebhookInput {
  payload: string | Buffer;
  signature: string;
  timestamp: string;
  secret: string;
  nowMs?: number;
  maxAgeSeconds?: number;
}
export interface VerifiedEvent {
  type: string;
  id: string;
  data: Record<string, unknown>;
}
export class WhitePayAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`WhitePay: ${code}`);
    this.name = 'WhitePayAPIError';
  }
}
const knownErrors = new Set([
  'unauthorized',
  'not_found',
  'price_not_found',
  'invalid_request',
  'invalid_json',
  'body_too_large',
  'invalid_idempotency_key',
  'idempotency_conflict',
  'external_order_conflict',
  'internal',
  'rate_limited',
  'session_not_open',
  'already_submitted',
  'invalid_signature',
  'quote_expired',
  'renewal_required',
]);
export class WhitePay {
  readonly checkout: CheckoutAPI;
  readonly payments: PaymentsAPI;
  readonly merchant:MerchantAPI;
  readonly products: ProductsAPI;
  readonly prices: PricesAPI;
  readonly webhooks = new WebhooksAPI();
  constructor(config: WhitePayConfig) {
    if (!config.secretKey) throw new Error('WhitePay: secretKey required');
    if (typeof window !== 'undefined')
      throw new Error('WhitePay secretKey must not be used in the browser');
    const client = new HttpClient(config);
    this.checkout = new CheckoutAPI(client);
    this.payments = new PaymentsAPI(client);
    this.merchant=new MerchantAPI(client);
    this.products = new ProductsAPI(client);
    this.prices = new PricesAPI(client);
  }
}
class HttpClient {
  readonly baseUrl: string;
  constructor(private readonly config: WhitePayConfig) {
    let url: URL;
    try {
      url = new URL(config.apiBaseUrl!);
    } catch {
      throw new Error('WhitePay: explicit apiBaseUrl required');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['http:', 'https:'].includes(url.protocol)
    )
      throw new Error('WhitePay: invalid apiBaseUrl');
    if (
      url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('WhitePay: apiBaseUrl requires HTTPS except localhost');
    if (
      !Number.isSafeInteger(config.timeoutMs ?? 15000) ||
      (config.timeoutMs ?? 15000) < 1
    )
      throw new Error('WhitePay: invalid timeoutMs');
    this.baseUrl = url.href.replace(/\/+$/, '');
  }
  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (
      idempotencyKey !== undefined &&
      (!idempotencyKey.length ||
        idempotencyKey.length > 200 ||
        /[\r\n]/.test(idempotencyKey))
    )
      throw new WhitePayAPIError(400, 'invalid_idempotency_key');
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.config.secretKey}`,
        accept: 'application/json',
      };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (idempotencyKey !== undefined)
        headers['idempotency-key'] = idempotencyKey;
      const res = await fetch(this.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: any;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          if (res.ok)
            throw new WhitePayAPIError(res.status, 'invalid_response');
        }
      }
      if (!res.ok)
        throw new WhitePayAPIError(
          res.status,
          knownErrors.has(parsed?.error) ? parsed.error : 'http_error',
        );
      if (res.status !== 204 && (!parsed || typeof parsed !== 'object'))
        throw new WhitePayAPIError(res.status, 'invalid_response');
      return parsed as T;
    } catch (e) {
      if (e instanceof WhitePayAPIError) throw e;
      throw new WhitePayAPIError(
        0,
        controller.signal.aborted ? 'timeout' : 'network_error',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
const id = (value: string) => {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(value))
    throw new WhitePayAPIError(400, 'invalid_request');
  return encodeURIComponent(value);
};
class CheckoutAPI {
  constructor(private readonly client: HttpClient) {}
  createSession(
    input: CreateSessionInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<CheckoutSession> {
    return this.client.request(
      'POST',
      '/v1/checkout/sessions',
      input,
      opts.idempotencyKey,
    );
  }
  retrieve(sessionId: string): Promise<CheckoutSession> {
    return this.client.request('GET', `/v1/checkout/sessions/${id(sessionId)}`);
  }
  payment(sessionId: string): Promise<{ payment: Payment | null }> {
    return this.client.request(
      'GET',
      `/v1/checkout/sessions/${id(sessionId)}/payment`,
    );
  }
  quote(
    sessionId: string,
    input: { payerAddress: string },
    opts: { renew?: boolean } = {},
  ): Promise<Quote> {
    return this.client.request(
      'POST',
      `/v1/checkout/sessions/${id(sessionId)}/${opts.renew ? 'renew' : 'order'}`,
      input,
    );
  }
  submitSignatures(
    submissionId: string,
    input: { orderSignature: string; tokenSignature: string },
  ): Promise<void> {
    return this.client.request(
      'POST',
      `/v1/submissions/${id(submissionId)}/signatures`,
      input,
    );
  }
  submission(submissionId: string): Promise<{
    id: string;
    sessionId: string;
    status: string;
    txHash: string | null;
  }> {
    return this.client.request('GET', `/v1/submissions/${id(submissionId)}`);
  }
}
class PaymentsAPI {
  constructor(private readonly client: HttpClient) {}
  retrieve(paymentId: string): Promise<Payment> {
    return this.client.request('GET', `/v1/payments/${id(paymentId)}`);
  }
  list(): Promise<{ data: Payment[] }> {
    return this.client.request('GET', '/v1/payments');
  }
}
class ProductsAPI {
  constructor(private readonly client: HttpClient) {}
  create(input: { name: string }): Promise<Product> {
    return this.client.request('POST', '/v1/products', input);
  }
  retrieve(productId: string): Promise<Product> {
    return this.client.request('GET', `/v1/products/${id(productId)}`);
  }
}
class PricesAPI {
  constructor(private readonly client: HttpClient) {}
  create(input: PriceInput): Promise<Pick<Price, 'id' | 'version'>> {
    return this.client.request('POST', '/v1/prices', input);
  }
  retrieve(priceId: string): Promise<Price> {
    return this.client.request('GET', `/v1/prices/${id(priceId)}`);
  }
}
export function verifyWebhook(input: VerifyWebhookInput): VerifiedEvent {
  const raw =
    typeof input.payload === 'string'
      ? input.payload
      : input.payload.toString('utf8');
  if (!input.secret || !/^\d{1,12}$/.test(input.timestamp))
    throw new WhitePayAPIError(400, 'invalid_timestamp');
  const tolerance = input.maxAgeSeconds ?? 300;
  if (
    !Number.isSafeInteger(tolerance) ||
    tolerance < 0 ||
    tolerance > 300 ||
    Math.abs(
      Math.floor((input.nowMs ?? Date.now()) / 1000) - Number(input.timestamp),
    ) > tolerance
  )
    throw new WhitePayAPIError(400, 'invalid_timestamp');
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${raw}`)
    .digest();
  if (
    !/^[a-f0-9]{64}$/i.test(input.signature) ||
    !timingSafeEqual(Buffer.from(input.signature, 'hex'), expected)
  )
    throw new WhitePayAPIError(400, 'invalid_signature');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WhitePayAPIError(400, 'invalid_payload');
  }
  if (
    !parsed ||
    typeof parsed.type !== 'string' ||
    !parsed.type ||
    typeof parsed.id !== 'string' ||
    !parsed.id ||
    !parsed.data ||
    typeof parsed.data !== 'object' ||
    Array.isArray(parsed.data)
  )
    throw new WhitePayAPIError(400, 'invalid_payload');
  if (parsed.type === 'payment.succeeded') {
    const d = parsed.data,
      hash = /^0x[0-9a-fA-F]{64}$/;
    if (
      !['paymentId', 'sessionId', 'merchantId'].every(
        (k) => typeof d[k] === 'string' && d[k].length > 0,
      ) ||
      !hash.test(d.orderId) ||
      !hash.test(d.quoteId) ||
      !hash.test(d.txHash) ||
      typeof d.amountMinor !== 'string' ||
      !/^\d+$/.test(d.amountMinor) ||
      BigInt(d.amountMinor) <= 0n ||
      typeof d.fee !== 'string' ||
      !/^\d+$/.test(d.fee) ||
      d.chainId !== 1874 ||
      d.currency !== 'USDT' ||
      String(d.token).toLowerCase() !==
        '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7' ||
      !Number.isSafeInteger(d.blockNumber) ||
      d.blockNumber < 0
    )
      throw new WhitePayAPIError(400, 'invalid_payload');
  }
  return parsed;
}
class WebhooksAPI {
  verify(input: VerifyWebhookInput) {
    return verifyWebhook(input);
  }
}

export { createCheckoutBridge,createCheckoutFetchBridge } from './bridge.js';
export type { CheckoutBridgeOptions,CheckoutFetchBridgeOptions } from './bridge.js';

class MerchantAPI {constructor(private readonly client:HttpClient){} retrieve():Promise<{id:string;name:string;payoutAddress:string}>{return this.client.request('GET','/v1/merchant');}}
