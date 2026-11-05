import test from 'node:test';
import assert from 'node:assert/strict';
import { publicKeystoreAddress } from '../scripts/poc/wallet-metadata.mjs';

test('wallet metadata returns only the public address from a version-3 encrypted keystore', () => {
  const address = '1000000000000000000000000000000000000001';
  const encryptedFixture = {
    version: 3,
    address,
    crypto: {
      cipher: 'aes-128-ctr',
      ciphertext: 'fixture-encrypted-data',
      kdf: 'scrypt',
    },
  };
  assert.equal(publicKeystoreAddress(encryptedFixture, 0o600), `0x${address}`);
});
test('wallet metadata refuses loose permissions, plaintext fields, and malformed files without echoing contents', () => {
  const fixture = {
    version: 3,
    address: '1000000000000000000000000000000000000001',
    crypto: { cipher: 'aes-128-ctr', ciphertext: 'fixture', kdf: 'scrypt' },
  };
  assert.throws(() => publicKeystoreAddress(fixture, 0o644), /permissions/);
  assert.throws(
    () =>
      publicKeystoreAddress({ ...fixture, privateKey: 'DO_NOT_ECHO' }, 0o600),
    (error) =>
      !error.message.includes('DO_NOT_ECHO') && /plaintext/.test(error.message),
  );
  assert.throws(
    () => publicKeystoreAddress({ address: fixture.address }, 0o600),
    /encrypted/,
  );
});

test('Foundry keystores without address metadata can use a separately derived public address', () => {
  const fixture = {
    version: 3,
    crypto: { cipher: 'aes-128-ctr', ciphertext: 'fixture', kdf: 'scrypt' },
  };
  const expected = '0x52908400098527886E0F7030069857D2E4169EE7';
  assert.equal(publicKeystoreAddress(fixture, 0o600, expected), expected);
  assert.throws(() => publicKeystoreAddress(fixture, 0o600), /public address/i);
});

test('public address normalization accepts prefixed and unprefixed 20-byte values', async () => {
  const { normalizePublicAddress } = await import(
    '../scripts/poc/wallet-metadata.mjs'
  );
  const expected = '0x52908400098527886E0F7030069857D2E4169EE7';
  for (const input of [
    expected,
    expected.slice(2),
    expected.toLowerCase(),
    `0X${expected.slice(2)}`,
  ]) {
    assert.equal(normalizePublicAddress(input), expected);
  }
  for (const input of [
    undefined,
    null,
    '',
    '0x',
    'ab'.repeat(19),
    'ab'.repeat(21),
    `0x${'gg'.repeat(20)}`,
    '0x0x' + 'ab'.repeat(20),
    ` ${expected}`,
    '0'.repeat(40),
    Array(20).fill(1),
  ]) {
    assert.throws(() => normalizePublicAddress(input), /public address/i);
  }
});

test('malformed address metadata and disagreement with derived addresses are never hidden by fallback', () => {
  const fixture = {
    version: 3,
    crypto: { cipher: 'aes-128-ctr', ciphertext: 'fixture', kdf: 'scrypt' },
  };
  const derived = '0x1000000000000000000000000000000000000001';
  assert.throws(
    () => publicKeystoreAddress({ ...fixture, address: 'bad' }, 0o600, derived),
    /public address/i,
  );
  assert.throws(
    () =>
      publicKeystoreAddress(
        { ...fixture, address: '1000000000000000000000000000000000000002' },
        0o600,
        derived,
      ),
    /mismatch/i,
  );
});

test('public address manifest rejects missing, malformed, wrong-chain, and duplicate addresses after normalization', async () => {
  const { normalizePublicWallets } = await import(
    '../scripts/poc/wallet-metadata.mjs'
  );
  const roles = ['deployer', 'relayer', 'payer', 'merchant', 'feeRecipient'];
  const manifest = {
    chainId: 1874,
    ...Object.fromEntries(
      roles.map((role, i) => [role, '1' + String(i + 1).padStart(39, '0')]),
    ),
  };
  const normalized = normalizePublicWallets(manifest);
  assert.equal(normalized.chainId, 1874);
  assert.equal(normalized.payer, `0x${manifest.payer}`);
  assert.throws(
    () => normalizePublicWallets({ ...manifest, chainId: 1875 }),
    /1874/,
  );
  assert.throws(
    () => normalizePublicWallets({ ...manifest, payer: undefined }),
    /public address/i,
  );
  assert.throws(
    () => normalizePublicWallets({ ...manifest, payer: 'xyz' }),
    /public address/i,
  );
  assert.throws(
    () =>
      normalizePublicWallets({ ...manifest, payer: `0x${manifest.deployer}` }),
    /distinct/,
  );
  assert.throws(
    () => normalizePublicWallets({ ...manifest, password: 'DO_NOT_ECHO' }),
    (error) =>
      /public fields/.test(error.message) &&
      !error.message.includes('DO_NOT_ECHO'),
  );
});
