import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
const names = ['@whitepay/node', '@whitepay/react'];
const archives = process.argv.slice(2);
assert.equal(
  archives.length,
  2,
  'Provide the Node and React release tarballs, in order',
);
function tar(args) {
  const r = spawnSync('tar', args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('Cannot inspect release archive');
  return r.stdout;
}
const packages = [];
for (let i = 0; i < archives.length; i++) {
  const path = archives[i],
    bytes = await readFile(path);
  const files = tar(['-tzf', path]).trim().split('\n').filter(Boolean);
  for (const file of files)
    assert.match(
      file,
      /^package\/(?:package\.json|README\.md|LICENSE|CHANGELOG\.md|dist\/[a-zA-Z0-9_-]+\.(?:js|d\.ts))$/,
      'Unexpected file in release archive',
    );
  const pkg = JSON.parse(tar(['-xOf', path, 'package/package.json']));
  assert.equal(pkg.name, names[i]);
  assert.equal(pkg.version, '0.1.0-alpha.0');
  assert.equal(pkg.license, 'MIT');
  assert.ok(!pkg.private);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.publishConfig?.tag, 'alpha');
  assert.equal(pkg.publishConfig?.registry, 'https://registry.npmjs.org/');
  for (const file of [
    'dist/index.js',
    'dist/index.d.ts',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
  ])
    assert.ok(
      files.includes('package/' + file),
      'Required public package file missing',
    );
  assert.equal(
    pkg.repository?.url,
    'git+https://github.com/anumukul/WhitePay.git',
  );
  for (const deps of [
    pkg.dependencies,
    pkg.optionalDependencies,
    pkg.peerDependencies,
  ])
    for (const version of Object.values(deps ?? {}))
      assert.ok(
        !/^(workspace:|file:|link:)/.test(version),
        'Local runtime dependency in package',
      );
  if (i === 0) assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  else assert.equal(pkg.dependencies?.viem, '2.38.5');
  for (const file of files) {
    const content = tar(['-xOf', path, file]);
    assert.ok(
      !/wp_sk_[a-f0-9]{48}(?![a-f0-9])/i.test(content),
      'Credential detected; value withheld',
    );
    assert.ok(
      !/whsec_[a-f0-9]{32,}/i.test(content),
      'Webhook credential detected; value withheld',
    );
    assert.ok(
      !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content),
      'Private material detected; value withheld',
    );
    if (file.startsWith('package/dist/')) {
      assert.ok(
        !/@whitepay\/(?:api|chain|shared)|keystores\/|runCastPrivately|node:child_process/.test(
          content,
        ),
        'Operator or private workspace dependency detected',
      );
      if (i === 1)
        assert.ok(
          !/node:/.test(content),
          'Node-only dependency in browser SDK',
        );
    }
  }
  packages.push({
    name: pkg.name,
    version: pkg.version,
    tag: 'alpha',
    access: 'public',
    archive: basename(path),
    files,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    dependencies: pkg.dependencies ?? {},
    peerDependencies: pkg.peerDependencies ?? {},
  });
}
console.log(
  JSON.stringify(
    {
      status: 'SDK_RELEASE_ARCHIVES_VERIFIED',
      registry: 'https://registry.npmjs.org/',
      published: false,
      packages,
    },
    null,
    2,
  ),
);
