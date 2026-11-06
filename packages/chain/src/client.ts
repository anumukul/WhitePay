import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { whitepayCheckoutAbi } from './abi.js';
import type {
  ChainAdapter,
  ChainReader,
  Hex,
  Order,
  SettledLog,
} from './types.js';

export interface WhitePayChainClientConfig {
  rpcUrl: string;
  expectedChainId: number;
  checkoutAddress: Hex;
  relayerPrivateKey?: Hex;
  confirmations?: number;
}

export class WhitePayChainClient {
  readonly chain: ReturnType<typeof defineChain>;
  readonly publicClient: PublicClient<
    ReturnType<typeof http>,
    ReturnType<typeof defineChain>
  >;
  readonly walletClient?: WalletClient<
    ReturnType<typeof http>,
    ReturnType<typeof defineChain>
  >;
  readonly relayerAddress?: Address;
  readonly confirmations: number;

  constructor(private readonly config: WhitePayChainClientConfig) {
    this.chain = defineChain({
      id: config.expectedChainId,
      name: `whitepay-${config.expectedChainId}`,
      nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
    this.confirmations = config.confirmations ?? 2;
    if (config.relayerPrivateKey) {
      const account = privateKeyToAccount(config.relayerPrivateKey);
      this.walletClient = createWalletClient({
        account,
        chain: this.chain,
        transport: http(config.rpcUrl),
      });
      this.relayerAddress = account.address;
    }
  }

  configCheckoutAddress(): Hex {
    return this.config.checkoutAddress;
  }

  async getChainId(): Promise<number> {
    const id = await this.publicClient.getChainId();
    return Number(id);
  }

  async getBlockNumber(): Promise<number> {
    return Number(await this.publicClient.getBlockNumber());
  }

  async getBalance(address: Hex): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  async getRelayerBalance(): Promise<bigint> {
    if (!this.relayerAddress)
      throw new Error('relayerPrivateKey required for getRelayerBalance');
    return this.publicClient.getBalance({ address: this.relayerAddress });
  }

  async isSettled(payer: Address, orderId: Hex): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.config.checkoutAddress,
      abi: whitepayCheckoutAbi,
      functionName: 'settled',
      args: [payer, orderId],
    });
    return Boolean(result);
  }

  async orderDigest(order: Order): Promise<Hex> {
    const result = await this.publicClient.readContract({
      address: this.config.checkoutAddress,
      abi: whitepayCheckoutAbi,
      functionName: 'orderDigest',
      args: [toAbiOrder(order)],
    });
    return result as Hex;
  }

  async estimateSettleGas(
    order: Order,
    orderSig: string,
    tokenSig: string,
  ): Promise<bigint> {
    if (!this.relayerAddress)
      throw new Error('relayerPrivateKey required for estimateSettleGas');
    return this.publicClient.estimateContractGas({
      address: this.config.checkoutAddress,
      abi: whitepayCheckoutAbi,
      functionName: 'settle',
      args: [toAbiOrder(order), orderSig as Hex, tokenSig as Hex],
      account: this.relayerAddress,
    });
  }

  async sendSettle(
    order: Order,
    orderSig: string,
    tokenSig: string,
    gasLimit: bigint,
  ): Promise<string> {
    if (!this.walletClient || !this.relayerAddress)
      throw new Error('relayerPrivateKey required for sendSettle');
    const hash = await this.walletClient.writeContract({
      address: this.config.checkoutAddress,
      abi: whitepayCheckoutAbi,
      functionName: 'settle',
      args: [toAbiOrder(order), orderSig as Hex, tokenSig as Hex],
      account: this.walletClient.account!,
      chain: this.chain,
      gas: gasLimit,
    });
    return hash;
  }

  async waitForTransaction(hash: Hash) {
    return this.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: this.confirmations,
    });
  }

  async getHead(): Promise<number> {
    return this.getBlockNumber();
  }

  async getLogs(fromBlock: number, toBlock: number): Promise<SettledLog[]> {
    const logs = await this.publicClient.getLogs({
      address: this.config.checkoutAddress,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
    const parsed = parseEventLogs({
      abi: whitepayCheckoutAbi,
      eventName: 'PaymentSettled',
      logs,
    });
    return parsed.map((p) => ({
      blockNumber: Number(p.blockNumber ?? 0n),
      txHash: p.transactionHash ?? '0x',
      logIndex: Number(p.logIndex ?? 0),
      orderId: p.args.orderId as string,
      payer: p.args.payer as string,
      merchant: p.args.merchant as string,
      token: p.args.token as string,
      amount: p.args.amount as bigint,
      fee: p.args.fee as bigint,
      feeRecipient: p.args.feeRecipient as string,
      quoteId: p.args.quoteId as string,
    }));
  }

  asChainAdapter(): ChainAdapter {
    return {
      chainId: () => this.getChainId(),
      nowSeconds: () => Math.floor(Date.now() / 1000),
      getRelayerBalance: () => this.getRelayerBalance(),
      estimateSettleGas: (o, os, ts) => this.estimateSettleGas(o, os, ts),
      sendSettle: (o, os, ts, g) => this.sendSettle(o, os, ts, g),
    };
  }

  asChainReader(): ChainReader {
    return {
      getHead: () => this.getHead(),
      getLogs: (from, to) => this.getLogs(from, to),
    };
  }
}

function toAbiOrder(order: Order) {
  return {
    orderId: order.orderId as Hex,
    payer: order.payer as Address,
    merchant: order.merchant as Address,
    amount: order.amount,
    fee: order.fee,
    feeRecipient: order.feeRecipient as Address,
    token: order.token as Address,
    validAfter: BigInt(order.validAfter),
    validBefore: BigInt(order.validBefore),
    quoteId: order.quoteId as Hex,
  };
}
