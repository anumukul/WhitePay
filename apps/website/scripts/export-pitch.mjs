import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serve, outputRoot } from './static-server.mjs';
export async function exportPitch(page, origin) {
  await page.goto(origin + '/pitch');
  await page.locator('.pitch-slide').last().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  const pages =
    bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  if (pages !== 8) throw Error(`Expected 8 PDF pages, received ${pages}`);
  const destination = fileURLToPath(
    new URL('../../../docs/pitch/', import.meta.url),
  );
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'whitepay-pitch.pdf'), bytes);
  await writeFile(join(outputRoot, 'whitepay-pitch.pdf'), bytes);
  return { pages, path: join(destination, 'whitepay-pitch.pdf') };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
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
      viewport: { width: 1280, height: 800 },
    });
    console.log(await exportPitch(page, server.origin));
  } finally {
    await browser?.close();
    await server.close();
  }
}
