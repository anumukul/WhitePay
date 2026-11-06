import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
const pages = new URL('../pages/', import.meta.url);
test('examples consume exact public registry SDK versions rather than workspace symlinks', async () => {
  for (const name of ['node', 'react']) {
    const url = new URL(
      `../node_modules/@whitepay/${name}/package.json`,
      import.meta.url,
    );
    const pkg = JSON.parse(await readFile(url, 'utf8'));
    assert.equal(pkg.name, '@whitepay/' + name);
    assert.equal(pkg.version, '0.1.0-alpha.0');
    assert.ok(
      !(await realpath(url)).includes('/packages/sdk-'),
      'Docs must consume registry artifacts',
    );
  }
});
const required = [
  'index',
  'architecture',
  'prerequisites',
  'install',
  'quickstart',
  'server',
  'sessions',
  'wallets',
  'statuses',
  'fees',
  'webhooks',
  'idempotency',
  'api-reference',
  'contracts',
  'local-development',
  'security',
  'limitations',
  'troubleshooting',
  'changelog',
];
test('every planned documentation topic has a real page and navigable internal links', async () => {
  const entries = await readdir(pages);
  for (const page of required) {
    assert.ok(
      entries.includes(page + '.mdx'),
      `Missing documentation page: ${page}`,
    );
    const source = await readFile(new URL(page + '.mdx', pages), 'utf8');
    assert.match(source, /^# .+/m);
    for (const match of source.matchAll(/\]\((\/[^)#\s]*)(?:#[^)]*)?\)/g)) {
      const target = match[1] === '/' ? 'index' : match[1].slice(1);
      assert.ok(
        required.includes(target),
        `Broken internal link in ${page}: ${match[1]}`,
      );
    }
  }
});
test('quickstart is a complete small component and discloses server fulfillment requirements', async () => {
  const source = await readFile(new URL('quickstart.mdx', pages), 'utf8');
  const code = source.match(/```tsx\n([\s\S]*?)```/)?.[1];
  assert.ok(code, 'Missing runnable React example');
  assert.ok(
    code.trim().split('\n').length <= 20,
    'Quickstart exceeds 20 lines',
  );
  assert.match(code, /@whitepay\/react/);
  assert.match(source, /authorizeSession/);
  assert.match(source, /webhook/);
  assert.match(source, /callback.*fulfillment|fulfillment.*callback/i);
});
test('public docs disclose testnet and deployment gaps and link actual settlement evidence', async () => {
  const home = await readFile(new URL('index.mdx', pages), 'utf8');
  const limitations = await readFile(new URL('limitations.mdx', pages), 'utf8');
  const contracts = await readFile(new URL('contracts.mdx', pages), 'utf8');
  assert.match(home, /Testnet only/);
  assert.match(limitations, /hosted.*not|not.*hosted/i);
  assert.match(
    limitations,
    /source verification.*open|source verification.*unavailable/i,
  );
  assert.match(contracts, /1874/);
  assert.match(contracts, /0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7/);
  assert.match(
    contracts,
    /0x77784da3835084852e0f3904ba6845011725ffade891175b4b4a96d93948b41c/,
  );
});
