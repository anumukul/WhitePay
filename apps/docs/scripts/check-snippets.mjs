import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'whitepay-docs-snippets-'));
try {
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    'dir',
  );
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const inputs = [];
  let shellCount = 0;
  for (const page of await readdir(join(root, 'pages'))) {
    if (!page.endsWith('.mdx')) continue;
    const content = await readFile(join(root, 'pages', page), 'utf8');
    let index = 0;
    for (const match of content.matchAll(/```(ts|tsx|bash)\n([\s\S]*?)```/g)) {
      const [, language, code] = match;
      if (language === 'bash') {
        const result = spawnSync('bash', ['-n'], {
          input: code,
          encoding: 'utf8',
        });
        if (result.status !== 0)
          throw new Error(`Invalid shell snippet: ${page}`);
        shellCount++;
      } else {
        const path = join(
          directory,
          page.replace('.mdx', '') + '-' + index++ + '.' + language,
        );
        await writeFile(path, code);
        inputs.push(path);
      }
    }
  }
  if (inputs.length < 5)
    throw new Error(
      'Expected complete React, server, session, webhook and error snippets',
    );
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--jsx',
      'react-jsx',
      ...inputs,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr);
    throw new Error('Copy-paste documentation snippets do not compile');
  }
  console.log(
    `PASS: ${inputs.length} literal TypeScript/React snippets compile; ${shellCount} shell snippets parse (not executed).`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
