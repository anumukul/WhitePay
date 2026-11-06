import { Pool, type PoolClient } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export type DB = Pool;
let singleton: Pool | null = null;
let testSchema: string | null = null;
export function getDb(): Pool {
  if (singleton) return singleton;
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url))
    throw new Error(
      'DATABASE_URL must identify PostgreSQL; SQLite files are not migrated automatically',
    );
  singleton = new Pool({ connectionString: url, max: 10 });
  // Idle-client failures (for example a database restart) must surface through
  // readiness, not crash the API process. Diagnostics stay sanitized.
  singleton.on('error', () => {});
  return singleton;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function migrate(direction: 'up' | 'down' = 'up'): Promise<void> {
  await transaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(18740005)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL)',
    );
    const folder = new URL('../migrations/', import.meta.url);
    const files = (await readdir(folder))
      .filter((f) => /^\d+-.*\.up\.sql$/.test(f))
      .sort();
    for (const file of direction === 'up' ? files : [...files].reverse()) {
      const version = Number(file.split('-')[0]);
      const up = await readFile(new URL(file, folder), 'utf8');
      const checksum = createHash('sha256').update(up).digest('hex');
      const existing = (
        await c.query(
          'SELECT checksum FROM schema_migrations WHERE version=$1',
          [version],
        )
      ).rows[0];
      if (existing && existing.checksum !== checksum)
        throw new Error('Migration checksum mismatch');
      if (direction === 'up' && !existing) {
        await c.query(up);
        await c.query('INSERT INTO schema_migrations VALUES($1,$2)', [
          version,
          checksum,
        ]);
      }
      if (direction === 'down' && existing) {
        await c.query(
          await readFile(
            new URL(file.replace('.up.sql', '.down.sql'), folder),
            'utf8',
          ),
        );
        await c.query('DELETE FROM schema_migrations WHERE version=$1', [
          version,
        ]);
      }
    }
  });
}
export async function closeDb(): Promise<void> {
  if (!singleton) return;
  const pool = singleton;
  singleton = null;
  if (testSchema) {
    const schema = testSchema;
    testSchema = null;
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await pool.end();
}
export async function resetDbForTests(scope: string): Promise<Pool> {
  await closeDb();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url))
    throw new Error(
      'Set TEST_DATABASE_URL to an isolated PostgreSQL test database',
    );
  const schema =
    'wp_test_' + createHash('sha256').update(scope).digest('hex').slice(0, 20);
  const admin = new Pool({ connectionString: url });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
  singleton = new Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
    max: 10,
  });
  singleton.on('error', () => {});
  testSchema = schema;
  await migrate();
  return singleton;
}
