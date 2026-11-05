import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizePublicWallets } from '../scripts/poc/wallet-metadata.mjs';

const configScript = fileURLToPath(
  new URL('../scripts/poc/wallet-config.mjs', import.meta.url),
);
const exportScript = fileURLToPath(
  new URL('../scripts/poc/export-wallet-addresses.mjs', import.meta.url),
);
const example = readFileSync(
  new URL('../docs/evidence/poc-config.example.json', import.meta.url),
  'utf8',
);
const roles = ['deployer', 'relayer', 'payer', 'merchant', 'feeRecipient'];
const fixtureManifest = () => ({
  chainId: 1874,
  ...Object.fromEntries(
    roles.map((role, i) => [
      role,
      (i % 2 ? '0x' : '') + '1' + String(i + 1).padStart(39, '0'),
    ]),
  ),
});
const hiddenSentinel = 'TEST_OPAQUE_CONTENT_MUST_NEVER_BE_PRINTED';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'whitepay-wallet-config-'));
  mkdirSync(join(directory, 'docs/evidence'), { recursive: true });
  mkdirSync(join(directory, 'keystores/whitepay-sepolia'), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    join(directory, 'docs/evidence/poc-config.example.json'),
    example,
  );
  for (const role of roles) {
    // Matches observed Foundry field names, without actual encrypted key material.
    writeFileSync(
      join(directory, 'keystores/whitepay-sepolia', role),
      JSON.stringify({
        version: 3,
        id: 'synthetic-test-only',
        crypto: {
          cipher: 'aes-128-ctr',
          ciphertext: hiddenSentinel,
          kdf: 'scrypt',
          kdfparams: { testOnly: hiddenSentinel },
        },
      }),
      { mode: 0o600 },
    );
  }
  return directory;
}
const run = (script, cwd) =>
  spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });

test('wallet-config exports all five Foundry addresses using only the public manifest', () => {
  const directory = fixture();
  try {
    const manifest = fixtureManifest();
    writeFileSync(
      join(directory, 'docs/evidence/wallet-public-addresses.json'),
      JSON.stringify(manifest),
    );
    const result = run(configScript, directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /configured chainId: 1874/);
    const config = JSON.parse(
      readFileSync(join(directory, 'docs/evidence/poc-config.json'), 'utf8'),
    );
    const expected = normalizePublicWallets(manifest);
    for (const role of roles) {
      assert.equal(config[role], expected[role]);
      assert.ok(result.stdout.includes(`${role}: ${expected[role]}`));
    }
    assert.equal(config.chainId, 1874);
    assert.doesNotMatch(
      result.stdout + result.stderr + JSON.stringify(config),
      /TEST_OPAQUE_CONTENT|ciphertext|kdfparams|synthetic-test-only/,
    );
    const rerun = run(configScript, directory);
    assert.equal(rerun.status, 1);
    assert.match(rerun.stderr, /refusing to overwrite/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('wallet-config refuses absent, malformed and duplicate public addresses without writing partial config', () => {
  const directory = fixture();
  try {
    for (const manifest of [
      undefined,
      { ...fixtureManifest(), payer: 'bad' },
      { ...fixtureManifest(), payer: fixtureManifest().deployer },
    ]) {
      if (manifest)
        writeFileSync(
          join(directory, 'docs/evidence/wallet-public-addresses.json'),
          JSON.stringify(manifest),
        );
      const result = run(configScript, directory);
      assert.equal(result.status, 1);
      assert.equal(
        existsSync(join(directory, 'docs/evidence/poc-config.json')),
        false,
      );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /TEST_OPAQUE_CONTENT|ciphertext|kdfparams/,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('address exporter refuses noninteractive execution before requesting any password', () => {
  const directory = fixture();
  try {
    const result = run(exportScript, directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /own interactive terminal/);
    assert.equal(
      existsSync(join(directory, 'docs/evidence/wallet-public-addresses.json')),
      false,
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /TEST_OPAQUE_CONTENT|ciphertext|kdfparams/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
