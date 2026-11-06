import { scanAndPersist } from './loop.js';
import type { WorkerConfig, WorkerReader } from './types.js';
export function startDaemon(
  cfg: WorkerConfig,
  reader: WorkerReader,
  intervalMs = 3000,
) {
  let stopped = false,
    pending: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    try {
      pending = scanAndPersist(cfg, reader);
      const result = await pending;
      console.log(JSON.stringify(result));
    } catch {
      console.error(
        '[worker] scan stopped; sanitized diagnostics only; cursor retained',
      );
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };
  timer = setTimeout(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending?.catch(() => {});
    },
  };
}

export function startDeliveryDaemon(
  cfg: import('./webhooks.js').DeliveryConfig,
  intervalMs = 1000,
) {
  if (!cfg.allowedOrigins.length) throw new Error('webhook_origins_required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 10)
    throw new Error('invalid_delivery_interval');
  let stopped = false;
  let pending: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    try {
      pending = import('./webhooks.js').then(({ dispatchOnce }) =>
        dispatchOnce(cfg),
      );
      const result = await pending;
      console.log(JSON.stringify(result));
    } catch {
      console.error(
        '[worker] delivery stopped; sanitized diagnostics only; durable outbox retained',
      );
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };
  timer = setTimeout(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending?.catch(() => {});
    },
  };
}
