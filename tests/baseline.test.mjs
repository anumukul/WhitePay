import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const json = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
test('workspace exposes required checks and pinned package manager', () => {
  const pkg = json('../package.json');
  assert.equal(pkg.packageManager, 'pnpm@10.25.0');
  for (const name of [
    'test',
    'lint',
    'typecheck',
    'build',
    'test:integration',
    'test:e2e',
    'test:sepolia',
  ]) {
    assert.ok(pkg.scripts[name], `Missing ${name}`);
  }
});
test('chain configuration rejects accidental token or network substitution', async () => {
  const { WHITECHAIN_SEPOLIA } = await import(
    '../packages/shared/dist/index.js'
  );
  assert.equal(WHITECHAIN_SEPOLIA.id, 1874);
  assert.equal(
    WHITECHAIN_SEPOLIA.usdt,
    '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  );
  assert.equal(WHITECHAIN_SEPOLIA.nativeCurrency.symbol, 'WBT');
  assert.equal(
    'decimals' in WHITECHAIN_SEPOLIA,
    false,
    'USDT decimals require live discovery',
  );
  assert.equal(Object.isFrozen(WHITECHAIN_SEPOLIA), true);
});
test('implementation progress and local configuration templates exist', () => {
  for (const file of [
    'docs/progress/STATE.md',
    'docs/progress/step-02.md',
    '.env.example',
    '.gitignore',
  ]) {
    assert.ok(
      existsSync(new URL(`../${file}`, import.meta.url)),
      `Missing ${file}`,
    );
  }
});
