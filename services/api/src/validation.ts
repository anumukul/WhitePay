import { z } from 'zod';
import { isAddress, zeroAddress } from 'viem';
export const USDT = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7';
export const address = z
  .string()
  .refine(
    (v) => isAddress(v, { strict: true }) && v.toLowerCase() !== zeroAddress,
    'Invalid address',
  );
export const text = z.string().trim().min(1).max(200);
export const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const priceSchema = z
  .object({
    productId: text.optional(),
    amountMinor: amount,
    currency: z.literal('USDT'),
    tokenAddress: address.refine((v) => v.toLowerCase() === USDT),
  })
  .strict();
export const sessionSchema = z
  .object({
    priceId: text,
    externalOrderId: text,
    successUrl: z
      .string()
      .url()
      .max(2048)
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol))
      .optional(),
  })
  .strict();
export const signatureSchema = z
  .object({
    orderSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    tokenSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  })
  .strict();
