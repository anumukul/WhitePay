import { keccak256, hashTypedData, serializeTransaction, type Hex } from 'viem';
import type { RelayerConfig } from './types.js';
// User-selected terms for the Step 06 preview. This is not transaction/signing approval.
export const LIVE_POLICY = {
  amountMinor: '1000000',
  feeMinor: '1000',
  feeBasisPoints: 10,
  validitySeconds: 900,
  minimumRemainingValiditySeconds: 120,
  gasMarginPercent: 20,
  maxGasPerSettle: '500000',
  maxGasPriceWei: '20000000000',
  priorityFeeWei: '1000000',
  maxL1FeeWei: '1000000000000',
  dailyBudgetWei: '100000000000000000',
  confirmations: 2,
} as const;
export const LIVE_ROLES = {
  payer: '0x9AfB652bB337eB4D5a09221Af7972D69B500e035',
  merchant: '0xB5bd941E218c88707a2BbABEb3cb0BDbE1543c9C',
  feeRecipient: '0x2F51C76D37BA9118ce8D5b9377329965ddb411c2',
  relayer: '0xba780C2e4e79e4109EC53b52fCE9982f33962A92',
} as const;
export const LIVE_CHECKOUT =
  '0x4d1761ABB4eD290F23fcDA00890039800E2e53f0' as const;
export const LIVE_TOKEN = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as const;
export const LIVE_RUNTIME_HASH =
  '0x3a9aa44166dd8ec13f12718f9b5c4515ea494622654761b1cb26f23c6c456efd' as const;
export function config(mode: RelayerConfig['mode'] = 'preview'): RelayerConfig {
  return {
    expectedChainId: 1874,
    checkoutAddress: LIVE_CHECKOUT,
    tokenAddress: LIVE_TOKEN,
    feeRecipient: LIVE_ROLES.feeRecipient,
    feeBasisPoints: 10,
    maxGasPerSettle: BigInt(LIVE_POLICY.maxGasPerSettle),
    maxGasPriceWei: BigInt(LIVE_POLICY.maxGasPriceWei),
    priorityFeeWei: BigInt(LIVE_POLICY.priorityFeeWei),
    maxL1FeeWei: BigInt(LIVE_POLICY.maxL1FeeWei),
    dailyBudgetWei: BigInt(LIVE_POLICY.dailyBudgetWei),
    minimumValiditySeconds: LIVE_POLICY.minimumRemainingValiditySeconds,
    mode,
  };
}
const same = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
const DOMAIN_FIELDS = [
  ['name', 'string'],
  ['version', 'string'],
  ['chainId', 'uint256'],
  ['verifyingContract', 'address'],
].map(([name, type]) => ({ name, type }));
const ORDER_FIELDS = [
  ['orderId', 'bytes32'],
  ['payer', 'address'],
  ['merchant', 'address'],
  ['amount', 'uint256'],
  ['fee', 'uint256'],
  ['feeRecipient', 'address'],
  ['token', 'address'],
  ['validAfter', 'uint256'],
  ['validBefore', 'uint256'],
  ['quoteId', 'bytes32'],
].map(([name, type]) => ({ name, type }));
const TOKEN_FIELDS = [
  ['from', 'address'],
  ['to', 'address'],
  ['value', 'uint256'],
  ['validAfter', 'uint256'],
  ['validBefore', 'uint256'],
  ['nonce', 'bytes32'],
].map(([name, type]) => ({ name, type }));
export function validateLiveContext(ctx: any): void {
  if (
    ctx.version !== 1 ||
    ctx.chainId !== 1874 ||
    !same(ctx.checkout, LIVE_CHECKOUT) ||
    !same(ctx.token, LIVE_TOKEN) ||
    JSON.stringify(ctx.policy) !== JSON.stringify(LIVE_POLICY)
  )
    throw new Error('live_context_policy_mismatch');
  for (const key of Object.keys(LIVE_ROLES) as (keyof typeof LIVE_ROLES)[])
    if (!same(ctx.roles?.[key], LIVE_ROLES[key]))
      throw new Error('live_context_role_mismatch');
  const o = ctx.orderTypedData,
    t = ctx.tokenTypedData,
    m = o.message,
    a = t.message;
  function schemaMatches(
    actual: any,
    expected: Record<string, { name: string; type: string }[]>,
  ) {
    if (
      !actual ||
      JSON.stringify(Object.keys(actual).sort()) !==
        JSON.stringify(Object.keys(expected).sort())
    )
      return false;
    return Object.keys(expected).every(
      (key) =>
        Array.isArray(actual[key]) &&
        actual[key].length === expected[key].length &&
        actual[key].every(
          (field: any, index: number) =>
            field &&
            Object.keys(field).length === 2 &&
            field.name === expected[key][index].name &&
            field.type === expected[key][index].type,
        ),
    );
  }
  if (
    !schemaMatches(o.types, {
      EIP712Domain: DOMAIN_FIELDS,
      Order: ORDER_FIELDS,
    }) ||
    !schemaMatches(t.types, {
      EIP712Domain: DOMAIN_FIELDS,
      ReceiveWithAuthorization: TOKEN_FIELDS,
    })
  )
    throw new Error('live_typed_schema_mismatch');
  if (
    o.domain.name !== 'WhitePayCheckout' ||
    o.domain.version !== '1' ||
    o.domain.chainId !== 1874 ||
    !same(o.domain.verifyingContract, LIVE_CHECKOUT) ||
    o.primaryType !== 'Order' ||
    !same(m.payer, LIVE_ROLES.payer) ||
    !same(m.merchant, LIVE_ROLES.merchant) ||
    !same(m.feeRecipient, LIVE_ROLES.feeRecipient) ||
    !same(m.token, LIVE_TOKEN) ||
    String(m.amount) !== LIVE_POLICY.amountMinor ||
    String(m.fee) !== LIVE_POLICY.feeMinor
  )
    throw new Error('live_order_terms_mismatch');
  if (
    !Number.isSafeInteger(m.validAfter) ||
    !Number.isSafeInteger(m.validBefore) ||
    m.validBefore - m.validAfter !== LIVE_POLICY.validitySeconds + 60 ||
    ctx.validBefore !== m.validBefore
  )
    throw new Error('live_window_mismatch');
  if (
    hashTypedData(o) !== ctx.orderDigest ||
    hashTypedData(t) !== ctx.tokenDigest ||
    t.domain.name !== 'Tether USD' ||
    t.domain.version !== '1' ||
    t.domain.chainId !== 1874 ||
    !same(t.domain.verifyingContract, LIVE_TOKEN) ||
    t.primaryType !== 'ReceiveWithAuthorization' ||
    !same(a.from, m.payer) ||
    !same(a.to, LIVE_CHECKOUT) ||
    String(a.value) !== '1001000' ||
    a.validAfter !== m.validAfter ||
    a.validBefore !== m.validBefore ||
    a.nonce !== ctx.orderDigest
  )
    throw new Error('live_authorization_mismatch');
}
export function requireApprovalHash(
  received: string | undefined,
  expected: Hex,
) {
  if (received !== expected) throw new Error('specific_approval_hash_required');
}

export class SigningWindowClosed extends Error {
  readonly code = 'SIGNING_WINDOW_CLOSED';
  constructor(
    readonly publicDetails: {
      remainingSeconds: number;
      minimumRemainingSeconds: number;
      validBeforeUtc: string;
      signingCutoffUtc: string;
    },
  ) {
    super(
      'The reviewed signing window has closed; prepare a fresh preview and obtain new signing approval',
    );
    this.name = 'SigningWindowClosed';
  }
}
export function checkSigningWindow(
  validBefore: number,
  now: number,
  minimumRemainingSeconds: number,
) {
  return {
    remainingSeconds: validBefore - now,
    minimumRemainingSeconds,
    validBeforeUtc: new Date(validBefore * 1000).toISOString(),
    signingCutoffUtc: new Date(
      (validBefore - minimumRemainingSeconds) * 1000,
    ).toISOString(),
    permitted: now + minimumRemainingSeconds < validBefore,
  };
}
export function requireSigningWindow(
  validBefore: number,
  now: number,
  minimumRemainingSeconds: number,
) {
  const result = checkSigningWindow(validBefore, now, minimumRemainingSeconds);
  if (!result.permitted) {
    const { permitted, ...publicDetails } = result;
    throw new SigningWindowClosed(publicDetails);
  }
}

export function requireLiveContextBasename(name: string) {
  if (!/^step-(?:06|09)-live-[0-9a-f]{64}\.json$/.test(name))
    throw new Error('invalid_live_context_filename');
}
