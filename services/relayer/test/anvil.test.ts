import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { WhitePayChainClient } from '@whitepay/chain';
import {
  spawnAnvil,
  readForgeArtifact,
  repoRoot,
} from '../../../packages/chain/test/anvil-helper.js';
import { closeDb } from '@whitepay/api/src/db.js';
import { fixture } from './fixtures.js';
import { runOnce } from '../src/loop.js';
import { createRelayerAdapter } from '../src/chain.js';
test('PostgreSQL queue plus real Anvil RPC rejects failed checkout simulation without signing', async () => {
  const anvil = await spawnAnvil({ chainId: 1874 });
  try {
    const chain = defineChain({
      id: 1874,
      name: 'local test only',
      nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    });
    const pub = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
    const deployer = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(anvil.deployerPrivateKey),
    });
    const artifact = await readForgeArtifact(
      join(
        repoRoot(),
        'packages/contracts/out-step03/WhitePayCheckout.sol/WhitePayCheckout.json',
      ),
    );
    const hash = await deployer.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [1874n, ['0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7']],
    });
    const address = (await pub.waitForTransactionReceipt({ hash }))
      .contractAddress!;
    const f = await fixture(address);
    const runtime = await pub.getCode({ address });
    const client = new WhitePayChainClient({
      rpcUrl: anvil.rpcUrl,
      expectedChainId: 1874,
      checkoutAddress: address,
    });
    let signs = 0;
    const adapter = createRelayerAdapter(
      client,
      anvil.relayerAddress,
      keccak256(runtime!),
      async () => {
        signs++;
        throw new Error('must not sign');
      },
    );
    const before = await pub.getTransactionCount({
      address: anvil.relayerAddress,
    });
    // The official token has no runtime on fresh Anvil; this must fail real EVM simulation.
    const result = await runOnce(f.cfg, adapter);
    assert.equal(result.details[0].status, 'failed');
    assert.equal(result.details[0].reason, 'simulation_or_rpc_failure');
    assert.equal(signs, 0);
    assert.equal(
      await pub.getTransactionCount({ address: anvil.relayerAddress }),
      before,
    );
  } finally {
    await closeDb();
    await anvil.stop();
  }
});
