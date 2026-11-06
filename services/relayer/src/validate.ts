import {
  hashTypedData,
  recoverTypedDataAddress,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import type { RelayerConfig } from './types.js';
const TOKEN = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7';
const same = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
export async function validate(
  row: any,
  cfg: RelayerConfig,
  now: number,
): Promise<Hex> {
  const o = row.order_payload,
    td = row.order_typed_data,
    auth = row.token_typed_data;
  if (
    cfg.expectedChainId !== 1874 ||
    !same(cfg.tokenAddress, TOKEN) ||
    !Number.isInteger(cfg.feeBasisPoints) ||
    cfg.feeBasisPoints < 0 ||
    cfg.feeBasisPoints > 10000
  )
    throw new Error('invalid_configuration');
  if (row.session_status !== 'open') throw new Error('session_not_open');
  if (!same(o.token, TOKEN) || !same(o.token, row.token_address))
    throw new Error('token_mismatch');
  if (!same(o.payer, row.payer_address)) throw new Error('payer_mismatch');
  if (!same(o.merchant, row.payout_address))
    throw new Error('merchant_mismatch');
  if (BigInt(o.amount) !== BigInt(row.amount_minor) || BigInt(o.amount) <= 0n)
    throw new Error('amount_mismatch');
  if (
    BigInt(o.fee) !==
      (BigInt(row.amount_minor) * BigInt(cfg.feeBasisPoints)) / 10000n ||
    !same(o.feeRecipient, cfg.feeRecipient)
  )
    throw new Error('fee_mismatch');
  if (
    !Number.isSafeInteger(o.validAfter) ||
    !Number.isSafeInteger(o.validBefore) ||
    o.validAfter >= now ||
    o.validBefore <= now + cfg.minimumValiditySeconds
  )
    throw new Error('time_expired');
  if (
    td.domain.name !== 'WhitePayCheckout' ||
    td.domain.version !== '1' ||
    td.domain.chainId !== 1874 ||
    !same(td.domain.verifyingContract, cfg.checkoutAddress) ||
    hashTypedData(td) !== row.order_digest
  )
    throw new Error('domain_mismatch');
  for (const key of [
    'orderId',
    'payer',
    'merchant',
    'amount',
    'fee',
    'feeRecipient',
    'token',
    'validAfter',
    'validBefore',
    'quoteId',
  ])
    if (!same(o[key], td.message[key]))
      throw new Error('stored_quote_mismatch');
  const t = auth.message;
  if (
    auth.domain.name !== 'Tether USD' ||
    auth.domain.version !== '1' ||
    auth.domain.chainId !== 1874 ||
    !same(auth.domain.verifyingContract, TOKEN) ||
    !same(t.from, o.payer) ||
    !same(t.to, cfg.checkoutAddress) ||
    BigInt(t.value) !== BigInt(o.amount) + BigInt(o.fee) ||
    t.validAfter !== o.validAfter ||
    t.validBefore !== o.validBefore ||
    t.nonce !== row.order_digest
  )
    throw new Error('authorization_mismatch');
  try {
    for (const [data, signature] of [
      [td, row.order_signature],
      [auth, row.token_signature],
    ])
      if (!same(await recoverTypedDataAddress({ ...data, signature }), o.payer))
        throw new Error('wrong_signer');
  } catch {
    throw new Error('invalid_signature');
  }
  return encodeFunctionData({
    abi: whitepayCheckoutAbi,
    functionName: 'settle',
    args: [
      {
        ...o,
        amount: BigInt(o.amount),
        fee: BigInt(o.fee),
        validAfter: BigInt(o.validAfter),
        validBefore: BigInt(o.validBefore),
      },
      row.order_signature,
      row.token_signature,
    ],
  });
}
