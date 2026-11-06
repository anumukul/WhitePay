import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function containsApiCredential(content) {
  return /wp_sk_[a-f0-9]{48}(?![a-f0-9])/i.test(content);
}
export async function scanApiCredentials(root) {
  const inventory = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  );
  if (inventory.status !== 0)
    throw new Error('Cannot enumerate repository files');
  const leaks = [];
  for (const file of new Set(inventory.stdout.split('\0').filter(Boolean))) {
    if (file.startsWith('keystores/')) {
      leaks.push(file + ' (wallet material must not be tracked)');
      continue;
    }
    if (
      file === '.env.example' ||
      !/\.(?:ts|tsx|mjs|js|md|json|yml|yaml|sql)$/.test(file)
    )
      continue;
    try {
      if ((await lstat(join(root, file))).isSymbolicLink()) continue;
      if (containsApiCredential(await readFile(join(root, file), 'utf8')))
        leaks.push(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return leaks;
}
