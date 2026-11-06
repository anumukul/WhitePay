import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createApp } from '@whitepay/api';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';
import {
  createMerchant,
  createProduct,
  createPrice,
} from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import { createSession } from '@whitepay/api/src/sessions.js';
import {
  buildOrderForSession,
  recordSignatures,
} from '@whitepay/api/src/orders.js';
import { settleRegisteredSubmission } from '../../../services/worker/test/settle-registered.js';
let api: ReturnType<typeof createApp>,
  server: ChildProcess,
  browser: Browser,
  origin: string,
  apiUrl: string;
let ownerA: string, ownerB: string, hashA: string, hashB: string;
before(async () => {
  await resetDbForTests(randomUUID());
  process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS =
    '0x4d1761abb4ed290f23fcda00890039800e2e53f0';
  process.env.WHITEPAY_FEE_RECIPIENT = '0x' + 'f'.repeat(40);
  process.env.WHITEPAY_FEE_BASIS_POINTS = '10';
  process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS = '900';
  async function seed(name: string, address: string) {
    const merchant = await createMerchant({ name, payoutAddress: address }),
      key = (await mintApiKey(merchant.id)).secret;
    const product = await createProduct(merchant.id, name + ' product'),
      price = await createPrice({
        merchantId: merchant.id,
        productId: product.id,
        amountMinor: 1000000,
        currency: 'USDT',
        tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
      });
    const session = await createSession({
        merchantId: merchant.id,
        priceId: price.id,
        externalOrderId: name + ' order',
      }),
      payer = privateKeyToAccount(generatePrivateKey());
    const quote = await buildOrderForSession({
      merchantId: merchant.id,
      sessionId: session.id,
      payerAddress: payer.address,
    });
    await recordSignatures({
      merchantId: merchant.id,
      submissionId: quote.submissionId,
      orderSignature: await payer.signTypedData(quote.typedData as any),
      tokenSignature: await payer.signTypedData(quote.tokenTypedData),
    });
    const hash = await settleRegisteredSubmission(quote.submissionId);
    return { key, hash };
  }
  const a = await seed('Owner A', '0x' + 'a'.repeat(40)),
    b = await seed('Owner B', '0x' + 'b'.repeat(40));
  ownerA = a.key;
  ownerB = b.key;
  hashA = a.hash;
  hashB = b.hash;
  api = createApp();
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${(api.address() as any).port}`;
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/next/dist/bin/next', import.meta.url),
      ),
      'start',
      '-p',
      String(port),
      '-H',
      '127.0.0.1',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: {
        ...process.env,
        WHITEPAY_API_URL: apiUrl,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'ignore',
    },
  );
  const until = Date.now() + 30000;
  let ready = false;
  while (Date.now() < until) {
    try {
      const r = await fetch(origin);
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, 'dashboard server startup');
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
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise<void>((r) => server.once('exit', () => r()));
  }
  if (api) await new Promise<void>((r) => api.close(() => r()));
  await closeDb();
});
async function login(key: string) {
  const context = await browser.newContext(),
    page = await context.newPage();
  await page.goto(origin);
  await page.getByLabel('API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(origin + '/payments');
  return { context, page };
}
test('two merchant browsers isolate products, orders, payments and actual receipt links', async () => {
  const a = await login(ownerA),
    b = await login(ownerB);
  try {
    assert.equal(
      await a.page
        .getByRole('link', { name: 'View receipt' })
        .getAttribute('href'),
      'https://explorer.testnet.whitechain.io/tx/' + hashA,
    );
    assert.equal(
      await b.page
        .getByRole('link', { name: 'View receipt' })
        .getAttribute('href'),
      'https://explorer.testnet.whitechain.io/tx/' + hashB,
    );
    assert.ok(!(await a.page.textContent('body'))?.includes(ownerA));
    for (const [route, aText, bText] of [
      ['products', 'Owner A product', 'Owner B product'],
      ['orders', 'Owner A order', 'Owner B order'],
    ]) {
      await a.page.goto(origin + '/' + route);
      await b.page.goto(origin + '/' + route);
      const ta = await a.page.textContent('body'),
        tb = await b.page.textContent('body');
      assert.ok(ta?.includes(aText) && !ta.includes(bText));
      assert.ok(tb?.includes(bText) && !tb.includes(aText));
    }
    const cookies = await a.context.cookies();
    assert.ok(
      cookies.some(
        (c) =>
          c.name === 'whitepay_dashboard' &&
          c.httpOnly &&
          c.sameSite === 'Strict',
      ),
    );
    assert.ok(cookies.every((c) => !c.value.includes(ownerA)));
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
test('merchant can create and rename product and add immutable price versions in browser', async () => {
  const { page, context } = await login(ownerA);
  try {
    await page.goto(origin + '/products');
    await page
      .getByLabel('New product name', { exact: true })
      .fill('Created in browser');
    await page
      .getByRole('button', { name: 'Create product', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Created in browser', exact: true })
      .waitFor();
    const section = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'Created in browser',
        exact: true,
      }),
    });
    await section
      .getByLabel('Product name', { exact: true })
      .fill('Renamed in browser');
    await section.getByRole('button', { name: 'Rename product' }).click();
    await page
      .getByRole('heading', { name: 'Renamed in browser', exact: true })
      .waitFor();
    const renamed = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'Renamed in browser',
        exact: true,
      }),
    });
    await renamed.getByRole('spinbutton').fill('1000000');
    await renamed.getByRole('button', { name: 'Add price version' }).click();
    await renamed.getByText('Version 1: 1 USDT', { exact: false }).waitFor();
    await renamed.getByRole('spinbutton').fill('2000000');
    await renamed.getByRole('button', { name: 'Add price version' }).click();
    await renamed.getByText('Version 2: 2 USDT', { exact: false }).waitFor();
    assert.equal(
      await renamed.getByText('Version 1: 1 USDT', { exact: false }).count(),
      1,
    );
  } finally {
    await context.close();
  }
});
test('API keys show once, revoke correctly and webhook settings reject unsafe URLs without sending', async () => {
  const { page, context } = await login(ownerA);
  try {
    await page.goto(origin + '/settings');
    await page
      .getByRole('button', { name: 'Create API key', exact: true })
      .click();
    const flash = page.getByTestId('one-time-secret');
    await flash.waitFor();
    const secret = (await flash.textContent())!;
    assert.ok(secret.startsWith('wp_sk_'));
    await page.reload();
    assert.equal(await page.getByTestId('one-time-secret').count(), 0);
    assert.ok(!(await page.textContent('body'))?.includes(secret));
    const keyRow = page
      .getByRole('listitem')
      .filter({ hasText: secret.slice(0, 10) });
    await keyRow.getByRole('button', { name: /Revoke key/ }).click();
    await keyRow.getByText('Revoked', { exact: false }).waitFor();
    const denied = await fetch(apiUrl + '/v1/merchant', {
      headers: { authorization: 'Bearer ' + secret },
    });
    assert.equal(denied.status, 401);
    await page
      .getByLabel('Webhook URL', { exact: true })
      .fill('https://127.0.0.1/hook');
    await page
      .getByRole('button', { name: 'Save webhook', exact: true })
      .click();
    await page.getByRole('alert').waitFor();
    assert.equal(
      await page.getByLabel('Webhook URL', { exact: true }).inputValue(),
      'https://127.0.0.1/hook',
    );
    await page
      .getByLabel('Webhook URL', { exact: true })
      .fill('https://merchant.example/hook');
    await page
      .getByRole('button', { name: 'Save webhook', exact: true })
      .click();
    try {
      await page.getByTestId('one-time-secret').waitFor({ timeout: 3000 });
    } catch {
      const alerts = await page.getByRole('alert').allTextContents();
      console.log(
        JSON.stringify({
          diagnostic: 'webhook_form',
          alerts,
          localAllowed: process.env.WHITEPAY_ALLOW_LOCAL_WEBHOOKS === '1',
          input: await page
            .getByLabel('Webhook URL', { exact: true })
            .inputValue(),
        }),
      );
      throw new Error('webhook_creation_secret_not_visible');
    }
    await page.reload();
    assert.equal(await page.getByTestId('one-time-secret').count(), 0);
    await page.getByRole('button', { name: 'Send signed test event' }).click();
    await page
      .getByText('Test delivery was blocked or failed.', { exact: false })
      .waitFor();
  } finally {
    await context.close();
  }
});
test('browser rejects invalid login and logout invalidates the dashboard session', async () => {
  const context = await browser.newContext(),
    page = await context.newPage();
  try {
    await page.goto(origin);
    await page.getByLabel('API key', { exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.ok(
      !(await context.cookies()).some((c) => c.name === 'whitepay_dashboard'),
    );
  } finally {
    await context.close();
  }
  const logged = await login(ownerB);
  try {
    await logged.page
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await logged.page
      .getByRole('heading', { name: 'Merchant sign in' })
      .waitFor();
    await logged.page.goto(origin + '/payments');
    await logged.page
      .getByRole('heading', { name: 'Merchant sign in' })
      .waitFor();
  } finally {
    await logged.context.close();
  }
});
