import { runOnce } from './loop.js';
import type { RelayerConfig, ChainAdapter } from './types.js';
export interface DaemonHandle {
  stop(): Promise<void>;
}
export function startDaemon(
  cfg: RelayerConfig,
  chain: ChainAdapter,
  intervalMs = 2000,
): DaemonHandle {
  if (cfg.mode !== 'preview')
    throw new Error(
      'Daemon supports preview only; execution requires per-transaction approval and an operator-injected signer',
    );
  let stopped = false,
    pending: Promise<void> | undefined,
    timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    pending = (async () => {
      try {
        const result = await runOnce(cfg, chain);
        if (result.processed) console.log(JSON.stringify(result));
      } catch {
        console.error(
          '[relayer] read-only scan failed; sensitive details withheld',
        );
      }
    })();
    await pending;
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}
