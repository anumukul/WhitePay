import { randomUUID } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  keccak256,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  type Hex,
} from 'viem';
import { resetDbForTests, getDb } from '@whitepay/api/src/db.js';
import { createMerchant, createPrice } from '@whitepay/api/src/merchants.js';
import { createSession } from '@whitepay/api/src/sessions.js';
import {
  buildOrderForSession,
  recordSignatures,
} from '@whitepay/api/src/orders.js';
import { pollQueued } from '../src/queue.js';
import { runOnce } from '../src/loop.js';
import { whitepayCheckoutAbi } from '@whitepay/chain';
import type {
  ChainAdapter,
  RelayerConfig,
  ReceiptEvidence,
  ApprovedPayment,
  UnsignedTransaction,
} from '../src/types.js';
export async function fixture(checkout?: Hex) {
  await resetDbForTests(randomUUID());
  const cfg: RelayerConfig = {
    expectedChainId: 1874,
    checkoutAddress: checkout ?? (('0x' + 'c'.repeat(40)) as Hex),
    tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    feeRecipient: ('0x' + 'f'.repeat(40)) as Hex,
    feeBasisPoints: 10,
    maxGasPerSettle: 500000n,
    maxGasPriceWei: 20000000000n,
    priorityFeeWei: 1000000n,
    maxL1FeeWei: 1000n,
    dailyBudgetWei: 10n ** 17n,
    minimumValiditySeconds: 120,
    mode: 'preview',
  };
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = cfg.checkoutAddress;
  process.env.WHITEPAY_FEE_RECIPIENT = cfg.feeRecipient;
  process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
  process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
  process.env.WHITECHAIN_CHAIN_ID = '1874';
  const merchant = await createMerchant({
    name: 'Relay fixture',
    payoutAddress: '0x' + 'b'.repeat(40),
  });
  const price = await createPrice({
    merchantId: merchant.id,
    amountMinor: 1000000,
    currency: 'USDT',
    tokenAddress: cfg.tokenAddress,
  });
  const payer = privateKeyToAccount(generatePrivateKey());
  const session = await createSession({
    merchantId: merchant.id,
    priceId: price.id,
    externalOrderId: randomUUID(),
  });
  const quote = await buildOrderForSession({
    merchantId: merchant.id,
    sessionId: session.id,
    payerAddress: payer.address,
  });
  await recordSignatures({
    merchantId: merchant.id,
    submissionId: quote.submissionId,
    orderSignature: await payer.signTypedData(quote.typedData as any),
    tokenSignature: await payer.signTypedData(quote.tokenTypedData),
  });
  const row = (await pollQueued())[0];
  const account = privateKeyToAccount(generatePrivateKey());
  const state = {
    broadcasts: [] as Hex[],
    signs: 0,
    latest: 0,
    pending: 0,
    now: Math.floor(Date.now() / 1000),
    gas: 150000n,
    gasPrice: 5000000000n,
    l1: 100n,
    balance: 10n ** 18n,
    failSign: false,
    failBroadcast: false,
    receipts: new Map<string, ReceiptEvidence>(),
  };
  const chain: ChainAdapter = {
    relayerAddress: account.address,
    chainId: async () => 1874,
    nowSeconds: async () => state.now,
    getRelayerBalance: async () => state.balance,
    getNonce: async (tag) => state[tag],
    simulate: async () => state.gas,
    gasPrice: async () => state.gasPrice,
    l1Fee: async () => state.l1,
    sign: async (tx) => {
      state.signs++;
      if (state.failSign) throw new Error('signer offline');
      return account.signTransaction(tx);
    },
    broadcast: async (raw) => {
      state.broadcasts.push(raw);
      state.pending = 1;
      if (state.failBroadcast) throw new Error('ambiguous timeout');
      return keccak256(raw);
    },
    transactionKnown: async (hash) =>
      state.broadcasts.some((raw) => keccak256(raw) === hash),
    receipt: async (hash) => state.receipts.get(hash) ?? null,
  };
  async function approve(): Promise<ApprovedPayment> {
    const p = await runOnce(cfg, chain);
    const hash = p.details[0].unsignedHash;
    if (!hash) throw new Error('no preview');
    return {
      chainId: 1874,
      relayer: account.address,
      checkout: cfg.checkoutAddress,
      orderDigest: row.order_digest,
      unsignedHash: hash as Hex,
    };
  }
  function mine(status: 'success' | 'reverted' = 'success', validEvent = true) {
    const hash = keccak256(state.broadcasts.at(-1)!);
    state.latest = 1;
    state.pending = 1;
    const o = row.order_payload;
    const event = {
      address: cfg.checkoutAddress,
      topics: encodeEventTopics({
        abi: whitepayCheckoutAbi,
        eventName: 'PaymentSettled',
        args: { orderId: o.orderId, payer: o.payer, merchant: o.merchant },
      }) as Hex[],
      data: encodeAbiParameters(
        parseAbiParameters('address,uint256,uint256,address,bytes32'),
        [o.token, BigInt(o.amount), BigInt(o.fee), o.feeRecipient, o.quoteId],
      ),
    };
    const transfers = [
      [o.payer, cfg.checkoutAddress, 1001000n],
      [cfg.checkoutAddress, o.merchant, 1000000n],
      [cfg.checkoutAddress, o.feeRecipient, 1000n],
    ].map(([from, to, value]) => ({
      address: cfg.tokenAddress,
      topics: encodeEventTopics({
        abi: parseAbi([
          'event Transfer(address indexed from,address indexed to,uint256 value)',
        ]),
        eventName: 'Transfer',
        args: { from: from as Hex, to: to as Hex },
      }) as Hex[],
      data: encodeAbiParameters(parseAbiParameters('uint256'), [
        value as bigint,
      ]),
    }));
    state.receipts.set(hash, {
      transactionHash: hash,
      status,
      gasUsed: 120000n,
      effectiveGasPrice: 5000000000n,
      l1Fee: 123n,
      logs: status === 'success' && validEvent ? [event, ...transfers] : [],
    });
    return hash;
  }
  return { cfg, chain, state, row, quote, approve, mine, merchant, session };
}
export { getDb };
