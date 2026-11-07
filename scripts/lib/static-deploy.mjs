import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
const allowed = new Set([
  '.html',
  '.txt',
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.pdf',
  '.png',
  '.svg',
  '.webp',
  '.jpg',
  '.jpeg',
  '.ico',
  '.woff',
  '.woff2',
]);
export async function stageStatic({ source, destination, required }) {
  source = resolve(source);
  destination = resolve(destination);
  if (destination === source || destination.startsWith(source + '/'))
    throw Error('Destination must be isolated from source');
  const files = [];
  async function visit(directory, relative = '') {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name),
        route = relative ? relative + '/' + name : name;
      const info = await lstat(path);
      if (info.isSymbolicLink())
        throw Error('Symlinks are not allowed in a public deployment');
      if (
        name.startsWith('.') ||
        ['keystores', 'data', 'node_modules', 'vercel.json'].includes(name)
      )
        throw Error('Deployment contains a private or unsupported file');
      if (info.isDirectory()) {
        await visit(path, route);
        continue;
      }
      if (!info.isFile() || !allowed.has(extname(name)))
        throw Error('Deployment contains a private or unsupported file');
      const bytes = await readFile(path),
        text = bytes.toString('utf8');
      if (
        /wp_sk_[a-f0-9]{48}(?![a-f0-9])|whsec_[a-f0-9]{32,}|npm_[A-Za-z0-9]{36,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(
          text,
        )
      )
        throw Error('Credential-shaped content detected; value withheld');
      files.push({
        path: route,
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  await visit(source);
  for (const path of required)
    if (!files.some((file) => file.path === path))
      throw Error('Required public file missing: ' + path);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalBytes > 90 * 1024 * 1024)
    throw Error('Static deployment exceeds the reviewed size limit');
  // Validate every input before creating a destination or copying any bytes.
  await mkdir(destination, { recursive: false });
  for (const file of files) {
    await mkdir(resolve(destination, file.path, '..'), { recursive: true });
    await writeFile(join(destination, file.path), file.bytes, { flag: 'wx' });
  }
  const config = {
    framework: null,
    buildCommand: '',
    outputDirectory: '.',
    cleanUrls: true,
    trailingSlash: false,
  };
  await writeFile(
    join(destination, 'vercel.json'),
    JSON.stringify(config, null, 2) + '\n',
    { flag: 'wx' },
  );
  return {
    source,
    destination,
    totalBytes,
    files: files.map(({ path, sha256, bytes }) => ({
      path,
      sha256,
      bytes: bytes.length,
    })),
    config,
  };
}
