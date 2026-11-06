// Standalone relayer daemon entrypoint.
// Reads env config, builds a chain client, starts the poll loop.
import { WhitePayChainClient } from "@whitepay/chain";
import { startDaemon } from "./daemon.js";
import type { RelayerConfig } from "./types.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} required`);
  return v;
}

function envBig(name: string, def: bigint): bigint {
  const v = process.env[name];
  return v ? BigInt(v) : def;
}

function envNum(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}

const cfg: RelayerConfig = {
  expectedChainId: envNum("WHITECHAIN_CHAIN_ID", 1874),
  checkoutAddress: requireEnv("WHITEPAY_CHECKOUT_CONTRACT_ADDRESS"),
  maxGasPerSettle: envBig("RELAYER_MAX_GAS_PER_SETTLE", 500_000n),
  maxGasPriceWei: envBig("RELAYER_MAX_GAS_PRICE_WEI", 20_000_000_000n),
  dailyBudgetWei: envBig("RELAYER_DAILY_BUDGET_WEI", 100_000_000_000_000_000n),
  maxFeeBasisPointsDrift: envNum("RELAYER_MAX_FEE_BPS_DRIFT", 1),
};

const client = new WhitePayChainClient({
  rpcUrl: requireEnv("WHITECHAIN_RPC_URL"),
  expectedChainId: cfg.expectedChainId,
  checkoutAddress: cfg.checkoutAddress as `0x${string}`,
  relayerPrivateKey: requireEnv("RELAYER_PRIVATE_KEY") as `0x${string}`,
});

const intervalMs = envNum("RELAYER_POLL_INTERVAL_MS", 2_000);
console.log(`[relayer] starting daemon, polling every ${intervalMs}ms against ${cfg.checkoutAddress}`);
startDaemon(cfg, client.asChainAdapter(), intervalMs);
