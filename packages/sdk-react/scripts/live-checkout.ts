import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, rename, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { build } from 'esbuild';
import { parseAbi, type Hex } from 'viem';
import { WhitePayChainClient, whitepayCheckoutAbi } from '@whitepay/chain';
import { WhitePay, createCheckoutBridge } from '@whitepay/node';
import { createApp } from '@whitepay/api';
import { migrate, getDb, closeDb } from '@whitepay/api/src/db.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import {
  LIVE_ROLES,
  LIVE_CHECKOUT,
  LIVE_TOKEN,
  LIVE_RUNTIME_HASH,
  validateLiveContext,
  requireSigningWindow,
} from '../../../services/relayer/src/live-policy.js';
import {
  privateTerminalAvailable,
  runCastPrivately,
  foundryEnvironment,
} from '../../../services/relayer/src/keystore.js';
import { createApprovedWallet } from './approved-wallet.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const [mode, contextFile, orderApproval, tokenApproval] = process.argv.slice(2);
let api: ReturnType<typeof createApp> | undefined,
  app: ReturnType<typeof createServer> | undefined,
  keyId: string | undefined;
async function stop() {
  if (app) await new Promise<void>((r) => app!.close(() => r()));
  if (api) await new Promise<void>((r) => api!.close(() => r()));
  if (keyId)
    await getDb().query('UPDATE api_keys SET revoked_at=$1 WHERE id=$2', [
      Date.now(),
      keyId,
    ]);
  await closeDb();
}
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
try {
  if (mode === 'prepare') {
    const result = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx/esm', 'scripts/step06-live.ts', 'prepare'],
      { cwd: resolve('services/relayer'), env: process.env, maxBuffer: 262144 },
    );
    const preview = JSON.parse(result.stdout.trim());
    const target = preview.contextFile.replace(
      'step-06-live-',
      'step-09-live-',
    );
    await rename(preview.contextFile, target);
    output({
      ...preview,
      status: 'STEP09_WIDGET_PAYER_SIGNING_PREVIEW_NOT_APPROVED',
      contextFile: target,
      purpose:
        'Real widget signing using the existing encrypted payer keystore; no broadcast',
      next: 'Review and approve both displayed signing digests before starting the local wallet bridge.',
    });
  } else {
    assert.ok(mode === 'serve' || mode === 'receipt');
    assert.ok(contextFile);
    const path = resolve(contextFile),
      info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink());
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(await realpath(path), path);
    const ctx = JSON.parse(await readFile(path, 'utf8'));
    validateLiveContext(ctx);
    if (mode === 'serve') {
      assert.equal(orderApproval, ctx.orderDigest);
      assert.equal(tokenApproval, ctx.tokenDigest);
      assert.ok(privateTerminalAvailable(), 'PRIVATE_TERMINAL_REQUIRED');
    }
    process.env.WHITECHAIN_CHAIN_ID = '1874';
    process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = LIVE_CHECKOUT;
    process.env.WHITEPAY_FEE_RECIPIENT = LIVE_ROLES.feeRecipient;
    process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
    process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
    await migrate();
    const row = (
      await getDb().query(
        'SELECT merchant_id,session_id,order_digest,status FROM submissions WHERE id=$1',
        [ctx.submissionId],
      )
    ).rows[0];
    assert.ok(
      row &&
        row.merchant_id === ctx.merchantId &&
        row.session_id === ctx.sessionId &&
        row.order_digest === ctx.orderDigest &&
        row.status === (mode === 'receipt' ? 'settled' : 'awaiting_signature'),
    );
    const chain = new WhitePayChainClient({
        rpcUrl: 'https://rpc.testnet.whitechain.io',
        expectedChainId: 1874,
        checkoutAddress: LIVE_CHECKOUT,
      }),
      p = chain.publicClient;
    const tokenAbi = parseAbi([
      'function balanceOf(address) view returns(uint256)',
      'function authorizationState(address,bytes32) view returns(bool)',
    ]);
    const now = async () =>
      Math.max(
        Number((await p.getBlock()).timestamp),
        Math.floor(Date.now() / 1000),
      );
    const balance = () =>
      p.readContract({
        address: LIVE_TOKEN,
        abi: tokenAbi,
        functionName: 'balanceOf',
        args: [LIVE_ROLES.payer],
      });
    async function pins() {
      assert.equal(await p.getChainId(), 1874);
      if (mode === 'serve')
        requireSigningWindow(ctx.validBefore, await now(), 120);
      const { keccak256 } = await import('viem');
      assert.equal(
        keccak256((await p.getCode({ address: LIVE_CHECKOUT }))!),
        LIVE_RUNTIME_HASH,
      );
      assert.equal(
        keccak256((await p.getCode({ address: LIVE_TOKEN }))!),
        '0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e',
      );
      const implementation = await p.getStorageAt({
        address: LIVE_TOKEN,
        slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
      });
      assert.equal(
        implementation?.slice(-40),
        '26425662d126412128967ecf0a02ec48573026f7',
      );
      assert.equal(
        keccak256(
          (await p.getCode({
            address: '0x26425662d126412128967ecf0a02ec48573026f7',
          }))!,
        ),
        '0xb5c69874a061f6c8750294eefc2de2f45a7c229e961b03fc901f3612010822d6',
      );
      assert.equal(
        await p.readContract({
          address: LIVE_CHECKOUT,
          abi: whitepayCheckoutAbi,
          functionName: 'settled',
          args: [LIVE_ROLES.payer, ctx.orderTypedData.message.orderId],
        }),
        mode === 'receipt',
      );
      assert.equal(await p.getBalance({ address: LIVE_ROLES.payer }), 0n);
      if (mode === 'serve') assert.ok((await balance()) >= 1001000n);
      assert.equal(
        await p.readContract({
          address: LIVE_TOKEN,
          abi: tokenAbi,
          functionName: 'authorizationState',
          args: [LIVE_ROLES.payer, ctx.orderDigest],
        }),
        mode === 'receipt',
      );
    }
    await pins();
    let wallet: ReturnType<typeof createApprovedWallet> | undefined;
    if (mode === 'serve') {
      const keystore = resolve('keystores/whitepay-sepolia/payer'),
        ks = await lstat(keystore),
        folder = await lstat(dirname(keystore));
      assert.ok(
        ks.isFile() && !ks.isSymbolicLink() && !folder.isSymbolicLink(),
      );
      assert.equal(await realpath(keystore), keystore);
      assert.equal(ks.mode & 0o777, 0o600);
      assert.equal(folder.mode & 0o777, 0o700);
      if (process.getuid) assert.equal(ks.uid, process.getuid());
      wallet = createApprovedWallet({
        payer: LIVE_ROLES.payer,
        order: ctx.orderTypedData,
        token: ctx.tokenTypedData,
        validBefore: ctx.validBefore,
        now,
        balance,
        signDigest: async (hash) => {
          await pins();
          assert.ok(hash === orderApproval || hash === tokenApproval);
          const result = await runCastPrivately(
            [
              'wallet',
              'sign',
              '--no-hash',
              hash,
              '--from',
              LIVE_ROLES.payer,
              '--keystore',
              keystore,
            ],
            foundryEnvironment(),
          );
          if (
            result.status !== 0 ||
            !/^0x[0-9a-fA-F]{130}$/.test(result.stdout.trim())
          )
            throw new Error('private_signing_failed');
          requireSigningWindow(
            ctx.validBefore,
            Math.floor(Date.now() / 1000),
            120,
          );
          return result.stdout.trim() as Hex;
        },
      });
    }
    const minted = await mintApiKey(ctx.merchantId, Date.now() + 3600000);
    keyId = minted.id;
    api = createApp();
    await new Promise<void>((r) => api!.listen(0, '127.0.0.1', r));
    const wp = new WhitePay({
      secretKey: minted.secret,
      apiBaseUrl: `http://127.0.0.1:${(api.address() as any).port}`,
    });
    const bundle = await build({
      entryPoints: [resolve('packages/sdk-react/scripts/live-app.tsx')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
    const js = bundle.outputFiles[0].text;
    assert.ok(!js.includes(minted.secret) && !js.includes('node:crypto'));
    const cookie = randomBytes(32).toString('hex');
    let origin = '',
      bridge: ReturnType<typeof createCheckoutBridge>;
    const authorized = (req: import('node:http').IncomingMessage) =>
      req.headers.cookie
        ?.split(';')
        .some((v) => v.trim() === 'whitepay_local=' + cookie) === true;
    app = createServer(async (req, res) => {
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('cache-control', 'no-store');
      try {
        if (req.url?.startsWith('/api/whitepay/')) {
          if (mode === 'receipt' && req.method !== 'GET') {
            res.writeHead(405).end();
            return;
          }
          await bridge(req, res);
          return;
        }
        if (req.url === '/wallet') {
          if (
            !wallet ||
            req.method !== 'POST' ||
            req.headers.origin !== origin ||
            !authorized(req) ||
            !req.headers['content-type']?.startsWith('application/json')
          ) {
            res.writeHead(403).end();
            return;
          }
          let body = '';
          for await (const c of req) {
            body += c;
            if (body.length > 16384) throw new Error('body_too_large');
          }
          const request = JSON.parse(body);
          assert.ok(typeof request.method === 'string');
          const result = await wallet.request({
            method: request.method,
            params: request.params,
          });
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ result }));
          return;
        }
        if (req.url === '/bundle.js') {
          if (!authorized(req)) {
            res.writeHead(403).end();
            return;
          }
          res
            .writeHead(200, { 'content-type': 'application/javascript' })
            .end(js);
          return;
        }
        if (req.url !== '/') {
          res.writeHead(404).end();
          return;
        }
        res.setHeader(
          'set-cookie',
          `whitepay_local=${cookie}; HttpOnly; SameSite=Strict; Path=/`,
        );
        res.writeHead(200, { 'content-type': 'text/html' }).end(
          '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>globalThis.__whitepay=' +
            JSON.stringify({
              sessionId: ctx.sessionId,
              readOnly: mode === 'receipt',
            }) +
            '</script><script src="/bundle.js"></script></body></html>',
        );
      } catch {
        if (!res.headersSent)
          res
            .writeHead(409, { 'content-type': 'application/json' })
            .end(JSON.stringify({ error: 'wallet_request_stopped' }));
        else res.end();
      }
    });
    await new Promise<void>((r) => app!.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(app.address() as any).port}`;
    bridge = createCheckoutBridge({
      whitepay: wp,
      origin,
      authorizeSession: (req, id) => authorized(req) && id === ctx.sessionId,
      checkoutAddress: LIVE_CHECKOUT,
      feeRecipient: LIVE_ROLES.feeRecipient,
      feeBasisPoints: 10,
    });
    output({
      status:
        mode === 'receipt'
          ? 'READ_ONLY_PAYMENT_RECEIPT_READY'
          : 'STEP09_PRIVATE_LOCAL_WIDGET_READY',
      url: origin,
      chainId: 1874,
      payer: LIVE_ROLES.payer,
      amountUSDT: '1',
      feeUSDT: '0.001',
      orderDigest: ctx.orderDigest,
      tokenDigest: ctx.tokenDigest,
      validBeforeUtc: new Date(ctx.validBefore * 1000).toISOString(),
      broadcastCapability: false,
      next:
        mode === 'receipt'
          ? 'Open the local URL to view the confirmed payment. Signing and all POST actions are disabled.'
          : 'Open the local URL. Review terms, then authorize only if approved. Enter the payer password only at the hidden terminal prompt. After signing, return only the public queued summary; separate broadcast approval remains required.',
    });
    const check =
      mode === 'serve'
        ? setInterval(async () => {
            try {
              const sub = (
                await getDb().query(
                  'SELECT status FROM submissions WHERE id=$1',
                  [ctx.submissionId],
                )
              ).rows[0];
              if (sub.status === 'queued') {
                clearInterval(check);
                output({
                  status: 'STEP09_WIDGET_PAYER_SIGNATURES_VERIFIED_QUEUED',
                  chainId: 1874,
                  submissionId: ctx.submissionId,
                  orderDigest: ctx.orderDigest,
                  signaturesExposed: false,
                  broadcast: false,
                });
              } else if (Date.now() / 1000 >= ctx.validBefore - 120) {
                clearInterval(check);
                output({
                  status: 'STEP09_SIGNING_WINDOW_CLOSED',
                  broadcast: false,
                });
              }
            } catch {
              clearInterval(check);
            }
          }, 1000)
        : undefined;
    for (const sig of ['SIGINT', 'SIGTERM'] as const)
      process.once(sig, () => {
        clearInterval(check);
        void stop().then(() => process.exit());
      });
  }
} catch {
  output({
    status: 'STOPPED',
    stage: 'Step 09 public preview or approved private widget',
    sensitiveDetailsWithheld: true,
    broadcast: false,
  });
  await stop();
  process.exitCode = 1;
}
