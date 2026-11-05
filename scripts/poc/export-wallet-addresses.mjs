import { spawn } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { ROLES } from './plan.mjs';
import {
  normalizePublicAddress,
  normalizePublicWallets,
  publicKeystoreAddress,
} from './wallet-metadata.mjs';

// Run only in the user's private terminal. Cast handles password prompts and
// decryption internally; this process receives only the public address on stdout.
async function deriveAddress(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('cast', ['wallet', 'address', '--keystore', path], {
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: false,
    });
    let output = '';
    let overflow = false;
    child.stdout.on('data', (chunk) => {
      if (output.length + chunk.length > 256) overflow = true;
      else output += chunk.toString('utf8');
    });
    child.on('error', () =>
      reject(new Error('Could not run cast wallet address')),
    );
    child.on('close', (code) => {
      if (code !== 0 || overflow)
        return reject(
          new Error('Public-address derivation failed; no manifest written'),
        );
      try {
        resolve(normalizePublicAddress(output.trim()));
      } catch {
        reject(
          new Error(
            'Cast did not return a single valid public address; no output displayed',
          ),
        );
      }
    });
  });
}

try {
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new Error(
      'Run pnpm poc:wallet-addresses in your own interactive terminal; passwords must never be supplied through chat or command arguments',
    );
  const directory = 'keystores/whitepay-sepolia';
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error('Wallet directory must be owner-only (chmod 700)');
  const addresses = { chainId: 1874 };
  for (const role of ROLES) {
    const path = `${directory}/${role}`;
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Expected regular encrypted ${role} keystore file`);
    let metadata;
    try {
      metadata = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new Error(
        `Cannot parse ${role} encrypted keystore; inspect privately`,
      );
    }
    console.error(
      `Verify ${role}: enter its keystore password at Cast's hidden prompt.`,
    );
    const derived = await deriveAddress(path);
    addresses[role] = publicKeystoreAddress(metadata, stat.mode, derived);
  }
  const normalized = normalizePublicWallets(addresses);
  const output = 'docs/evidence/wallet-public-addresses.json';
  try {
    await writeFile(output, `${JSON.stringify(normalized, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try {
      previous = normalizePublicWallets(
        JSON.parse(await readFile(output, 'utf8')),
      );
    } catch {
      throw new Error(
        'Existing public manifest is invalid; refusing to overwrite',
      );
    }
    if (ROLES.some((role) => previous[role] !== normalized[role]))
      throw new Error(
        'Existing manifest differs from cast-derived public addresses; refusing to overwrite',
      );
  }
  console.log(
    `Verified 5/5 addresses against cast wallet address --keystore. Configured chainId: ${normalized.chainId}.`,
  );
  for (const role of ROLES) console.log(`${role}: ${normalized[role]}`);
  console.log(
    `Public-address manifest: ${output}. No wallet created and no transaction signed or sent.`,
  );
} catch (error) {
  console.error(
    error.code
      ? 'Public-address export failed; no key material displayed'
      : error.message,
  );
  process.exitCode = 1;
}
