import { migrate, closeDb } from './db.js';
import { createApp } from './app.js';
try {
  await migrate();
} catch {
  console.error(
    'API database initialization failed; verify PostgreSQL configuration and migration state locally.',
  );
  await closeDb();
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3001);
const server = createApp().listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`[whitepay-api] listening on port ${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () =>
    server.close(() => {
      void closeDb();
    }),
  );
