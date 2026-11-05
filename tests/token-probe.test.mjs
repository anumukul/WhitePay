import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTarget,
  classifyCall,
  capabilityConclusion,
} from '../scripts/lib/token-probe.mjs';

test('probe refuses the wrong chain or an empty official token address', () => {
  assert.throws(() => assertTarget('0x74d', '0x1234'), /1874/);
  assert.throws(() => assertTarget('0x752', '0x'), /bytecode/);
  assert.doesNotThrow(() => assertTarget('0x752', '0x6000'));
});
test('empty fallback and RPC failures do not establish signature support', () => {
  assert.equal(classifyCall({ result: '0x' }).status, 'empty');
  assert.equal(
    classifyCall({ error: { code: -32000, message: 'execution reverted' } })
      .status,
    'error',
  );
  assert.equal(
    classifyCall({ result: `0x${'00'.repeat(32)}` }).status,
    'returned',
  );
  assert.throws(() => classifyCall({}), /Malformed/);
});
test('method names and selectors alone cannot select an authorization path', () => {
  assert.equal(
    capabilityConclusion({
      abiPresent: true,
      selectorPresent: true,
      validSignatureCall: false,
    }),
    'UNPROVEN',
  );
  assert.equal(
    capabilityConclusion({
      abiPresent: true,
      selectorPresent: true,
      validSignatureCall: true,
    }),
    'CALL_VERIFIED_ONLY',
  );
});

test('read-only transport refuses broadcast before making any request', async () => {
  const { rpcRead } = await import('../scripts/lib/token-probe.mjs');
  for (const method of [
    'eth_sendRawTransaction',
    'eth_sendTransaction',
    'personal_unlockAccount',
  ]) {
    await assert.rejects(
      rpcRead(method, [], () => assert.fail('No network call allowed')),
      /Read-only/,
    );
  }
});

test('domain separator hashes the four explicit fields and binds the chain', async () => {
  const { tokenDomainSeparator } = await import(
    '../scripts/lib/token-probe.mjs'
  );
  const { encodeAbiParameters, keccak256, toHex } = await import('viem');
  const domain = {
    name: 'Tether USD',
    version: '1',
    chainId: 1874,
    verifyingContract: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  };
  const expected = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        keccak256(
          toHex(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
          ),
        ),
        keccak256(toHex(domain.name)),
        keccak256(toHex(domain.version)),
        1874n,
        domain.verifyingContract,
      ],
    ),
  );
  assert.equal(tokenDomainSeparator(domain), expected);
  assert.notEqual(tokenDomainSeparator({ ...domain, chainId: 1 }), expected);
});

test('read-only transport fails closed on HTTP and malformed JSON-RPC responses', async () => {
  const { rpcRead } = await import('../scripts/lib/token-probe.mjs');
  await assert.rejects(
    rpcRead('eth_chainId', [], async () => ({ ok: false, status: 429 })),
    /HTTP 429/,
  );
  await assert.rejects(
    rpcRead('eth_chainId', [], async () => ({
      ok: true,
      json: async () => ({ result: '0x752' }),
    })),
    /Malformed RPC envelope/,
  );
});
