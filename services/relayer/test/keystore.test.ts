import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  chmod,
  rm,
  symlink,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  keccak256,
  serializeTransaction,
  recoverTransactionAddress,
} from 'viem';
import { createFoundryKeystoreSigner } from '../src/keystore.js';
import type { UnsignedTransaction } from '../src/types.js';
const tx: UnsignedTransaction = {
  type: 'eip1559',
  chainId: 1874,
  to: '0xcccccccccccccccccccccccccccccccccccccccc',
  nonce: 0,
  gas: 180000n,
  maxFeePerGas: 20000000000n,
  maxPriorityFeePerGas: 1000000n,
  value: 0n,
  data: '0x1234',
};
async function fixture() {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'wp-encrypted-signer-')),
  );
  await chmod(directory, 0o700);
  const file = join(directory, 'encrypted-keystore');
  await writeFile(file, 'encrypted-keystore-test-double', { mode: 0o600 });
  return { directory, file };
}
test('encrypted signer refuses noninteractive execution before invoking Cast', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  let calls = 0;
  const signer = createFoundryKeystoreSigner({
    keystore: '/not-read',
    address: account.address,
    approvedUnsignedHash: keccak256(serializeTransaction(tx)),
    interactive: false,
    run: async () => {
      calls++;
      throw new Error('must not invoke');
    },
  });
  await assert.rejects(() => signer(tx), /private interactive terminal/);
  assert.equal(calls, 0);
});
test('encrypted signer signs only approved digest and never passes calldata/password/private key to Cast', async () => {
  const f = await fixture();
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const hash = keccak256(serializeTransaction(tx));
    let calls = 0;
    const signer = createFoundryKeystoreSigner({
      keystore: f.file,
      address: account.address,
      approvedUnsignedHash: hash,
      interactive: true,
      run: async (args, env) => {
        calls++;
        assert.ok(args.includes('--no-hash'));
        assert.ok(args.includes(hash));
        assert.ok(!args.includes(tx.data));
        for (const flag of [
          '--private-key',
          '--mnemonic',
          '--password',
          '--password-file',
        ])
          assert.ok(!args.includes(flag));
        assert.equal(env.ETH_PASSWORD, undefined);
        return { status: 0, stdout: await account.sign({ hash }) };
      },
    });
    const raw = await signer(tx);
    assert.equal(
      (
        await recoverTransactionAddress({
          serializedTransaction: raw as `0x02${string}`,
        })
      ).toLowerCase(),
      account.address.toLowerCase(),
    );
    assert.equal(calls, 1);
    await assert.rejects(
      () => signer({ ...tx, nonce: 1 }),
      /approved transaction/,
    );
    assert.equal(calls, 1);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test('encrypted signer rejects loose keystore permissions without invoking Cast', async () => {
  const f = await fixture();
  try {
    await chmod(f.file, 0o644);
    const account = privateKeyToAccount(generatePrivateKey());
    let calls = 0;
    const signer = createFoundryKeystoreSigner({
      keystore: f.file,
      address: account.address,
      approvedUnsignedHash: keccak256(serializeTransaction(tx)),
      interactive: true,
      run: async () => {
        calls++;
        throw new Error('must not invoke');
      },
    });
    await assert.rejects(() => signer(tx), /0600/);
    assert.equal(calls, 0);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test('encrypted signer rejects symlinks and withholds malformed signer output', async () => {
  const f = await fixture();
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const options = {
      address: account.address,
      approvedUnsignedHash: keccak256(serializeTransaction(tx)),
      interactive: true,
      run: async () => ({ status: 0, stdout: 'sensitive invalid output' }),
    };
    const link = join(f.directory, 'alias');
    await symlink(f.file, link);
    await assert.rejects(
      () => createFoundryKeystoreSigner({ ...options, keystore: link })(tx),
      /real file/,
    );
    await assert.rejects(
      () => createFoundryKeystoreSigner({ ...options, keystore: f.file })(tx),
      (e) =>
        e instanceof Error && !e.message.includes('sensitive invalid output'),
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('encrypted signer rejects a signature recovered to a different wallet', async () => {
  const f = await fixture();
  try {
    const expected = privateKeyToAccount(generatePrivateKey()),
      other = privateKeyToAccount(generatePrivateKey());
    const hash = keccak256(serializeTransaction(tx));
    const signer = createFoundryKeystoreSigner({
      keystore: f.file,
      address: expected.address,
      approvedUnsignedHash: hash,
      interactive: true,
      run: async () => ({ status: 0, stdout: await other.sign({ hash }) }),
    });
    await assert.rejects(() => signer(tx), /verification failed/);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
