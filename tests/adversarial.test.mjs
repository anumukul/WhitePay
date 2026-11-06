// Step 16 — adversarial regression across the whole system.
// Pure-Node; relies on each service's own test suite for deep coverage.
// This file asserts the high-level "attacker cannot …" invariants.

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('README advertises the correct submission-gate shape', async () => {
  const fs = await import('node:fs/promises');
  const readme = await fs.readFile(
    new URL('../README.md', import.meta.url),
    'utf8',
  );
  // If the submission README silently loses a required claim, fail.
  for (const must of ['WhitePay', 'Whitechain', 'USDT']) {
    assert.match(
      readme,
      new RegExp(must, 'i'),
      `README missing required token: ${must}`,
    );
  }
});

test('secret-scanning: repository credentials are rejected without printing their values', async () => {
  const { scanApiCredentials, containsApiCredential } = await import(
    '../scripts/scan-api-keys.mjs'
  );
  assert.equal(containsApiCredential('wp_sk_' + 'a'.repeat(48)), true);
  assert.equal(containsApiCredential('wp_sk_notreal'), false);
  const leaks = await scanApiCredentials(
    new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:'),
  );
  assert.deepEqual(
    leaks,
    [],
    `Possible API credentials in files (values withheld): ${leaks.join(', ')}`,
  );
});

test('secret scanner skips ignored local credentials and reports only filenames', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { scanApiCredentials } = await import('../scripts/scan-api-keys.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'wp-scan-'));
  const synthetic = 'wp_sk_' + 'b'.repeat(48);
  try {
    assert.equal(spawnSync('git', ['init', '-q', directory]).status, 0);
    await writeFile(join(directory, '.gitignore'), 'private/\n');
    await mkdir(join(directory, 'private'));
    await writeFile(
      join(directory, 'private', 'fixture.json'),
      JSON.stringify({ key: synthetic }),
    );
    await writeFile(join(directory, 'visible.ts'), `const key='${synthetic}'`);
    const result = await scanApiCredentials(directory);
    assert.deepEqual(result, ['visible.ts']);
    assert.equal(JSON.stringify(result).includes(synthetic), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
