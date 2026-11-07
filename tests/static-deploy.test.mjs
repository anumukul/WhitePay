import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageStatic } from '../scripts/lib/static-deploy.mjs';
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'whitepay-static-test-'));
  try {
    const source = join(root, 'out');
    await mkdir(source);
    await writeFile(join(source, 'index.html'), '<h1>Public testnet page</h1>');
    await run(source, join(root, 'stage'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('stages only audited static files with a public content hash and clean URL configuration', () =>
  fixture(async (source, destination) => {
    const result = await stageStatic({
      source,
      destination,
      required: ['index.html'],
    });
    assert.equal(result.files.length, 1);
    assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual((await readdir(destination)).sort(), [
      'index.html',
      'vercel.json',
    ]);
  }));
test('rejects a private file before uploading anything', () =>
  fixture(async (source, destination) => {
    await writeFile(join(source, '.env'), 'not-a-real-secret');
    await assert.rejects(
      stageStatic({ source, destination, required: ['index.html'] }),
      /private or unsupported/,
    );
  }));
test('rejects symlinks and refuses a missing required route', () =>
  fixture(async (source, destination) => {
    await assert.rejects(
      stageStatic({ source, destination, required: ['pitch.html'] }),
      /Required public file missing/,
    );
    await symlink(join(source, 'index.html'), join(source, 'linked.html'));
    await assert.rejects(
      stageStatic({ source, destination, required: ['index.html'] }),
      /Symlinks/,
    );
  }));
test('rejects secret-shaped content without printing its value', () =>
  fixture(async (source, destination) => {
    await writeFile(
      join(source, 'client.js'),
      'const fixture="wp_sk_' + '0'.repeat(48) + '";',
    );
    await assert.rejects(
      stageStatic({ source, destination, required: ['index.html'] }),
      (error) =>
        error.message === 'Credential-shaped content detected; value withheld',
    );
  }));
