import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (path) =>
  readFile(new URL('../' + path, import.meta.url), 'utf8');
test('landing offers a real local demo route and discloses testnet rather than stale funding claims', async () => {
  const page = await source('app/page.tsx');
  assert.match(page, /href="\/demo"/);
  assert.match(page, /Testnet only/);
  assert.doesNotMatch(
    page,
    /settled in real dollars|awaiting.*approve publish|Blocked on Step 02 funding/,
  );
});
test('shared marketing evidence pins exact official settlement and honest public links', async () => {
  const { evidence, links } = await import('../lib/content.mjs');
  assert.equal(evidence.chainId, 1874);
  assert.equal(evidence.token, '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7');
  assert.equal(
    evidence.transaction,
    '0x77784da3835084852e0f3904ba6845011725ffade891175b4b4a96d93948b41c',
  );
  assert.equal(evidence.amountMinor + evidence.feeMinor, evidence.totalMinor);
  assert.equal(evidence.payerWbt, '0');
  for (const url of Object.values(links))
    assert.ok(
      url.startsWith('https://github.com/anumukul/WhitePay') ||
        url.startsWith('https://whitepay-docs.vercel.app') ||
        url === 'https://whitepay-saas.onrender.com' ||
        url.startsWith('https://www.npmjs.com/package/@whitepay/') ||
        url.startsWith('https://explorer.testnet.whitechain.io/'),
    );
});
test('pitch has exactly eight substantive slides and keeps outstanding qualification gaps visible', async () => {
  const { slides } = await import('../lib/content.mjs');
  assert.equal(slides.length, 8);
  for (const slide of slides) {
    assert.ok(slide.title.length > 5);
    assert.ok(slide.body.length > 30);
    assert.ok(slide.notes.length > 20);
  }
  const text = JSON.stringify(slides);
  assert.match(text, /source verification.*open/i);
  assert.match(text, /hosted.*worker.*pending/i);
  assert.match(text, /controlled receipts/);
  assert.match(text, /refunds|subscriptions/i);
});
