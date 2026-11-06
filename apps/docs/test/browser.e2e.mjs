import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = resolve(fileURLToPath(new URL('../out/', import.meta.url)));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
test('all built docs pages, internal links and anchors work in desktop and mobile Chrome', async () => {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
      let target = resolve(root, '.' + path);
      if (target !== root && !target.startsWith(root + sep))
        throw new Error('path');
      if (path === '/') target = resolve(root, 'index.html');
      else if (!extname(target)) target += '.html';
      if (!(await stat(target)).isFile()) throw new Error('not file');
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
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    const errors = [];
    const failedResources = [];
    page.on('response', (response) => {
      if (response.status() >= 400)
        failedResources.push(new URL(response.url()).pathname);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const routes = [
      '/',
      '/architecture',
      '/prerequisites',
      '/install',
      '/quickstart',
      '/server',
      '/sessions',
      '/wallets',
      '/statuses',
      '/fees',
      '/webhooks',
      '/idempotency',
      '/api-reference',
      '/contracts',
      '/local-development',
      '/security',
      '/limitations',
      '/troubleshooting',
      '/changelog',
    ];
    const links = new Set();
    for (const route of routes) {
      const response = await page.goto(origin + route);
      assert.equal(response.status(), 200, route);
      await page.locator('main h1').waitFor();
      const anchors = await page
        .locator('a[href]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
      for (const href of anchors)
        if (href.startsWith('/') && !href.startsWith('//')) links.add(href);
        else if (href.startsWith('#')) links.add(route + href);
    }
    for (const href of links) {
      const url = new URL(href, origin);
      const response = await page.request.get(origin + url.pathname);
      assert.equal(response.status(), 200, `Broken built link: ${href}`);
      await page.goto(url.href);
      if (url.hash)
        assert.ok(
          await page.evaluate(
            (id) => Boolean(document.getElementById(id)),
            decodeURIComponent(url.hash.slice(1)),
          ),
          `Missing anchor: ${href}`,
        );
    }
    await page.goto(origin + '/quickstart');
    assert.match(await page.locator('main').innerText(), /authorizeSession/);
    assert.match(
      await page.locator('pre').first().innerText(),
      /@whitepay\/react/,
    );
    await page.screenshot({
      path: join(tmpdir(), 'whitepay-docs-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('combobox').fill('webhook');
    try {
      await page.getByRole('option').first().waitFor({ timeout: 5000 });
    } catch (error) {
      console.log(
        'Search diagnostic:',
        await page.locator('.nextra-search-results').textContent(),
        failedResources,
        errors,
      );
      throw error;
    }
    assert.match(await page.getByRole('listbox').innerText(), /webhook/i);
    await page.getByRole('option').first().click();
    await page.locator('main h1').waitFor();
    assert.ok(routes.includes(new URL(page.url()).pathname));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/');
    await page.locator('main h1').waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      'Mobile horizontal overflow',
    );
    await page.screenshot({
      path: join(tmpdir(), 'whitepay-docs-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Limitations', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Current limitations', exact: true })
      .waitFor();
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log(
      `Verified ${routes.length} built pages and ${links.size} internal links/anchors; mobile screenshot saved privately.`,
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
});
