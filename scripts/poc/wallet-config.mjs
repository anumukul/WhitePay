import { lstat, readFile, writeFile } from 'node:fs/promises';
import { ROLES, validateConfig } from './plan.mjs';
import {
  publicKeystoreAddress,
  normalizePublicWallets,
} from './wallet-metadata.mjs';

// Reads encrypted-file metadata only. No key creation, decryption, signing, or RPC access.
try {
  const config = JSON.parse(
    await readFile('docs/evidence/poc-config.example.json', 'utf8'),
  );
  let publicAddresses;
  try {
    const raw = await readFile(
      'docs/evidence/wallet-public-addresses.json',
      'utf8',
    );
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid public-address manifest JSON');
    }
    publicAddresses = normalizePublicWallets(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const directory = 'keystores/whitepay-sepolia';
  const directoryStat = await lstat(directory);
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    directoryStat.mode & 0o077
  )
    throw new Error(
      'Wallet directory must be a real owner-only directory (chmod 700)',
    );
  for (const role of ROLES) {
    const path = `${directory}/${role}`;
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Expected regular encrypted ${role} keystore file`);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new Error(
        `Cannot parse ${role} encrypted keystore; inspect privately`,
      );
    }
    config[role] = publicKeystoreAddress(
      parsed,
      stat.mode,
      publicAddresses?.[role],
    );
  }
  validateConfig(config);
  const output = 'docs/evidence/poc-config.json';
  await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Saved public-only config: ${output} (configured chainId: ${config.chainId})`,
  );
  for (const role of ROLES) console.log(`${role}: ${config[role]}`);
  console.log(
    'Wallets are not funded or chain-verified yet. Run the read-only preflight next.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.error(
      'Public config already exists; refusing to overwrite. Review it before any changes.',
    );
  else if (error.code === 'ENOENT')
    console.error(
      'A required wallet file or config is missing; check existing paths. Do not recreate or overwrite wallets.',
    );
  else console.error(error.message);
  process.exitCode = 1;
}
