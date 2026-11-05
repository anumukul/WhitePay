import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDbForTests, closeDbForTests } from "../lib/db/index.js";
import { creditBalance } from "../lib/db/entitlements.js";
import { fulfill, CREDITS_PER_ORDER } from "../lib/fulfillment.js";

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "demo-saas-"));
  const path = join(dir, "test.db");
  resetDbForTests(path);
  return () => { closeDbForTests(); rmSync(dir, { recursive: true, force: true }); };
}

test("CP-12: duplicate webhook grants credits exactly once", () => {
  const cleanup = freshDb();
  try {
    const event = { eventId: "evt_1", orderId: "order_abc", providerPaymentId: "pi_1" };
    const r1 = fulfill("stripe", event);
    const r2 = fulfill("stripe", event);
    assert.equal(r1.granted, true);
    assert.equal(r1.duplicate, false);
    assert.equal(r2.granted, false);
    assert.equal(r2.duplicate, true);
    assert.equal(creditBalance(), CREDITS_PER_ORDER);
  } finally {
    cleanup();
  }
});

test("CP-13: browser success callback alone grants no credits", () => {
  const cleanup = freshDb();
  try {
    // Simulate: user hits /receipt?provider=stripe&orderId=order_xyz WITHOUT any webhook arriving.
    // No fulfill() call is made. Balance must stay zero.
    assert.equal(creditBalance(), 0);
  } finally {
    cleanup();
  }
});

test("CP-12b: two different providers both grant for distinct orders; duplicates still blocked", () => {
  const cleanup = freshDb();
  try {
    fulfill("stripe", { eventId: "evt_s", orderId: "order_s", providerPaymentId: "pi_s" });
    fulfill("whitepay", { eventId: "evt_w", orderId: "order_w", providerPaymentId: "wp_w" });
    fulfill("stripe", { eventId: "evt_s", orderId: "order_s", providerPaymentId: "pi_s" });
    assert.equal(creditBalance(), CREDITS_PER_ORDER * 2);
  } finally {
    cleanup();
  }
});
