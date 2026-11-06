import { migrate, closeDb } from './db.js';
import { createApp } from './app.js';
const port = Number(process.env.PORT ?? 3001);
let stopping = false;
// Keep the process (and liveness endpoint) up while PostgreSQL is unavailable.
// Readiness stays 503 until migrations complete, so orchestrators withhold traffic.
const initialization = (async () => {
  while (!stopping) {
    try {
      await migrate();
      console.log('[whitepay-api] database migrated and ready');
      return;
    } catch {
      console.error(
        '[whitepay-api] database initialization failed; retrying without exposing credentials',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
})();
const server = createApp().listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`[whitepay-api] listening on port ${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    stopping = true;
    server.close(() => {
      void initialization
        .catch(() => {})
        .then(() => closeDb())
        .finally(() => process.exit(0));
    });
  });
