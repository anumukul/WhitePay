// Run in a real terminal. Uses a temporary test double and in-memory signer, never real wallets.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, chmod, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keccak256, serializeTransaction } from 'viem';
import {
  createFoundryKeystoreSigner,
  privateTerminalAvailable,
} from '../src/keystore.js';
if (!process.argv.includes('--child')) {
  if (!privateTerminalAvailable()) {
    console.error(
      'Run test:terminal in your private interactive terminal. It never requests a real wallet password.',
    );
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      require.resolve('tsx/esm'),
      fileURLToPath(import.meta.url),
      '--child',
    ],
    { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  process.stdout.write(result.stdout ?? '');
  process.exitCode = result.status ?? 1;
} else {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'wp-terminal-regression-')),
  );
  await chmod(directory, 0o700);
  const file = join(directory, 'encrypted-test-double');
  await writeFile(file, 'encrypted-test-double', { mode: 0o600 });
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const tx = {
      type: 'eip1559' as const,
      chainId: 1874 as const,
      to: '0xcccccccccccccccccccccccccccccccccccccccc' as const,
      value: 0n as const,
      data: '0x1234' as const,
      nonce: 0,
      gas: 180000n,
      maxFeePerGas: 20000000000n,
      maxPriorityFeePerGas: 1000000n,
    };
    const hash = keccak256(serializeTransaction(tx));
    const signer = createFoundryKeystoreSigner({
      keystore: file,
      address: account.address,
      approvedUnsignedHash: hash,
      run: async () => ({ status: 0, stdout: await account.sign({ hash }) }),
    });
    await signer(tx);
    console.log(
      JSON.stringify({
        status: 'PASS',
        stdinTTY: !!process.stdin.isTTY,
        stdoutTTY: !!process.stdout.isTTY,
        privateTerminalAvailable: privateTerminalAvailable(),
        realWalletAccessed: false,
      }),
    );
  } catch {
    console.error('Terminal guard regression failed; signer output withheld.');
    process.exitCode = 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
