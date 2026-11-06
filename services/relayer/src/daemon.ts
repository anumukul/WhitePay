import type { RelayerConfig } from "./types.js";
import type { ChainAdapter } from "@whitepay/chain";
import { runOnce } from "./loop.js";

export interface DaemonHandle {
  stop: () => void;
}

export function startDaemon(cfg: RelayerConfig, chain: ChainAdapter, intervalMs = 2_000): DaemonHandle {
  let stopped = false;
  let currentRun: Promise<unknown> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      currentRun = runOnce(cfg, chain);
      const r = await currentRun;
      if (!stopped && r && (r as { processed: number }).processed > 0) {
        console.log(`[relayer] ${JSON.stringify(r)}`);
      }
    } catch (e) {
      console.error("[relayer] loop error", e);
    } finally {
      currentRun = null;
      if (!stopped) setTimeout(tick, intervalMs);
    }
  };
  setTimeout(tick, intervalMs);

  return {
    stop: () => {
      stopped = true;
    },
  };
}
