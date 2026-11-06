import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {spawn,type ChildProcess} from 'node:child_process';
import {chromium,type Browser} from '@playwright/test';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {createApp} from '@whitepay/api';
import {resetDbForTests,getDb as apiDb,closeDb} from '@whitepay/api/src/db.js';
import {createMerchant,createProduct,createPrice} from '@whitepay/api/src/merchants.js';
import {mintApiKey} from '@whitepay/api/src/auth.js';
import {settleRegisteredSubmission} from '../../../services/worker/test/settle-registered.js';
import {dispatchOnce} from '../../../services/worker/src/webhooks.js';
import {resetDbForTests as resetDemo,closeDbForTests as closeDemo,getDb as demoDb} from '../lib/db/index.js';
let api:ReturnType<typeof createApp>,server:ChildProcess,browser:Browser,origin:string,folder:string;
before(async()=>{
 await resetDbForTests(randomUUID());folder=mkdtempSync(join(tmpdir(),'whitepay-saas-browser-'));const database=join(folder,'saas.db');resetDemo(database);
 const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));origin=`http://127.0.0.1:${port}`;
 const fee='0x'+'f'.repeat(40);process.env.WHITEPAY_CHECKOUT_CONTRACT_ADDRESS='0x4d1761abb4ed290f23fcda00890039800e2e53f0';process.env.WHITEPAY_FEE_RECIPIENT=fee;process.env.WHITEPAY_FEE_BASIS_POINTS='10';process.env.WHITEPAY_QUOTE_VALIDITY_SECONDS='900';
 const merchant=await createMerchant({name:'Independent SaaS merchant',payoutAddress:'0x'+'b'.repeat(40),webhookUrl:origin+'/api/webhooks/whitepay'});
 const key=(await mintApiKey(merchant.id)).secret,product=await createProduct(merchant.id,'100 credits'),price=await createPrice({merchantId:merchant.id,productId:product.id,amountMinor:5000000,currency:'USDT',tokenAddress:'0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7'});
 api=createApp();await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const apiUrl=`http://127.0.0.1:${(api.address() as any).port}`;
 server=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'start','-p',String(port),'-H','127.0.0.1'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DEMO_DATABASE_PATH:database,APP_BASE_URL:origin,WHITEPAY_SECRET_KEY:key,WHITEPAY_API_URL:apiUrl,WHITEPAY_WEBHOOK_SECRET:merchant.webhookSecret,WHITEPAY_PRICE_ID:price.id,WHITEPAY_FEE_RECIPIENT:fee,NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 let ready=false;const until=Date.now()+30000;while(Date.now()<until){try{if((await fetch(origin)).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'SaaS startup');
 browser=await chromium.launch({executablePath:process.env.WHITEPAY_TEST_CHROME??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true});
});
after(async()=>{if(browser)await browser.close();if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise<void>(r=>server.once('exit',()=>r()));}if(api)await new Promise<void>(r=>api.close(()=>r()));closeDemo();await closeDb();if(folder)rmSync(folder,{recursive:true,force:true});});
test('independent SaaS SDK checkout and real signed HTTP webhook grant once; callback alone grants nothing',async()=>{
 const a=await browser.newContext(),b=await browser.newContext();const page=await a.newPage(),other=await b.newPage();const account=privateKeyToAccount(generatePrivateKey());let signed=0;
 await page.exposeFunction('__testWallet',async({method,params}:any)=>{
  if(method==='eth_chainId')return '0x752';if(method==='eth_requestAccounts'||method==='eth_accounts')return [account.address];if(method==='eth_call')return '0x'+(10000000n).toString(16).padStart(64,'0');
  if(method==='eth_signTypedData_v4'){signed++;return account.signTypedData(JSON.parse(params[1]));}throw new Error('test_wallet_transaction_denied');
 });
 // Inject as a string: tsx/esbuild keepNames breaks Playwright function serialization.
 await page.addInitScript("window.ethereum={request:(args)=>window.__testWallet(args)};");
 try{
  await page.goto(origin);await page.getByRole('button',{name:'Start your demo session'}).click();await page.getByRole('button',{name:'Continue to WhitePay'}).waitFor();
  await page.getByRole('button',{name:'Continue to WhitePay'}).click();await page.getByRole('button',{name:'Review payment'}).waitFor({timeout:15000});
  const orderId=new URL(page.url()).pathname.split('/').at(-1)!;
  const order=demoDb().prepare('SELECT * FROM orders WHERE id=?').get(orderId) as any;assert.ok(order?.session_id);
  await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Authorize 5.005 USDT'}).waitFor();await page.getByRole('button',{name:'Authorize 5.005 USDT'}).click();await page.getByText('Authorizations submitted.',{exact:false}).waitFor();assert.equal(signed,2);
  const submission=(await apiDb().query("SELECT id FROM submissions WHERE session_id=$1 AND status='queued'",[order.session_id])).rows[0];assert.ok(submission);
  await settleRegisteredSubmission(submission.id);
  await page.getByText('Payment confirmed.',{exact:true}).waitFor();
  assert.equal((demoDb().prepare('SELECT COALESCE(SUM(delta),0) AS n FROM credit_ledger').get() as any).n,0);
  const delivered=await dispatchOnce({allowedOrigins:[origin],allowLocal:true});assert.equal(delivered.state,'delivered');
  await apiDb().query("UPDATE webhook_outbox SET state='pending',next_attempt_at=0,attempts=0 WHERE event_id=$1",[delivered.eventId]);assert.equal((await dispatchOnce({allowedOrigins:[origin],allowLocal:true})).state,'delivered');
  assert.equal((demoDb().prepare('SELECT COUNT(*) AS n FROM entitlements').get() as any).n,1);
  await page.goto(origin+'/credits');await page.getByTestId('credit-balance').filter({hasText:'100'}).waitFor();
  await page.getByRole('button',{name:'Run sample action — spend 1 credit'}).click();await page.getByTestId('credit-balance').filter({hasText:'99'}).waitFor();
  await other.goto(origin);await other.getByRole('button',{name:'Start your demo session'}).click();const stolen=await other.request.get(origin+'/api/whitepay/sessions/'+order.session_id);assert.equal(stolen.status(),404);
  await other.goto(origin+'/credits');assert.equal(await other.getByTestId('credit-balance').textContent(),'0');assert.equal(await other.getByRole('button',{name:'Run sample action — spend 1 credit'}).isDisabled(),true);
  assert.equal((await other.goto(origin+'/checkout/'+orderId))?.status(),404);
 }finally{await a.close();await b.close();}
});
