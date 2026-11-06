import type { ChainReader } from "@whitepay/chain";
import { scanAndPersist, type WorkerLoopConfig } from "./loop.js";

export interface DaemonHandle {
  stop: () => void;
}

export function startDaemon(cfg: WorkerLoopConfig, reader: ChainReader, intervalMs = 3_000): DaemonHandle {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const r = await scanAndPersist(cfg, reader);
      if (!stopped && (r.processed > 0 || r.persisted > 0)) {
        console.log(`[worker] ${JSON.stringify(r)}`);
      }
    } catch (e) {
      console.error("[worker] scan error", e);
    } finally {
      if (!stopped) setTimeout(tick, intervalMs);
    }
  };
  setTimeout(tick, intervalMs);

  return { stop: () => { stopped = true; } };
}
