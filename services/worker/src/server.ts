// Standalone worker daemon entrypoint. Scans PaymentSettled events and writes
// them into the API's payments + submissions tables.
import { WhitePayChainClient } from "@whitepay/chain";
import { startDaemon } from "./daemon.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} required`);
  return v;
}
function envNum(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}

const client = new WhitePayChainClient({
  rpcUrl: requireEnv("WHITECHAIN_RPC_URL"),
  expectedChainId: envNum("WHITECHAIN_CHAIN_ID", 1874),
  checkoutAddress: requireEnv("WHITEPAY_CHECKOUT_CONTRACT_ADDRESS") as `0x${string}`,
});

const intervalMs = envNum("WORKER_POLL_INTERVAL_MS", 3_000);
console.log(`[worker] starting, polling every ${intervalMs}ms`);
startDaemon(
  { scope: "whitepay-main", batchSize: envNum("WORKER_BATCH_SIZE", 500), confirmations: envNum("WORKER_CONFIRMATIONS", 2) },
  client.asChainReader(),
  intervalMs,
);
