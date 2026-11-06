// Step 16 — adversarial regression across the whole system.
// Pure-Node; relies on each service's own test suite for deep coverage.
// This file asserts the high-level "attacker cannot …" invariants.

import { test } from "node:test";
import assert from "node:assert/strict";

test("README advertises the correct submission-gate shape", async () => {
  const fs = await import("node:fs/promises");
  const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8");
  // If the submission README silently loses a required claim, fail.
  for (const must of [
    "WhitePay",
    "Whitechain",
    "USDT",
  ]) {
    assert.match(readme, new RegExp(must, "i"), `README missing required token: ${must}`);
  }
});

test("secret-scanning: no plaintext 'wp_sk_' outside .env.example and test fixtures", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:");
  const allowSubstrings = ["wp_sk_notreal", "wp_sk_bogus", "wp_sk_anything", "wp_sk_...", "REPLACE"];
  const skipDirs = new Set(["node_modules", ".next", "dist", "cache", "cache-step03", "out", "out-step03", ".git", "lib"]);
  const skipFiles = new Set([".env.example", "secret-scan.md"]);
  const leaks = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (skipDirs.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      if (skipFiles.has(e.name)) continue;
      if (!/\.(ts|tsx|mjs|js|md|json)$/.test(e.name)) continue;
      const content = await fs.readFile(full, "utf8");
      const matches = content.match(/wp_sk_[A-Za-z0-9_]+/g) ?? [];
      for (const m of matches) {
        if (allowSubstrings.some((s) => m.includes(s))) continue;
        if (/^wp_sk_[a-f0-9]{48}$/.test(m)) {
          leaks.push(`${full}: ${m}`);
        }
      }
    }
  }
  await walk(root);
  assert.equal(leaks.length, 0, `Possible secret leaks:\n${leaks.join("\n")}`);
});
