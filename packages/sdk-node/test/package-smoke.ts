import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createApp } from '@whitepay/api';
import { createMerchant, createPrice } from '@whitepay/api/src/merchants.js';
import { mintApiKey } from '@whitepay/api/src/auth.js';
import { resetDbForTests, closeDb } from '@whitepay/api/src/db.js';
const exec = promisify(execFile);
const pkg = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(pkg, '../..');
const temp = await mkdtemp(join(tmpdir(), 'whitepay-package-'));
let server: ReturnType<typeof createApp> | undefined;
try {
  await resetDbForTests(randomUUID());
  const merchant = await createMerchant({
    name: 'Independent SDK consumer',
    payoutAddress: '0x' + 'a'.repeat(40),
  });
  const key = (await mintApiKey(merchant.id)).secret;
  const price = await createPrice({
    merchantId: merchant.id,
    amountMinor: 1000000,
    currency: 'USDT',
    tokenAddress: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  });
  server = createApp();
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  await exec('pnpm', ['pack', '--pack-destination', temp], { cwd: pkg });
  const tarball = join(temp, 'whitepay-node-0.1.0-alpha.0.tgz');
  const { stdout: files } = await exec('tar', ['-tzf', tarball]);
  assert.ok(files.includes('package/dist/index.d.ts'));
  assert.ok(
    !files
      .split('\n')
      .some(
        (f) =>
          /keystore|\.env|test\/|node_modules|\.ts$/.test(f) &&
          !f.endsWith('.d.ts'),
      ),
  );
  const consumer = join(temp, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'independent-whitepay-check',
      private: true,
      type: 'module',
    }),
  );
  await exec(
    'npm',
    [
      'install',
      tarball,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: consumer },
  );
  await writeFile(
    join(consumer, 'check.mjs'),
    `
import assert from 'node:assert/strict';
import {WhitePay,verifyWebhook} from '@whitepay/node';
import {createHmac} from 'node:crypto';
const wp=new WhitePay({secretKey:process.env.WHITEPAY_SMOKE_SECRET,apiBaseUrl:process.env.WHITEPAY_SMOKE_API});
const input={priceId:process.env.WHITEPAY_SMOKE_PRICE,externalOrderId:'independent-package',customerReference:'independent-customer'};
const a=await wp.checkout.createSession(input,{idempotencyKey:'packed-smoke'});
const b=await wp.checkout.createSession(input,{idempotencyKey:'packed-smoke'});
assert.equal(a.id,b.id);assert.equal((await wp.checkout.retrieve(a.id)).customerReference,'independent-customer');
assert.equal((await wp.payments.list()).data.length,0);
const payload=JSON.stringify({id:'evt_smoke',type:'test.event',data:{}}),timestamp=String(Math.floor(Date.now()/1000)),secret='ephemeral-test';
const signature=createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
assert.equal(verifyWebhook({payload,timestamp,secret,signature}).id,'evt_smoke');
console.log(JSON.stringify({status:'INDEPENDENT_TARBALL_API_AND_WEBHOOK_CHECK_PASSED',sessionCreated:true,idempotencyVerified:true,customerReferenceVerified:true,secretsExposed:false}));
`,
  );
  const result = await exec(process.execPath, ['check.mjs'], {
    cwd: consumer,
    env: {
      ...process.env,
      WHITEPAY_SMOKE_SECRET: key,
      WHITEPAY_SMOKE_API: base,
      WHITEPAY_SMOKE_PRICE: price.id,
    },
  });
  const report = JSON.parse(result.stdout.trim());
  await writeFile(
    join(consumer, 'check.ts'),
    `
import {WhitePay,type CheckoutSession} from '@whitepay/node';
const wp=new WhitePay({secretKey:'synthetic',apiBaseUrl:'http://localhost:3001'});
const session:Promise<CheckoutSession>=wp.checkout.createSession({priceId:'price_test',externalOrderId:'order_test',customerReference:'customer_test'});
// @ts-expect-error customer references are text
wp.checkout.createSession({priceId:'price_test',externalOrderId:'order_test',customerReference:123});
// @ts-expect-error merchant prices use exact numeric minor units
wp.prices.create({productId:'prod_test',amountMinor:'1.00',currency:'USDT',tokenAddress:'0x0'});
void session;
`,
  );
  await exec(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'services/api/node_modules/@types'),
      'check.ts',
    ],
    { cwd: consumer },
  );
  const compiled = await readFile(
    join(consumer, 'node_modules/@whitepay/node/dist/index.js'),
    'utf8',
  );
  assert.ok(!compiled.includes('@whitepay/api'));
  console.log(
    JSON.stringify(
      {
        ...report,
        packageTypesChecked: true,
        runtimeWorkspaceDependencies: 0,
        registryPublication: false,
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    'Independent package check failed; sensitive child-process diagnostics withheld.',
  );
  process.exitCode = 1;
} finally {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  await closeDb();
  await rm(temp, { recursive: true, force: true });
}
