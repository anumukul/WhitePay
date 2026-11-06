import { lstat, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { isatty } from 'node:tty';
import {
  keccak256,
  serializeTransaction,
  parseSignature,
  recoverAddress,
  type Hex,
} from 'viem';
import type { UnsignedTransaction } from './types.js';
interface CastResult {
  status: number | null;
  stdout: string;
}
interface Options {
  keystore: string;
  address: Hex;
  approvedUnsignedHash: Hex;
  interactive?: boolean;
  run?: (args: string[], env: NodeJS.ProcessEnv) => Promise<CastResult>;
}
function openPrivateTerminal(): number {
  const candidates = [
    '/dev/tty',
    ...(process.stdin.isTTY ? ['/dev/fd/0'] : []),
  ];
  for (const path of candidates) {
    let fd: number | undefined;
    try {
      fd = openSync(path, 'r+');
      if (isatty(fd)) return fd;
    } catch {}
    if (fd !== undefined) closeSync(fd);
  }
  throw new Error('private_terminal_required');
}
export function privateTerminalAvailable(): boolean {
  if (process.platform === 'win32')
    return !!(process.stdin.isTTY && process.stderr.isTTY);
  let fd: number | undefined;
  try {
    fd = openPrivateTerminal();
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export async function runCastPrivately(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CastResult> {
  let fd: number | undefined;
  try {
    if (process.platform !== 'win32') fd = openPrivateTerminal();
    else if (!privateTerminalAvailable())
      throw new Error('private_terminal_required');
    const r = spawnSync('cast', args, {
      env,
      stdio: [fd ?? 'inherit', 'pipe', fd ?? 'inherit'],
      encoding: 'utf8',
      maxBuffer: 4096,
    });
    return { status: r.status, stdout: r.stdout ?? '' };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function foundryEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    'ETH_PASSWORD',
    'ETH_PASSWORD_FILE',
    'ETH_PRIVATE_KEY',
    'RELAYER_PRIVATE_KEY',
    'PRIVATE_KEY',
    'MNEMONIC',
    'ETH_KEYSTORE',
    'ETH_FROM',
  ])
    delete env[name];
  return env;
}
/** Sign an already approved EIP-1559 hash in the user's private terminal. No RPC or broadcast. */
export function createFoundryKeystoreSigner(
  options: Options,
): (tx: UnsignedTransaction) => Promise<Hex> {
  return async (tx) => {
    if (!(options.interactive ?? privateTerminalAvailable()))
      throw new Error(
        'Use a private interactive terminal for the hidden keystore password prompt',
      );
    if (tx.chainId !== 1874) throw new Error('Expected chain 1874');
    const hash = keccak256(serializeTransaction(tx));
    if (hash !== options.approvedUnsignedHash)
      throw new Error(
        'Signing refused: payload differs from approved transaction',
      );
    const path = resolve(options.keystore);
    const info = await lstat(path),
      folder = await lstat(dirname(path));
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (await realpath(path)) !== path ||
      !folder.isDirectory() ||
      folder.isSymbolicLink()
    )
      throw new Error('Keystore must be a real file in a real directory');
    if ((info.mode & 0o777) !== 0o600)
      throw new Error('Encrypted keystore must have permissions 0600');
    if ((folder.mode & 0o777) !== 0o700)
      throw new Error('Keystore directory must have permissions 0700');
    if (process.getuid && info.uid !== process.getuid())
      throw new Error('Keystore must be owned by the current user');
    const env = foundryEnvironment();
    // Only a public hash is passed as the message. Transaction calldata and signatures stay out of argv.
    const args = [
      'wallet',
      'sign',
      '--no-hash',
      hash,
      '--from',
      options.address,
      '--keystore',
      path,
    ];
    const run = options.run ?? runCastPrivately;
    let result: CastResult;
    try {
      result = await run(args, env);
    } catch {
      throw new Error('Keystore signing failed; sensitive output withheld');
    }
    const signature = result.stdout.trim();
    if (result.status !== 0 || !/^0x[0-9a-fA-F]{130}$/.test(signature))
      throw new Error(
        'Keystore signing failed or returned malformed output; sensitive output withheld',
      );
    try {
      if (
        (
          await recoverAddress({ hash, signature: signature as Hex })
        ).toLowerCase() !== options.address.toLowerCase()
      )
        throw new Error('unexpected signer');
      return serializeTransaction(tx, parseSignature(signature as Hex));
    } catch {
      throw new Error(
        'Keystore signature verification failed; sensitive output withheld',
      );
    }
  };
}
