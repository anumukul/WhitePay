import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { resetDbForTests, closeDb } from "../src/db.js";
import { createMerchant, createPrice } from "../src/merchants.js";
import { mintApiKey } from "../src/auth.js";
import { createApp } from "../src/app.js";

let tmp: string;
let baseUrl: string;
let server: ReturnType<typeof createApp>;
let merchantA: { id: string; secret: string };
let merchantB: { id: string; secret: string };
let priceA: string;
let priceB: string;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "api-"));
  resetDbForTests(join(tmp, "api.db"));

  const a = createMerchant({ name: "A Inc", payoutAddress: "0xA".padEnd(42, "0") });
  const b = createMerchant({ name: "B Inc", payoutAddress: "0xB".padEnd(42, "0") });
  merchantA = { id: a.id, secret: mintApiKey(a.id).secret };
  merchantB = { id: b.id, secret: mintApiKey(b.id).secret };
  priceA = createPrice({
    merchantId: a.id, amountMinor: 5_000_000, currency: "USDT",
    tokenAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  }).id;
  priceB = createPrice({
    merchantId: b.id, amountMinor: 1_000_000, currency: "USDT",
    tokenAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  }).id;

  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

test("rejects missing auth", async () => {
  const r = await req("/v1/payments");
  assert.equal(r.status, 401);
});

test("rejects forged key prefix", async () => {
  const r = await req("/v1/payments", { headers: { authorization: "Bearer wp_sk_notreal" } });
  assert.equal(r.status, 401);
});

test("creates session for merchant A", async () => {
  const r = await req("/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${merchantA.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_1" }),
  });
  assert.equal(r.status, 200);
  const body = (await r.json()) as { id: string; amountMinor: number; status: string };
  assert.ok(body.id.startsWith("cs_"));
  assert.equal(body.amountMinor, 5_000_000);
  assert.equal(body.status, "open");
});

test("merchant B cannot use merchant A's priceId", async () => {
  const r = await req("/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${merchantB.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ priceId: priceA, externalOrderId: "attack_1" }),
  });
  assert.equal(r.status, 404);
});

test("merchant B cannot read merchant A's session", async () => {
  // A creates
  const create = await req("/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${merchantA.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_cross" }),
  });
  const session = (await create.json()) as { id: string };
  // B tries
  const r = await req(`/v1/checkout/sessions/${session.id}`, {
    headers: { authorization: `Bearer ${merchantB.secret}` },
  });
  assert.equal(r.status, 404);
});

test("duplicate externalOrderId returns the same session (no second row)", async () => {
  const r1 = await req("/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${merchantA.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_dup" }),
  });
  const r2 = await req("/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${merchantA.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_dup" }),
  });
  const s1 = (await r1.json()) as { id: string };
  const s2 = (await r2.json()) as { id: string };
  assert.equal(s1.id, s2.id);
});

test("idempotency key replays the stored response", async () => {
  const headers = {
    authorization: `Bearer ${merchantA.secret}`,
    "content-type": "application/json",
    "idempotency-key": "idem-1",
  };
  const r1 = await req("/v1/checkout/sessions", {
    method: "POST", headers,
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_idem" }),
  });
  const r2 = await req("/v1/checkout/sessions", {
    method: "POST", headers,
    body: JSON.stringify({ priceId: priceA, externalOrderId: "order_A_idem_different" }),
  });
  const b1 = await r1.json();
  const b2 = await r2.json();
  assert.deepEqual(b1, b2);
});

test("health check is unauthenticated", async () => {
  const r = await req("/health");
  assert.equal(r.status, 200);
});
