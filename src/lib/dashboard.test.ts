import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "./dashboard.ts";
import type { Gift } from "../data/gifts.ts";

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 24, 12);
const gift = (id: string, room: Gift["room"], price: number, extra: Partial<Gift> = {}): Gift => ({
  id, room, price, lowestPrice: price, status: "available", name: id, model: "", brand: "", description: "", links: [], photos: [],
  quantity: 1, boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], ...extra,
});

const gifts = [
  gift("tv", "sala", 1000, { status: "bought", boughtUnits: 1, givers: [{ name: "Ana", tier: "Tia", units: 1 }] }),
  gift("lencol", "quarto", 100, { quantity: 3, boughtUnits: 1, heldUnits: 1, givers: [{ name: "Bia", tier: "Amiga", units: 1 }] }),
  gift("edredom", "quarto", 200, { status: "bought", boughtUnits: 1, givers: [{ name: "", tier: "", units: 1, byCouple: true }] }),
  gift("rascunho", "sala", 999, { status: "draft" }),
];
const purchases = [
  { giftId: "lencol", name: "Bia Lima", tier: "Amiga", units: 1, at: NOW - 2 * DAY },
  { giftId: "tv", name: "Ana Souza", tier: "Tia", units: 1, at: NOW - 40 * DAY },
];

test("totals count units and leave drafts out", () => {
  const s = summarize(gifts, purchases, NOW);
  assert.equal(s.total, 1000 + 300 + 200);
  assert.equal(s.bought, 1000 + 100 + 200);
  assert.equal(s.reserved, 100);
  assert.equal(s.left, 100);
  assert.deepEqual(s.units, { total: 5, bought: 3, held: 1 });
  assert.equal(s.gifts, 3);
});

test("rooms, tiers and the couple's own share", () => {
  const s = summarize(gifts, purchases, NOW);
  assert.deepEqual(s.rooms.map((r) => [r.id, r.total, r.bought, r.reserved]), [["sala", 1000, 1000, 0], ["quarto", 500, 300, 100]]);
  assert.deepEqual(s.tiers, [{ tier: "Tia", value: 1000 }, { tier: "Amiga", value: 100 }]);
  assert.equal(s.couple, 200);
});

test("days start at local midnight", () => {
  const now = new Date(2026, 10, 24, 15).getTime();
  const early = new Date(2026, 10, 24, 0, 30).getTime();
  const s = summarize(gifts, [{ giftId: "tv", name: "Ana", tier: "Tia", units: 1, at: early }], now);
  assert.equal(s.daily[29], 1000);
  assert.equal(new Date(s.start + 29 * DAY).getDate(), 24);
});

test("timeline starts from purchases before the window and accumulates by day", () => {
  const s = summarize(gifts, purchases, NOW, 30);
  assert.equal(s.timeline.length, 30);
  assert.equal(s.timeline[0], 1000);
  assert.equal(s.timeline[29], 1100);
  assert.deepEqual(s.latest.map((p) => [p.gift, p.value]), [["lencol", 100], ["tv", 1000]]);
});
