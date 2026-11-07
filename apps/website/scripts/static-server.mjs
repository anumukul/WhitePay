import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const outputRoot = resolve(
  fileURLToPath(new URL('../out/', import.meta.url)),
);
export async function serve() {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
      let target = resolve(outputRoot, '.' + path);
      if (target !== outputRoot && !target.startsWith(outputRoot + sep))
        throw Error('path');
      if (path === '/') target = resolve(outputRoot, 'index.html');
      else if (!extname(target)) target += '.html';
      if (!(await stat(target)).isFile()) throw Error('file');
      res.setHeader(
        'content-type',
        types[extname(target)] ?? 'application/octet-stream',
      );
      res.end(await readFile(target));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}
