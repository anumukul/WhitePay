import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import {
  keccak256,
  toHex,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  type Hex,
} from 'viem';
import { createApp } from '@whitepay/api';
import { resetDbForTests, getDb, closeDb } from '@whitepay/api/src/db.js';
import { createMerchant, createPrice } from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import { WhitePay, createCheckoutBridge } from '@whitepay/node';
import { whitepayCheckoutAbi } from '../../chain/src/abi.js';
import { scanAndPersist } from '../../../services/worker/src/loop.js';
const checkout = '0x4d1761abb4ed290f23fcda00890039800e2e53f0',
  feeRecipient = '0x' + 'f'.repeat(40),
  token = '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7';
let api: ReturnType<typeof createApp>,
  app: ReturnType<typeof createServer>,
  browser: Browser,
  wp: WhitePay,
  origin: string,
  priceId: string;
let activeSession = '',
  key = '';
const sessions = new Set<string>();
let consumer = '';
const exec = promisify(execFile);
before(async () => {
  await resetDbForTests(randomUUID());
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS = checkout;
  process.env.WHITEPAY_FEE_RECIPIENT = feeRecipient;
  process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
  process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
  const merchant = await createMerchant({
    name: 'Browser test merchant',
    payoutAddress: '0x' + 'b'.repeat(40),
  });
  key = (await mintApiKey(merchant.id)).secret;
  priceId = (
    await createPrice({
      merchantId: merchant.id,
      amountMinor: 1000000,
      currency: 'USDT',
      tokenAddress: token,
    })
  ).id;
  api = createApp();
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  wp = new WhitePay({
    secretKey: key,
    apiBaseUrl: `http://127.0.0.1:${(api.address() as any).port}`,
  });
  consumer = await mkdtemp(join(tmpdir(), 'whitepay-react-consumer-'));
  const pkg = fileURLToPath(new URL('../', import.meta.url));
  await exec('pnpm', ['pack', '--pack-destination', consumer], { cwd: pkg });
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'independent-whitepay-react-app',
      private: true,
      type: 'module',
      dependencies: {
        '@whitepay/react': 'file:./whitepay-react-0.1.0-alpha.0.tgz',
        react: '18.3.1',
        'react-dom': '18.3.1',
        viem: '2.38.5',
      },
    }),
  );
  await exec('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: consumer,
  });
  const entry = (
    await readFile(
      fileURLToPath(new URL('browser/app.tsx', import.meta.url)),
      'utf8',
    )
  ).replace('../../src/index.js', '@whitepay/react');
  await writeFile(join(consumer, 'app.tsx'), entry);
  const bundle = await build({
    entryPoints: [join(consumer, 'app.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const js = bundle.outputFiles[0].text;
  assert.ok(!js.includes(key) && !js.includes('node:crypto'));
  let bridge: ReturnType<typeof createCheckoutBridge>;
  app = createServer((req, res) => {
    if (req.url?.startsWith('/api/whitepay/')) {
      void bridge(req, res);
      return;
    }
    if (req.url === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(js);
      return;
    }
    res
      .writeHead(200, {
        'content-type': 'text/html',
        'cache-control': 'no-store',
      })
      .end(
        '<!doctype html><html><body><div id="root"></div><script>globalThis.__testConfig=' +
          JSON.stringify({ sessionId: activeSession }) +
          '</script><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(app.address() as any).port}`;
  bridge = createCheckoutBridge({
    whitepay: wp,
    origin,
    authorizeSession: (req, id) =>
      req.headers.cookie === 'customer=A' && sessions.has(id),
    checkoutAddress: checkout,
    feeRecipient,
    feeBasisPoints: 10,
  });
  browser = await chromium.launch({
    executablePath:
      process.env.WHITEPAY_TEST_CHROME ??
      (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined),
    headless: true,
  });
});
after(async () => {
  if (browser) await browser.close();
  for (const server of [app, api])
    if (server) await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
  if (consumer) await rm(consumer, { recursive: true, force: true });
});
async function pageFor(mode = '') {
  activeSession = (
    await wp.checkout.createSession({ priceId, externalOrderId: randomUUID() })
  ).id;
  sessions.add(activeSession);
  const context = await browser.newContext();
  await context.addCookies([{ name: 'customer', value: 'A', url: origin }]);
  const page = await context.newPage();
  await page.goto(origin + '/?mode=' + mode);
  await page.getByRole('button', { name: 'Review payment' }).waitFor();
  return { page, context, sessionId: activeSession };
}
const state = (page: Page) =>
  page.evaluate(() => (globalThis as any).__testState);
async function settleThroughWorker(sessionId: string) {
  const row = (
    await getDb().query(
      "SELECT * FROM submissions WHERE session_id=$1 AND status='queued'",
      [sessionId],
    )
  ).rows[0];
  assert.ok(row);
  const o = row.order_payload,
    hash = keccak256(toHex('browser-test:' + row.order_digest)),
    blockHash = '0x' + 'a'.repeat(64);
  const erc = parseAbi([
    'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
    'event Transfer(address indexed from,address indexed to,uint256 value)',
  ]);
  const logs: any[] = [
    {
      address: token,
      topics: encodeEventTopics({
        abi: erc,
        eventName: 'AuthorizationUsed',
        args: { authorizer: o.payer, nonce: row.order_digest },
      }),
      data: '0x',
    },
  ];
  for (const [from, to, value] of [
    [o.payer, checkout, 1001000n],
    [checkout, o.merchant, 1000000n],
    [checkout, o.feeRecipient, 1000n],
  ])
    logs.push({
      address: token,
      topics: encodeEventTopics({
        abi: erc,
        eventName: 'Transfer',
        args: { from: from as Hex, to: to as Hex },
      }),
      data: encodeAbiParameters(parseAbiParameters('uint256'), [
        value as bigint,
      ]),
    });
  logs.push({
    address: checkout,
    topics: encodeEventTopics({
      abi: whitepayCheckoutAbi,
      eventName: 'PaymentSettled',
      args: { orderId: o.orderId, payer: o.payer, merchant: o.merchant },
    }),
    data: encodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,address,bytes32'),
      [token, 1000000n, 1000n, o.feeRecipient, o.quoteId],
    ),
  });
  const receipt = {
    status: 'success' as const,
    transactionHash: hash,
    blockNumber: 1000,
    blockHash,
    logs: logs.map((l, i) => ({ ...l, logIndex: i })),
  };
  const event = {
    ...o,
    amount: BigInt(o.amount),
    fee: BigInt(o.fee),
    txHash: hash,
    blockNumber: 1000,
    logIndex: 4,
  };
  const r = await scanAndPersist(
    {
      scope: 'browser:' + sessionId,
      chainId: 1874,
      checkoutAddress: checkout,
      fromBlock: 1000,
      confirmations: 2,
    },
    {
      chainId: async () => 1874,
      getHead: async () => 1001,
      getBlockHash: async () => blockHash,
      getLogs: async () => [event],
      getReceipt: async () => receipt,
    },
  );
  assert.equal(r.persisted, 1);
}
test('browser displays verified price/fee, queues two real test signatures and waits for indexer confirmation', async () => {
  const { page, context, sessionId } = await pageFor();
  try {
    await page.getByRole('button', { name: 'Review payment' }).click();
    await page.getByRole('button', { name: 'Authorize 1.001 USDT' }).waitFor();
    const text = await page.textContent('body');
    assert.ok(
      text?.includes('0.001 USDT') &&
        text.includes('1 USDT') &&
        !text.includes(key),
    );
    await page.getByRole('button', { name: 'Authorize 1.001 USDT' }).click();
    await page
      .getByText('Authorizations submitted.', { exact: false })
      .waitFor();
    assert.equal((await state(page)).signedCount, 2);
    assert.equal((await state(page)).completed, 0);
    await settleThroughWorker(sessionId);
    await page.getByText('Payment confirmed.', { exact: true }).waitFor();
    assert.equal((await state(page)).completed, 1);
    assert.ok(
      !(await state(page)).methods.some(
        (m: string) => m.includes('sendTransaction') || m.includes('sendRaw'),
      ),
    );
  } finally {
    await context.close();
  }
});
for (const [mode, message] of [
  ['no-wallet', 'Connect an Ethereum wallet'],
  ['reject', 'Signature declined'],
  ['tamper', 'payment terms could not be verified'],
] as const)
  test(`browser ${mode} never submits payment signatures`, async () => {
    const { page, context, sessionId } = await pageFor(mode);
    try {
      await page.getByRole('button', { name: 'Review payment' }).click();
      if (mode === 'reject')
        await page
          .getByRole('button', { name: 'Authorize 1.001 USDT' })
          .click();
      await page.getByRole('alert').filter({ hasText: message }).waitFor();
      assert.equal((await state(page)).completed, 0);
      assert.equal(
        (
          await getDb().query(
            "SELECT count(*) FROM submissions WHERE session_id=$1 AND status IN ('queued','submitted','settled')",
            [sessionId],
          )
        ).rows[0].count,
        '0',
      );
    } finally {
      await context.close();
    }
  });
test('browser wrong-chain switch requires a user click before quote review', async () => {
  const { page, context } = await pageFor('wrong-chain');
  try {
    await page.getByRole('button', { name: 'Review payment' }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Switch your wallet' })
      .waitFor();
    assert.equal((await state(page)).signedCount, 0);
    await page
      .getByRole('button', { name: 'Switch to Whitechain Sepolia' })
      .click();
    await page.getByRole('button', { name: 'Authorize 1.001 USDT' }).waitFor();
    assert.equal((await state(page)).signedCount, 0);
  } finally {
    await context.close();
  }
});
test('browser disables authorization when two-minute cutoff is crossed', async () => {
  const { page, context } = await pageFor();
  try {
    await page.getByRole('button', { name: 'Review payment' }).click();
    await page.getByRole('button', { name: 'Authorize 1.001 USDT' }).waitFor();
    await page.clock.install();
    await page.clock.fastForward(781000);
    await page.getByRole('button', { name: 'Refresh quote' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Authorize 1.001 USDT' }).count(),
      0,
    );
    assert.equal((await state(page)).signedCount, 0);
  } finally {
    await context.close();
  }
});
