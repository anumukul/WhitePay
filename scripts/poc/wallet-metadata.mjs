import { getAddress, zeroAddress } from 'viem';
import { ROLES } from './plan.mjs';

/** Extract public metadata only; never decrypt or return encrypted key material. */
export function publicKeystoreAddress(keyfile, mode, derivedPublicAddress) {
  if ((mode & 0o077) !== 0)
    throw new Error('Keystore permissions must be owner-only (chmod 600)');
  if (!keyfile || typeof keyfile !== 'object' || Array.isArray(keyfile))
    throw new Error('Expected an encrypted version-3 keystore');
  if (
    Object.keys(keyfile).some((key) =>
      /private|seed|mnemonic|secret|password/i.test(key),
    )
  )
    throw new Error('Refusing plaintext secret fields in keystore');
  const crypto = keyfile.crypto ?? keyfile.Crypto;
  if (
    keyfile.version !== 3 ||
    !crypto ||
    crypto.cipher !== 'aes-128-ctr' ||
    !crypto.ciphertext ||
    !['scrypt', 'pbkdf2'].includes(crypto.kdf)
  )
    throw new Error('Expected an encrypted version-3 keystore');
  const derived =
    derivedPublicAddress === undefined
      ? undefined
      : normalizePublicAddress(derivedPublicAddress);
  if (!Object.hasOwn(keyfile, 'address')) {
    if (!derived)
      throw new Error(
        'Keystore public address is absent; run pnpm poc:wallet-addresses in your own terminal',
      );
    return derived;
  }
  const embedded = normalizePublicAddress(keyfile.address);
  if (derived && embedded !== derived)
    throw new Error(
      'Keystore public address mismatch with separately derived address',
    );
  return embedded;
}

/** Foundry address metadata may contain 40 hex digits without a prefix. */
export function normalizePublicAddress(raw) {
  if (typeof raw !== 'string' || !/^(?:0x)?[0-9a-f]{40}$/i.test(raw))
    throw new Error('Keystore public address is missing or invalid');
  const payload = raw.replace(/^0x/i, '').toLowerCase();
  const address = `0x${payload}`;
  if (address === zeroAddress)
    throw new Error('Keystore public address is missing or invalid');
  return getAddress(address);
}

export function normalizePublicWallets(manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.keys(manifest).some((key) => !['chainId', ...ROLES].includes(key))
  )
    throw new Error('Address manifest accepts public fields only');
  if (manifest.chainId !== 1874)
    throw new Error('Address manifest requires chain 1874');
  const result = { chainId: 1874 };
  for (const role of ROLES)
    result[role] = normalizePublicAddress(manifest[role]);
  if (new Set(ROLES.map((role) => result[role])).size !== ROLES.length)
    throw new Error('Wallet addresses must be distinct');
  return result;
}
