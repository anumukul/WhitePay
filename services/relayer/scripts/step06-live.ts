import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  keccak256,
  hashTypedData,
  recoverTypedDataAddress,
  parseAbi,
  formatUnits,
  formatEther,
  serializeTransaction,
  encodeFunctionData,
  decodeFunctionData,
  decodeErrorResult,
  type Hex,
} from 'viem';
import { WhitePayChainClient, whitepayCheckoutAbi } from '@whitepay/chain';
import { getDb, migrate, closeDb } from '@whitepay/api/src/db.js';
import {
  createMerchant,
  createProduct,
  createPrice,
} from '@whitepay/api/src/merchants.js';
import { createSession } from '@whitepay/api/src/sessions.js';
import {
  buildOrderForSession,
  recordSignatures,
} from '@whitepay/api/src/orders.js';
import { runOnce } from '../src/loop.js';
import { proveInvalidDoesNotBroadcast } from '../src/negative-proof.js';
import { createRelayerAdapter } from '../src/chain.js';
import {
  createFoundryKeystoreSigner,
  foundryEnvironment,
  privateTerminalAvailable,
  runCastPrivately,
} from '../src/keystore.js';
import {
  LIVE_POLICY,
  LIVE_ROLES,
  LIVE_CHECKOUT,
  LIVE_TOKEN,
  LIVE_RUNTIME_HASH,
  config,
  validateLiveContext,
  requireApprovalHash,
  requireLiveContextBasename,
  checkSigningWindow,
  requireSigningWindow,
  SigningWindowClosed,
} from '../src/live-policy.js';
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
const [mode, contextArg, approvalHash] = process.argv.slice(2);
const allowed = [
  'preflight',
  'prepare',
  'check-signing',
  'sign-payer',
  'preview',
  'execute',
  'reconcile',
  'verify',
];
if (!allowed.includes(mode)) {
  console.error(
    'Use prepare, sign-payer CONTEXT ORDER_DIGEST, preview CONTEXT, execute CONTEXT UNSIGNED_HASH, reconcile CONTEXT, or verify CONTEXT',
  );
  process.exit(1);
}
let stage = 'initialize';
const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  ) + '\n';
const out = (value: unknown) => console.log(json(value));
const tokenAbi = parseAbi([
  'function balanceOf(address) view returns(uint256)',
  'function decimals() view returns(uint8)',
  'function isBlocked(address) view returns(bool)',
  'function authorizationState(address,bytes32) view returns(bool)',
]);
const client = new WhitePayChainClient({
  rpcUrl: 'https://rpc.testnet.whitechain.io',
  expectedChainId: 1874,
  checkoutAddress: LIVE_CHECKOUT,
  confirmations: 2,
});
const p = client.publicClient;
async function checkedOwnerFile(path: string) {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(await realpath(path), resolve(path));
  return JSON.parse(await readFile(path, 'utf8'));
}
async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(stat.mode & 0o777, 0o700);
  assert.equal(await realpath(path), resolve(path));
}
async function readRow(id: string) {
  return (
    await getDb().query(
      'SELECT sub.*,s.status AS session_status,s.amount_minor,s.token_address,s.payout_address FROM submissions sub JOIN checkout_sessions s ON s.id=sub.session_id AND s.merchant_id=sub.merchant_id WHERE sub.id=$1',
      [id],
    )
  ).rows[0];
}
async function pins() {
  assert.equal(await p.getChainId(), 1874);
  assert.equal(
    keccak256((await p.getCode({ address: LIVE_CHECKOUT }))!),
    LIVE_RUNTIME_HASH,
  );
  assert.equal(
    keccak256((await p.getCode({ address: LIVE_TOKEN }))!),
    '0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e',
  );
  const slot = await p.getStorageAt({
    address: LIVE_TOKEN,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  });
  const implementation = ('0x' + slot!.slice(-40)) as Hex;
  assert.equal(implementation, '0x26425662d126412128967ecf0a02ec48573026f7');
  assert.equal(
    keccak256((await p.getCode({ address: implementation }))!),
    '0xb5c69874a061f6c8750294eefc2de2f45a7c229e961b03fc901f3612010822d6',
  );
  assert.equal(
    await p.readContract({
      address: LIVE_TOKEN,
      abi: tokenAbi,
      functionName: 'decimals',
    }),
    6,
  );
  assert.equal(
    await p.readContract({
      address: LIVE_CHECKOUT,
      abi: whitepayCheckoutAbi,
      functionName: 'expectedChainId',
    }),
    1874n,
  );
  assert.equal(
    await p.readContract({
      address: LIVE_CHECKOUT,
      abi: whitepayCheckoutAbi,
      functionName: 'tokenAllowed',
      args: [LIVE_TOKEN],
    }),
    true,
  );
}
async function funding() {
  const block = await p.getBlock();
  const entries = await Promise.all(
    Object.entries({ ...LIVE_ROLES, checkout: LIVE_CHECKOUT }).map(
      async ([role, address]) => {
        const [blocked, wbt, usdt] = await Promise.all([
          p.readContract({
            address: LIVE_TOKEN,
            abi: tokenAbi,
            functionName: 'isBlocked',
            args: [address as Hex],
            blockNumber: block.number,
          }),
          p.getBalance({ address: address as Hex, blockNumber: block.number }),
          p.readContract({
            address: LIVE_TOKEN,
            abi: tokenAbi,
            functionName: 'balanceOf',
            args: [address as Hex],
            blockNumber: block.number,
          }),
        ]);
        assert.equal(blocked, false);
        return [
          role,
          {
            address,
            WBT: formatEther(wbt),
            USDT: formatUnits(usdt, 6),
            usdtMinor: usdt.toString(),
          },
        ] as const;
      },
    ),
  );
  const balances = Object.fromEntries(entries);
  assert.equal(balances.payer.WBT, '0');
  assert.equal(balances.checkout.usdtMinor, '0');
  assert.ok(BigInt(balances.payer.usdtMinor) >= 1001000n);
  const [latest, pending] = await Promise.all([
    p.getTransactionCount({ address: LIVE_ROLES.relayer, blockTag: 'latest' }),
    p.getTransactionCount({ address: LIVE_ROLES.relayer, blockTag: 'pending' }),
  ]);
  assert.equal(latest, pending);
  assert.equal(
    (await p.getBlock({ blockNumber: block.number })).hash,
    block.hash,
  );
  return {
    block: block.number,
    blockHash: block.hash,
    chainTimestamp: block.timestamp,
    relayerNonce: latest,
    balances,
  };
}

async function unspent(ctx: any) {
  assert.equal(
    await p.readContract({
      address: LIVE_CHECKOUT,
      abi: whitepayCheckoutAbi,
      functionName: 'settled',
      args: [LIVE_ROLES.payer, ctx.orderTypedData.message.orderId],
    }),
    false,
  );
  assert.equal(
    await p.readContract({
      address: LIVE_TOKEN,
      abi: tokenAbi,
      functionName: 'authorizationState',
      args: [LIVE_ROLES.payer, ctx.orderDigest],
    }),
    false,
  );
}
function active(ctx: any, now: number) {
  requireSigningWindow(
    ctx.validBefore,
    now,
    LIVE_POLICY.minimumRemainingValiditySeconds,
  );
}

try {
  stage = 'migrate local PostgreSQL';
  await migrate();
  if (mode !== 'check-signing') {
    stage = 'verify exact chain, runtime and official token';
    await pins();
  }
  if (mode === 'preflight') {
    const current = await funding();
    const keystores: any = {};
    for (const role of ['payer', 'relayer']) {
      const file = resolve('keystores/whitepay-sepolia/' + role);
      const info = await lstat(file);
      assert.ok(info.isFile() && !info.isSymbolicLink());
      assert.equal(info.mode & 0o777, 0o600);
      assert.equal(await realpath(file), file);
      assert.equal((await lstat(dirname(file))).mode & 0o777, 0o700);
      keystores[role] =
        '0600 encrypted keystore path verified; contents not read';
    }
    out({
      status: 'READ_ONLY_LIVE_PREFLIGHT_PASSED',
      chainId: 1874,
      current,
      policy: LIVE_POLICY,
      keystores,
      broadcast: false,
      signaturesCreated: false,
    });
  } else if (mode === 'prepare') {
    stage = 'refresh public funding';
    const before = await funding();
    assert.ok(
      Math.abs(Date.now() / 1000 - Number(before.chainTimestamp)) < 120,
    );
    process.env.WHITECHAIN_CHAIN_ID = '1874';
    process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = LIVE_CHECKOUT;
    process.env.WHITEPAY_FEE_RECIPIENT = LIVE_ROLES.feeRecipient;
    process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
    process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
    stage = 'provision local proof session through API service';
    const merchant = await createMerchant({
      name: 'WhitePay Step06 live proof',
      payoutAddress: LIVE_ROLES.merchant,
    });
    const product = await createProduct(
      merchant.id,
      'Step06 controlled relayer proof',
    );
    const price = await createPrice({
      merchantId: merchant.id,
      productId: product.id,
      amountMinor: 1000000,
      currency: 'USDT',
      tokenAddress: LIVE_TOKEN,
    });
    const session = await createSession({
      merchantId: merchant.id,
      priceId: price.id,
      externalOrderId: 'step06-' + randomUUID(),
    });
    const quote = await buildOrderForSession({
      sessionId: session.id,
      merchantId: merchant.id,
      payerAddress: LIVE_ROLES.payer,
      nowMs: Number((await p.getBlock()).timestamp) * 1000,
    });
    const ctx = {
      version: 1,
      chainId: 1874,
      checkout: LIVE_CHECKOUT,
      token: LIVE_TOKEN,
      policy: LIVE_POLICY,
      roles: LIVE_ROLES,
      merchantId: merchant.id,
      sessionId: session.id,
      submissionId: quote.submissionId,
      orderTypedData: quote.typedData,
      tokenTypedData: quote.tokenTypedData,
      orderDigest: quote.orderDigest,
      tokenDigest: hashTypedData(quote.tokenTypedData),
      validBefore: quote.typedData.message.validBefore,
      before,
    };
    stage = 'validate unsigned quote context';
    validateLiveContext(ctx);
    stage = 'check unused order and token authorization';
    await unspent(ctx);
    stage = 'compare onchain and offchain order digests';
    assert.equal(
      await p.readContract({
        address: LIVE_CHECKOUT,
        abi: whitepayCheckoutAbi,
        functionName: 'orderDigest',
        args: [
          {
            ...quote.typedData.message,
            amount: 1000000n,
            fee: 1000n,
            validAfter: BigInt(quote.typedData.message.validAfter),
            validBefore: BigInt(quote.typedData.message.validBefore),
          },
        ],
      }),
      ctx.orderDigest,
    );
    const path = `docs/evidence/step-06-live-${quote.typedData.message.orderId.slice(2)}.json`;
    await writeFile(path, json(ctx), { flag: 'wx', mode: 0o600 });
    out({
      status: 'PAYER_SIGNING_PREVIEW_ONLY_NOT_APPROVED',
      contextFile: path,
      chainId: 1874,
      submissionId: ctx.submissionId,
      roles: LIVE_ROLES,
      checkout: LIVE_CHECKOUT,
      officialToken: LIVE_TOKEN,
      amountUSDT: '1',
      feeUSDT: '0.001',
      totalUSDT: '1.001',
      validBeforeUtc: new Date(ctx.validBefore * 1000).toISOString(),
      validBeforeIST: new Date((ctx.validBefore + 19800) * 1000)
        .toISOString()
        .replace('Z', '+05:30'),
      orderDigest: ctx.orderDigest,
      tokenAuthorizationDigest: ctx.tokenDigest,
      policy: LIVE_POLICY,
      before,
      gasEstimate: 'PENDING_SIGNATURES',
      signaturesCreated: false,
      broadcast: false,
    });
  } else {
    stage = 'load reviewed public context';
    assert.ok(contextArg);
    assert.equal(dirname(resolve(contextArg)), resolve('docs/evidence'));
    requireLiveContextBasename(
      relative(resolve('docs/evidence'), resolve(contextArg)),
    );
    const ctx = await checkedOwnerFile(resolve(contextArg));
    stage = 'validate reviewed context policy';
    validateLiveContext(ctx);
    stage = 'find quoted submission in expected PostgreSQL database';
    const row = await readRow(ctx.submissionId);
    if (!row) {
      out({
        status: 'QUOTED_SUBMISSION_NOT_FOUND',
        submissionId: ctx.submissionId,
        help: 'Use the DATABASE_URL supplied with this proof command; no database credentials are printed',
      });
      process.exitCode = 1;
      throw new Error('context_database_mismatch');
    }
    stage = 'match stored order and token digests';
    assert.equal(row.order_digest, ctx.orderDigest);
    assert.equal(hashTypedData(row.order_typed_data), ctx.orderDigest);
    assert.equal(hashTypedData(row.token_typed_data), ctx.tokenDigest);
    assert.equal(row.merchant_id, ctx.merchantId);
    assert.equal(row.session_id, ctx.sessionId);
    const directory = resolve(
      `keystores/whitepay-sepolia/authorizations/${ctx.orderTypedData.message.orderId.slice(2)}/step06`,
    );
    const adapter = createRelayerAdapter(
      client,
      LIVE_ROLES.relayer,
      LIVE_RUNTIME_HASH,
    );
    if (mode === 'check-signing') {
      const now = Math.floor(Date.now() / 1000);
      out({
        status: 'READ_ONLY_LOCAL_SIGNING_CHECK',
        clockSource:
          'local system clock; actual signing separately rechecks chain time and network identity',
        contextValid: true,
        databaseRowFound: true,
        orderDigest: ctx.orderDigest,
        tokenAuthorizationDigest: ctx.tokenDigest,
        window: checkSigningWindow(
          ctx.validBefore,
          now,
          LIVE_POLICY.minimumRemainingValiditySeconds,
        ),
        terminal: {
          stdinTTY: !!process.stdin.isTTY,
          stdoutTTY: !!process.stdout.isTTY,
          privateTerminalAvailable: privateTerminalAvailable(),
        },
        broadcast: false,
        signaturesCreated: false,
      });
    } else if (mode === 'sign-payer') {
      stage = 'check specific payer-signing approval hash';
      requireApprovalHash(approvalHash, ctx.orderDigest);
      stage = 'check approved signing window';
      active(ctx, Number((await p.getBlock()).timestamp));
      active(ctx, Math.floor(Date.now() / 1000));
      stage = 'check private controlling terminal';
      if (!privateTerminalAvailable())
        throw new Error('PRIVATE_TERMINAL_REQUIRED');
      stage = 'refresh payer and relayer funding';
      await funding();
      await unspent(ctx);
      await privateDirectory(directory);
      stage = 'payer hidden keystore signing';
      const keystore = resolve('keystores/whitepay-sepolia/payer');
      const info = await lstat(keystore);
      assert.ok(info.isFile() && !info.isSymbolicLink());
      assert.equal(info.mode & 0o777, 0o600);
      assert.equal(await realpath(keystore), keystore);
      assert.equal((await lstat(dirname(keystore))).mode & 0o777, 0o700);
      if (process.getuid) assert.equal(info.uid, process.getuid());
      const output = directory + '/payment-signatures.json';
      let signatures: any;
      try {
        await lstat(output);
        signatures = await checkedOwnerFile(output);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (!signatures) {
        signatures = {};
        for (const [label, data] of [
          ['order', ctx.orderTypedData],
          ['token', ctx.tokenTypedData],
        ] as const) {
          const file = directory + `/${label}-typed-data.json`,
            savedPath = directory + `/${label}-signature.json`;
          let cached: any;
          try {
            cached = await checkedOwnerFile(savedPath);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          }
          const digest = hashTypedData(data);
          if (cached) {
            assert.equal(cached.digest, digest);
            assert.equal(
              (
                await recoverTypedDataAddress({
                  ...data,
                  signature: cached.signature,
                })
              ).toLowerCase(),
              LIVE_ROLES.payer.toLowerCase(),
            );
            signatures[label + 'Signature'] = cached.signature;
            continue;
          }
          try {
            const savedData = await checkedOwnerFile(file);
            assert.equal(hashTypedData(savedData), digest);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
            await writeFile(file, json(data), { mode: 0o600, flag: 'wx' });
          }
          active(ctx, Math.floor(Date.now() / 1000));
          console.log(
            `Signing the reviewed ${label} authorization. Enter payer password only at Cast's hidden prompt.`,
          );
          const result = await runCastPrivately(
            [
              'wallet',
              'sign',
              '--data',
              '--from-file',
              file,
              '--from',
              LIVE_ROLES.payer,
              '--keystore',
              keystore,
            ],
            foundryEnvironment(),
          );
          assert.equal(result.status, 0);
          const signature = result.stdout.trim();
          assert.match(signature, /^0x[0-9a-fA-F]{130}$/);
          assert.equal(
            (
              await recoverTypedDataAddress({
                ...data,
                signature: signature as Hex,
              })
            ).toLowerCase(),
            LIVE_ROLES.payer.toLowerCase(),
          );
          await writeFile(savedPath, json({ digest, signature }), {
            mode: 0o600,
            flag: 'wx',
          });
          signatures[label + 'Signature'] = signature;
        }
        await writeFile(output, json(signatures), { flag: 'wx', mode: 0o600 });
      }
      for (const [data, signature] of [
        [ctx.orderTypedData, signatures.orderSignature],
        [ctx.tokenTypedData, signatures.tokenSignature],
      ])
        assert.equal(
          (await recoverTypedDataAddress({ ...data, signature })).toLowerCase(),
          LIVE_ROLES.payer.toLowerCase(),
        );
      const accepted = await recordSignatures({
        submissionId: ctx.submissionId,
        merchantId: ctx.merchantId,
        ...signatures,
      });
      assert.ok(accepted.ok || accepted.reason === 'already_signed');
      assert.equal((await readRow(ctx.submissionId)).status, 'queued');
      out({
        status: 'BOTH_PAYER_SIGNATURES_VERIFIED_QUEUED',
        chainId: 1874,
        payer: LIVE_ROLES.payer,
        orderDigest: ctx.orderDigest,
        tokenAuthorizationDigest: ctx.tokenDigest,
        validBeforeUtc: new Date(ctx.validBefore * 1000).toISOString(),
        signaturesFile: relative(process.cwd(), output),
        broadcast: false,
        next: 'Separate exact transaction preview and broadcast approval required',
      });
    } else if (mode === 'preview') {
      stage = 'simulate exact queued live submission';
      await funding();
      await unspent(ctx);
      active(ctx, Number((await p.getBlock()).timestamp));
      const result = await runOnce(
        config('preview'),
        adapter,
        10,
        undefined,
        ctx.submissionId,
      );
      assert.equal(result.details[0]?.status, 'preview');
      assert.ok(result.details[0].transactionPreview);
      // The real queue loop must reject a dedicated invalid entry with both signer and broadcaster disabled.
      Object.assign(process.env, {
        WHITECHAIN_CHAIN_ID: '1874',
        WHITEPAY_CHECKOUT_CONTRACT_ADDRESS: LIVE_CHECKOUT,
        WHITEPAY_FEE_RECIPIENT: LIVE_ROLES.feeRecipient,
        WHITEPAY_FEE_BASIS_POINTS: '10',
        WHITEPAY_QUOTE_VALIDITY_SECONDS: '900',
      });
      const negativeProof = await proveInvalidDoesNotBroadcast(
        row,
        config(),
        adapter,
      );
      const t = result.details[0].transactionPreview!;
      const before = await funding();
      const proof = {
        status: 'SIMULATED_BROADCAST_NOT_APPROVED',
        before,
        estimatedTotalGasWBT: formatEther(
          BigInt(t.gasEstimate) * BigInt(t.observedGasPriceWei) +
            BigInt(t.quotedL1FeeWei),
        ),
        maximumL2GasWBT: formatEther(
          BigInt(t.gasLimit) * BigInt(t.maxFeePerGasWei),
        ),
        reservedL1WBT: formatEther(BigInt(LIVE_POLICY.maxL1FeeWei)),
        expectedUSDT: {
          payer: formatUnits(
            BigInt(before.balances.payer.usdtMinor) - 1001000n,
            6,
          ),
          merchant: formatUnits(
            BigInt(before.balances.merchant.usdtMinor) + 1000000n,
            6,
          ),
          feeRecipient: formatUnits(
            BigInt(before.balances.feeRecipient.usdtMinor) + 1000n,
            6,
          ),
          checkout: '0',
        },
        contextFile: contextArg,
        chainId: 1874,
        from: LIVE_ROLES.relayer,
        to: LIVE_CHECKOUT,
        orderDigest: ctx.orderDigest,
        token: LIVE_TOKEN,
        amountUSDT: '1',
        feeUSDT: '0.001',
        validBefore: ctx.validBefore,
        validBeforeUtc: new Date(ctx.validBefore * 1000).toISOString(),
        policy: LIVE_POLICY,
        result,
        negativeAmountRejected: true,
        negativeProof,
        broadcast: false,
      };
      await writeFile(contextArg + '.transaction-preview.json', json(proof), {
        mode: 0o600,
      });
      out(proof);
    } else if (mode === 'execute') {
      stage = 'check specific live transaction approval';
      const preview = await checkedOwnerFile(
        resolve(contextArg + '.transaction-preview.json'),
      );
      const approved = preview.result.details[0];
      requireApprovalHash(approvalHash, approved.unsignedHash);
      assert.equal(preview.orderDigest, ctx.orderDigest);
      if (!privateTerminalAvailable())
        throw new Error('PRIVATE_TERMINAL_REQUIRED');
      const signer = createFoundryKeystoreSigner({
        keystore: resolve('keystores/whitepay-sepolia/relayer'),
        address: LIVE_ROLES.relayer,
        approvedUnsignedHash: approvalHash as Hex,
      });
      const result = await runOnce(
        config('execute'),
        createRelayerAdapter(
          client,
          LIVE_ROLES.relayer,
          LIVE_RUNTIME_HASH,
          signer,
        ),
        10,
        {
          chainId: 1874,
          relayer: LIVE_ROLES.relayer,
          checkout: LIVE_CHECKOUT,
          orderDigest: ctx.orderDigest,
          unsignedHash: approvalHash as Hex,
        },
        ctx.submissionId,
      );
      out({
        status: 'OPERATOR_EXECUTION_RESULT',
        result,
        rawTransactionExposed: false,
        next: 'Return only this public summary; reconcile uses read-only RPC and cannot broadcast',
      });
    } else if (mode === 'reconcile') {
      stage = 'reconcile actual receipt with broadcasting disabled';
      const result = await runOnce(
        config('reconcile'),
        adapter,
        10,
        undefined,
        ctx.submissionId,
      );
      const attempts = (
        await getDb().query(
          'SELECT state,nonce,tx_hash,reserved_wei,charged_wei,reason FROM relay_attempts WHERE order_digest=$1',
          [ctx.orderDigest],
        )
      ).rows;
      out({
        status: 'READ_ONLY_NETWORK_RECONCILIATION',
        result,
        attempts,
        broadcast: false,
      });
    } else {
      stage =
        'verify exact mined transaction, balance debit and replay rejection';
      const attempt = (
        await getDb().query(
          'SELECT * FROM relay_attempts WHERE order_digest=$1',
          [ctx.orderDigest],
        )
      ).rows[0];
      assert.equal(attempt?.state, 'mined');
      const receipt = await p.getTransactionReceipt({ hash: attempt.tx_hash });
      const tx = await p.getTransaction({ hash: attempt.tx_hash });
      const paymentBlock = await p.getBlock({
        blockNumber: receipt.blockNumber,
      });
      assert.ok(paymentBlock.timestamp < BigInt(ctx.validBefore));
      assert.equal(receipt.status, 'success');
      assert.equal(keccak256(tx.input), keccak256(attempt.unsigned_tx.data));
      assert.equal(tx.nonce, Number(attempt.nonce));
      assert.equal(tx.from.toLowerCase(), LIVE_ROLES.relayer.toLowerCase());
      assert.equal(tx.to!.toLowerCase(), LIVE_CHECKOUT.toLowerCase());
      assert.equal(tx.chainId, 1874);
      assert.equal(tx.value, 0n);
      for (const key of [
        'gas',
        'maxFeePerGas',
        'maxPriorityFeePerGas',
      ] as const)
        assert.equal(tx[key], BigInt(attempt.unsigned_tx[key]));
      stage = 'read historical public wallet balances';
      const balances: any = {};
      for (const [role, address] of Object.entries({
        ...LIVE_ROLES,
        checkout: LIVE_CHECKOUT,
      })) {
        const snapshots: any = { address };
        for (const [label, blockNumber] of [
          ['before', receipt.blockNumber - 1n],
          ['after', receipt.blockNumber],
        ] as const)
          snapshots[label] = {
            WBT: await p.getBalance({ address: address as Hex, blockNumber }),
            USDT: await p.readContract({
              address: LIVE_TOKEN,
              abi: tokenAbi,
              functionName: 'balanceOf',
              args: [address as Hex],
              blockNumber,
            }),
          };
        balances[role] = snapshots;
      }
      stage = 'verify exact historical balance changes';
      assert.equal(balances.payer.before.WBT, 0n);
      assert.equal(balances.payer.after.WBT, 0n);
      assert.equal(await p.getBalance({ address: LIVE_ROLES.payer }), 0n);
      assert.equal(
        balances.payer.before.USDT - balances.payer.after.USDT,
        1001000n,
      );
      assert.equal(
        balances.merchant.after.USDT - balances.merchant.before.USDT,
        1000000n,
      );
      assert.equal(
        balances.feeRecipient.after.USDT - balances.feeRecipient.before.USDT,
        1000n,
      );
      assert.equal(balances.checkout.before.USDT, 0n);
      assert.equal(balances.checkout.after.USDT, 0n);
      assert.equal(
        balances.relayer.before.WBT - balances.relayer.after.WBT,
        BigInt(attempt.charged_wei),
      );
      assert.equal(
        await p.readContract({
          address: LIVE_CHECKOUT,
          abi: whitepayCheckoutAbi,
          functionName: 'settled',
          args: [LIVE_ROLES.payer, ctx.orderTypedData.message.orderId],
        }),
        true,
      );
      assert.equal(
        await p.readContract({
          address: LIVE_TOKEN,
          abi: tokenAbi,
          functionName: 'authorizationState',
          args: [LIVE_ROLES.payer, ctx.orderDigest],
        }),
        true,
      );
      stage = 'verify actual receipt gas accounting';
      const rawReceipt = await p.request({
        method: 'eth_getTransactionReceipt',
        params: [attempt.tx_hash],
      });
      const l1 = (rawReceipt as any).l1Fee;
      assert.ok(l1 !== undefined);
      const actualGas =
        BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) +
        BigInt(l1);
      assert.equal(actualGas, BigInt(attempt.charged_wei));
      const orderReplayArgs = decodeFunctionData({
        abi: whitepayCheckoutAbi,
        data: tx.input,
      }).args!;
      async function rejectCall(call: any, expected: string) {
        const response = await fetch('https://rpc.testnet.whitechain.io', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            // At the mined block the authorization is consumed and still within
            // its original window. This isolates replay rejection from expiry.
            params: [call, `0x${receipt.blockNumber.toString(16)}`],
          }),
          signal: AbortSignal.timeout(20000),
        });
        assert.equal(response.status, 200);
        const reply = (await response.json()) as any;
        assert.ok(reply.error);
        let data = reply.error.data;
        if (typeof data === 'object') data = data?.data;
        const error = decodeErrorResult({
          abi: [...whitepayCheckoutAbi, ...parseAbi(['error Error(string)'])],
          data,
        });
        if (expected === 'OrderAlreadySettled')
          assert.equal(error.errorName, expected);
        else {
          assert.equal(error.errorName, 'Error');
          assert.equal(error.args?.[0], expected);
        }
        return expected;
      }
      async function replaySnapshot() {
        const blockNumber = await p.getBlockNumber();
        const assets = await Promise.all(
          Object.values({ ...LIVE_ROLES, checkout: LIVE_CHECKOUT }).map(
            async (address) => ({
              WBT: await p.getBalance({ address, blockNumber }),
              USDT: await p.readContract({
                address: LIVE_TOKEN,
                abi: tokenAbi,
                functionName: 'balanceOf',
                args: [address],
                blockNumber,
              }),
            }),
          ),
        );
        return {
          assets,
          relayerNonce: await p.getTransactionCount({
            address: LIVE_ROLES.relayer,
            blockTag: 'pending',
          }),
        };
      }
      const replayBefore = await replaySnapshot();
      stage = 'read-only order replay at confirmed payment block';
      const orderReplay = await rejectCall(
        { from: LIVE_ROLES.relayer, to: LIVE_CHECKOUT, data: tx.input },
        'OrderAlreadySettled',
      );
      const authData = encodeFunctionData({
        abi: parseAbi([
          'function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)',
        ]),
        functionName: 'receiveWithAuthorization',
        args: [
          LIVE_ROLES.payer,
          LIVE_CHECKOUT,
          1001000n,
          BigInt(ctx.orderTypedData.message.validAfter),
          BigInt(ctx.validBefore),
          ctx.orderDigest,
          orderReplayArgs[2] as Hex,
        ],
      });
      stage = 'read-only token replay at confirmed payment block';
      const tokenReplay = await rejectCall(
        { from: LIVE_CHECKOUT, to: LIVE_TOKEN, data: authData },
        'TetherToken: auth invalid',
      );
      stage = 'verify replay leaves current balances and nonce unchanged';
      assert.deepEqual(await replaySnapshot(), replayBefore);
      const report = {
        status: 'STEP06_LIVE_ENGINE_PAYMENT_BALANCES_AND_REPLAY_VERIFIED',
        orderReplay,
        tokenReplay,
        replayBlock: receipt.blockNumber,
        replayBlockTimestampUtc: new Date(
          Number(paymentBlock.timestamp) * 1000,
        ).toISOString(),
        replayMode: 'historical_post_payment_state_within_original_validity',
        paymentMinedAfterSafetyCutoff:
          paymentBlock.timestamp >=
          BigInt(ctx.validBefore) -
            BigInt(LIVE_POLICY.minimumRemainingValiditySeconds),
        replayTransactionsBroadcast: 0,
        l1FeeWei: BigInt(l1),

        chainId: 1874,
        txHash: attempt.tx_hash,
        block: receipt.blockNumber,
        submissionId: ctx.submissionId,
        orderDigest: ctx.orderDigest,
        nonce: attempt.nonce,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        actualGasDebitWBT: formatEther(BigInt(attempt.charged_wei)),
        reservedWei: attempt.reserved_wei,
        balances: Object.fromEntries(
          Object.entries(balances).map(([role, v]: [string, any]) => [
            role,
            {
              address: v.address,
              before: {
                WBT: formatEther(v.before.WBT),
                USDT: formatUnits(v.before.USDT, 6),
              },
              after: {
                WBT: formatEther(v.after.WBT),
                USDT: formatUnits(v.after.USDT, 6),
              },
            },
          ]),
        ),
        replayBalancesAndNonceUnchanged: true,
        signaturesExposed: false,
        broadcast: false,
      };
      await writeFile(contextArg + '.verified.json', json(report), {
        mode: 0o600,
      });
      out(report);
    }
  }
} catch (e) {
  console.error(
    json({
      status: 'STOPPED',
      stage,
      ...(e instanceof Error && e.message === 'PRIVATE_TERMINAL_REQUIRED'
        ? { code: 'PRIVATE_TERMINAL_REQUIRED' }
        : {}),
      ...(e instanceof SigningWindowClosed
        ? { code: e.code, window: e.publicDetails }
        : {}),
      details:
        'Sensitive signature/calldata/RPC error output withheld. Do not change terms, nonce or fee limits automatically.',
    }),
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
