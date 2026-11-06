import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const pages = new URL('../pages/', import.meta.url);
const entries = [];
for (const name of (await readdir(pages)).sort()) {
  if (!name.endsWith('.mdx')) continue;
  const source = await readFile(new URL(name, pages), 'utf8');
  const title = source.match(/^# (.+)$/m)?.[1];
  if (!title) throw new Error('Documentation title missing');
  const content = source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  entries.push({
    route: name === 'index.mdx' ? '/' : '/' + name.slice(0, -4),
    title,
    content,
  });
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../public/search-index.json', import.meta.url),
  JSON.stringify(entries),
);
console.log(`Built static search index for ${entries.length} docs pages.`);
