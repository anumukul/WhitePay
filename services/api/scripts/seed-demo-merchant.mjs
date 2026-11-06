// Local Step 05 manual fixture; writes credentials once to an ignored owner-only file.
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createMerchant,
  createProduct,
  createPrice,
} from '../src/merchants.js';
import { mintApiKey } from '../src/auth.js';
import { migrate, closeDb } from '../src/db.js';
const directory = fileURLToPath(new URL('../../../data/', import.meta.url));
await mkdir(directory, { recursive: true, mode: 0o700 });
const info = await lstat(directory);
if (
  info.isSymbolicLink() ||
  !info.isDirectory() ||
  (info.mode & 0o777) !== 0o700
)
  throw new Error(
    'Local fixture directory must be an owner-only real directory',
  );
const output = directory + 'step05-demo-' + Date.now() + '.json';
try {
  await migrate();
  const fixture = {};
  for (const [role, payout] of [
    ['A', 'a'],
    ['B', 'b'],
  ]) {
    const merchant = await createMerchant({
      name: `Step05 merchant ${role}`,
      payoutAddress: '0x' + payout.repeat(40),
    });
    const key = await mintApiKey(merchant.id, Date.now() + 24 * 60 * 60 * 1000);
    const product = await createProduct(merchant.id, 'Test credits');
    const price = await createPrice({
      merchantId: merchant.id,
      productId: product.id,
      amountMinor: 1000000,
      currency: 'USDT',
      tokenAddress: '0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7',
    });
    fixture[role] = {
      merchantId: merchant.id,
      apiKey: key.secret,
      productId: product.id,
      priceId: price.id,
    };
  }
  await writeFile(output, JSON.stringify(fixture, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Local merchant fixtures saved to ${output}. API keys are not printed; keep this file private.`,
  );
} finally {
  await closeDb();
}
