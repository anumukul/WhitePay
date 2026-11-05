import { hashTypedData, isAddress, zeroAddress } from 'viem';
import { WHITECHAIN_SEPOLIA as network } from '../../packages/shared/dist/index.js';

export const ROLES = [
  'deployer',
  'relayer',
  'payer',
  'merchant',
  'feeRecipient',
];
const uint = (value, label, positive = false) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(`${label} must be a canonical integer string`);
  const n = BigInt(value);
  if (n >= 2n ** 256n || (positive && n === 0n))
    throw new Error(`${label} must be positive and fit uint256`);
  return n;
};
export function validateConfig(config) {
  const allowed = new Set([
    ...ROLES,
    'chainId',
    'amount',
    'fee',
    'deploymentGasLimit',
    'paymentGasLimit',
    'maxFeePerGas',
  ]);
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).some((key) => !allowed.has(key))
  )
    throw new Error('Config accepts public fields only');
  if (config.chainId !== network.id)
    throw new Error('Proof requires chain 1874');
  for (const role of ROLES) {
    if (
      !isAddress(config[role], { strict: true }) ||
      config[role].toLowerCase() === zeroAddress
    )
      throw new Error(`Missing or invalid public ${role} address`);
  }
  if (
    new Set(ROLES.map((role) => config[role].toLowerCase())).size !==
    ROLES.length
  )
    throw new Error('Proof roles must be distinct');
  const result = { ...config };
  for (const name of [
    'amount',
    'fee',
    'deploymentGasLimit',
    'paymentGasLimit',
    'maxFeePerGas',
  ]) {
    result[name] = uint(config[name], name, name !== 'fee');
  }
  if (result.amount + result.fee >= 2n ** 256n)
    throw new Error('Total exceeds uint256');
  return result;
}
export function readiness(config, balances) {
  const blockers = [];
  if (balances.payerWbt !== 0n)
    blockers.push('Payer must have exactly zero WBT');
  if (balances.payerUsdt < config.amount + config.fee)
    blockers.push('Payer needs official USDT for amount plus fee');
  // Conservative L2 gas budgets only; an additional reserve for L1 data fees is required.
  if (balances.deployerWbt < config.deploymentGasLimit * config.maxFeePerGas)
    blockers.push('Deployer WBT below configured L2 deployment budget');
  if (balances.relayerWbt < config.paymentGasLimit * config.maxFeePerGas)
    blockers.push('Relayer WBT below configured L2 payment budget');
  return blockers;
}
export const ORDER_FIELDS = [
  { name: 'orderId', type: 'bytes32' },
  { name: 'payer', type: 'address' },
  { name: 'merchant', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'fee', type: 'uint256' },
  { name: 'feeRecipient', type: 'address' },
  { name: 'token', type: 'address' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'quoteId', type: 'bytes32' },
];
export const RECEIVE_FIELDS = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
];
export function prepareAuthorizations(config, receiver, terms) {
  if (
    !isAddress(receiver, { strict: true }) ||
    receiver.toLowerCase() === zeroAddress ||
    ROLES.some((role) => config[role].toLowerCase() === receiver.toLowerCase())
  )
    throw new Error('Receiver must be a separate nonzero contract address');
  for (const field of ['orderId', 'quoteId']) {
    if (!/^0x[\da-f]{64}$/i.test(terms[field]) || /^0x0+$/.test(terms[field]))
      throw new Error(`Invalid ${field}`);
  }
  if (
    terms.validAfter < 0n ||
    terms.validBefore <= terms.validAfter ||
    terms.validBefore >= 2n ** 256n
  )
    throw new Error('Invalid authorization time window');
  const order = {
    domain: {
      name: 'WhitePayAuthorizationPoC',
      version: '1',
      chainId: network.id,
      verifyingContract: receiver,
    },
    types: { Order: ORDER_FIELDS },
    primaryType: 'Order',
    message: {
      orderId: terms.orderId,
      payer: config.payer,
      merchant: config.merchant,
      amount: config.amount,
      fee: config.fee,
      feeRecipient: config.feeRecipient,
      token: network.usdt,
      validAfter: terms.validAfter,
      validBefore: terms.validBefore,
      quoteId: terms.quoteId,
    },
  };
  const token = {
    domain: {
      name: 'Tether USD',
      version: '1',
      chainId: network.id,
      verifyingContract: network.usdt,
    },
    types: { ReceiveWithAuthorization: RECEIVE_FIELDS },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: config.payer,
      to: receiver,
      value: config.amount + config.fee,
      validAfter: terms.validAfter,
      validBefore: terms.validBefore,
      nonce: hashTypedData(order),
    },
  };
  return { order, token };
}
