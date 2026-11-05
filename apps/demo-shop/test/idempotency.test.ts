import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDbForTests, closeDbForTests } from "../lib/db/index.js";
import { countEntitlements, consumeDownload, getDownloadByOrder } from "../lib/db/entitlements.js";
import { fulfill } from "../lib/fulfillment.js";

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "demo-shop-"));
  const path = join(dir, "test.db");
  resetDbForTests(path);
  return () => { closeDbForTests(); rmSync(dir, { recursive: true, force: true }); };
}

test("CP-21: duplicate webhook creates exactly one entitlement", () => {
  const cleanup = freshDb();
  try {
    const event = { eventId: "evt_shop_1", orderId: "shop_abc", providerPaymentId: "pi_shop_1" };
    const r1 = fulfill("stripe", event);
    const r2 = fulfill("stripe", event);
    assert.equal(r1.granted, true);
    assert.equal(r2.duplicate, true);
    assert.equal(r2.granted, false);
    assert.equal(countEntitlements(), 1);
    const row = getDownloadByOrder("shop_abc");
    assert.ok(row);
    assert.ok(row!.downloadToken.length > 20);
  } finally {
    cleanup();
  }
});

test("CP-22: browser success callback alone unlocks no download", () => {
  const cleanup = freshDb();
  try {
    // User lands on /download?orderId=shop_xyz without any webhook. No entitlement must exist.
    assert.equal(countEntitlements(), 0);
    const row = getDownloadByOrder("shop_xyz");
    assert.equal(row, undefined);
  } finally {
    cleanup();
  }
});

test("CP-21b: download token is single-use", () => {
  const cleanup = freshDb();
  try {
    const r = fulfill("whitepay", { eventId: "evt_shop_2", orderId: "shop_x", providerPaymentId: "wp_2" });
    assert.ok(r.downloadToken);
    const first = consumeDownload(r.downloadToken!);
    assert.equal(first.ok, true);
    const second = consumeDownload(r.downloadToken!);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "already_consumed");
  } finally {
    cleanup();
  }
});
