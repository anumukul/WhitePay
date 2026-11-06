import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  resetDbForTests,
  closeDb,
  getDb,
  migrate,
  transaction,
} from '../src/db.js';
before(async () => {
  await resetDbForTests(randomUUID());
});
after(async () => {
  await closeDb();
});
test('migration up is repeatable and checksum changes are rejected', async () => {
  await migrate();
  assert.equal(
    (await getDb().query('SELECT * FROM schema_migrations')).rows.length,
    5,
  );
  await getDb().query(
    "UPDATE schema_migrations SET checksum='tampered' WHERE version=1",
  );
  await assert.rejects(() => migrate(), /checksum/);
  // Test transaction itself restores the original checksum using the migration file.
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const sql = await readFile(
    new URL('../migrations/001-initial.up.sql', import.meta.url),
  );
  await getDb().query(
    'UPDATE schema_migrations SET checksum=$1 WHERE version=1',
    [createHash('sha256').update(sql).digest('hex')],
  );
});
test('failed transactional DDL leaves no partial schema or version', async () => {
  await assert.rejects(
    () =>
      transaction(async (c) => {
        await c.query('CREATE TABLE partial_migration(id text)');
        throw new Error('injected failure');
      }),
    /injected/,
  );
  assert.equal(
    (await getDb().query("SELECT to_regclass('partial_migration') AS name"))
      .rows[0].name,
    null,
  );
  assert.equal(
    (await getDb().query('SELECT version FROM schema_migrations')).rows.length,
    5,
  );
});
test('down removes schema and up reconstructs it cleanly', async () => {
  await migrate('down');
  assert.equal(
    (await getDb().query("SELECT to_regclass('merchants') AS name")).rows[0]
      .name,
    null,
  );
  assert.equal(
    (await getDb().query('SELECT * FROM schema_migrations')).rows.length,
    0,
  );
  await migrate();
  assert.equal(
    (await getDb().query('SELECT count(*) FROM merchants')).rows[0].count,
    '0',
  );
});

test('Step 06 migration upgrades Step 05 data without rewriting accepted schema', async () => {
  await getDb().query('DROP TABLE relay_attempts');
  await getDb().query('DELETE FROM schema_migrations WHERE version=2');
  await getDb().query(
    "INSERT INTO merchants VALUES('mer_upgrade','Preserved','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'synthetic',0)",
  );
  await migrate();
  assert.equal(
    (await getDb().query("SELECT name FROM merchants WHERE id='mer_upgrade'"))
      .rows[0].name,
    'Preserved',
  );
  assert.equal(
    (await getDb().query('SELECT * FROM schema_migrations')).rows.length,
    5,
  );
  assert.equal(
    (await getDb().query('SELECT * FROM relay_attempts')).rows.length,
    0,
  );
});
