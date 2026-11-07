import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { serve } from '../scripts/static-server.mjs';
import { exportPitch } from '../scripts/export-pitch.mjs';
import { links } from '../lib/content.mjs';
test('public pages preserve a locked injected provider and never request a wallet', async () => {
  const server = await serve();
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__walletCalls = 0;
      const provider = Object.freeze({
        request() {
          window.__walletCalls++;
          throw new Error('wallet access forbidden');
        },
      });
      Object.defineProperty(window, 'ethereum', {
        value: provider,
        configurable: false,
        writable: false,
      });
      // Model a second extension competing with the first, not application code.
      try {
        Object.defineProperty(window, 'ethereum', {
          value: {},
          configurable: true,
        });
      } catch (error) {
        window.__extensionCollision = error.message;
      }
      window.__originalProvider = provider;
    });
    for (const path of ['/', '/demo', '/pitch']) {
      assert.equal((await page.goto(server.origin + path)).status(), 200);
      await page.locator('h1').waitFor();
      if (path === '/demo')
        await page.getByRole('button', { name: 'Merchant view' }).click();
      const state = await page.evaluate(() => ({
        collision: window.__extensionCollision,
        unchanged: window.ethereum === window.__originalProvider,
        configurable: Object.getOwnPropertyDescriptor(window, 'ethereum')
          .configurable,
        calls: window.__walletCalls,
      }));
      assert.match(state.collision, /Cannot redefine property: ethereum/);
      assert.equal(state.unchanged, true);
      assert.equal(state.configurable, false);
      assert.equal(state.calls, 0);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
test('landing CTAs, historical buyer/merchant views, eight-slide deck and mobile layout work', async () => {
  const server = await serve();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const shots = join(tmpdir(), 'whitepay-step15');
    await mkdir(shots, { recursive: true });
    const result = await exportPitch(page, server.origin);
    assert.equal(result.pages, 8);
    const paths = new Set();
    const external = new Set();
    for (const route of ['/', '/demo', '/pitch']) {
      assert.equal((await page.goto(server.origin + route)).status(), 200);
      await page.locator('h1').waitFor();
      if (route === '/pitch')
        await page
          .getByRole('link', { name: 'Download PDF', exact: true })
          .waitFor();
      for (const href of await page
        .locator('a[href]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('href')),
        )) {
        if (href.startsWith('/')) paths.add(href);
        else if (href.startsWith('https://')) external.add(href);
      }
    }
    for (const path of paths)
      assert.equal(
        (await page.request.get(server.origin + path)).status(),
        200,
        `Broken internal CTA: ${path}`,
      );
    for (const url of external)
      assert.ok(
        Object.values(links).includes(url),
        `Unexpected external CTA: ${url}`,
      );
    await page.goto(server.origin + '/');
    await page.getByRole('link', { name: 'Explore the payment proof' }).click();
    await page
      .getByRole('heading', { name: 'Authorized USDT. Spent zero WBT.' })
      .waitFor();
    assert.match(await page.locator('main').innerText(), /0 → 0 WBT/);
    await page.getByRole('button', { name: 'Merchant view' }).click();
    await page
      .getByRole('heading', { name: 'Exact payout. Inspectable settlement.' })
      .waitFor();
    assert.match(await page.locator('main').innerText(), /1 USDT/);
    assert.match(await page.locator('main').innerText(), /0.001 USDT/);
    await page.screenshot({
      path: join(shots, 'merchant.png'),
      fullPage: true,
    });
    await page.goto(server.origin + '/pitch');
    assert.equal(await page.locator('.pitch-slide').count(), 8);
    await page.keyboard.press('ArrowRight');
    await page.waitForURL('**/pitch#slide-2');
    await page.keyboard.press('ArrowLeft');
    await page.waitForURL('**/pitch#slide-1');
    for (let i = 0; i < 8; i++) {
      const slide = page.locator('.pitch-slide').nth(i);
      await slide.scrollIntoViewIfNeeded();
      const fits = await slide.evaluate((node) => {
        const footer = node
          .querySelector('.slide-footer')
          .getBoundingClientRect();
        const content =
          node.querySelector('.slide-source') ?? node.querySelector('ul');
        return (
          node.scrollHeight <= node.clientHeight + 1 &&
          content.getBoundingClientRect().bottom < footer.top
        );
      });
      assert.ok(fits, `Slide ${i + 1} text overflows or meets footer`);
      await slide.screenshot({ path: join(shots, `slide-${i + 1}.png`) });
    }
    await page.goto(server.origin + '/');
    await page.screenshot({
      path: join(shots, 'landing-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/', '/demo', '/pitch']) {
      await page.goto(server.origin + route);
      await page.locator('h1').waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Mobile overflow: ${route}`,
      );
    }
    await page.goto(server.origin + '/');
    await page.screenshot({
      path: join(shots, 'landing-mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      `Verified ${paths.size} internal CTAs, ${external.size} reviewed external destinations, both receipt views, 8 PDF pages and mobile layouts. Screenshots: ${shots}`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
});
