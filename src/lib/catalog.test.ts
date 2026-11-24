import { test } from "node:test";
import assert from "node:assert/strict";
import { activeIndex, visibleGifts, roomProgress, progressLabel, isSoldOut, giverLabel, HOLD_HOURS } from "./catalog.ts";
import type { Gift } from "../data/gifts.ts";

const NOW = Date.UTC(2026, 10, 24, 12);
const H = 3600_000;

const gift = (id: string, room: Gift["room"], price: number, status: Gift["status"] = "available", extra: Partial<Gift> = {}): Gift => ({
  id, room, price, status, name: id, model: "", brand: "", description: "", links: [], photos: [],
  reservedAt: status === "reserved" ? NOW - H : null, giverName: null, giverTier: null, byCouple: false, ...extra,
});

const gifts = [
  gift("c", "sala", 720, "bought"),
  gift("a", "sala", 89),
  gift("b", "sala", 150),
  gift("d", "cozinha", 1290, "reserved"),
  gift("e", "cozinha", 499),
  gift("x", "cozinha", 300, "draft"),
];

test("activeIndex splits progress into equal slices and clamps the ends", () => {
  assert.equal(activeIndex(0, 6), 0);
  assert.equal(activeIndex(0.17, 6), 1);
  assert.equal(activeIndex(0.999, 6), 5);
  assert.equal(activeIndex(1, 6), 5);
  assert.equal(activeIndex(-0.5, 6), 0);
  assert.equal(activeIndex(2, 6), 5);
  assert.equal(activeIndex(0.5, 0), 0);
});

test("visibleGifts hides drafts, keeps sold-out gifts and puts them last", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "todos", NOW).map((g) => g.id), ["a", "b", "e", "c", "d"]);
  assert.deepEqual(visibleGifts(gifts, "sala", "todos", NOW).map((g) => g.id), ["a", "b", "c"]);
});

test("price ranges include the lower bound and exclude the upper one", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "ate-150", NOW).map((g) => g.id), ["a"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "150-500", NOW).map((g) => g.id), ["b", "e"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "acima-500", NOW).map((g) => g.id), ["c", "d"]);
});

test("an expired hold counts as available again", () => {
  const held = gift("r", "sala", 10, "reserved", { reservedAt: NOW - (HOLD_HOURS - 1) * H });
  const expired = gift("r", "sala", 10, "reserved", { reservedAt: NOW - HOLD_HOURS * H });
  assert.equal(isSoldOut(held, NOW), true);
  assert.equal(isSoldOut(expired, NOW), false);
  assert.equal(isSoldOut(gift("b", "sala", 10, "bought"), NOW), true);
  assert.equal(isSoldOut(gift("a", "sala", 10), NOW), false);
});

test("roomProgress counts bought gifts, the couple's own included, and ignores drafts", () => {
  const list = [...gifts, gift("u", "cozinha", 50, "bought", { byCouple: true })];
  assert.deepEqual(roomProgress(list, "sala"), { chosen: 1, total: 3 });
  assert.deepEqual(roomProgress(list, "cozinha"), { chosen: 1, total: 3 });
  assert.deepEqual(roomProgress(list, "quarto"), { chosen: 0, total: 0 });
});

test("giverLabel names the giver and tier, or marks the couple's own purchase", () => {
  assert.equal(giverLabel(gift("a", "sala", 1, "bought", { giverName: "Maria", giverTier: "Prima" })), "Presente de Maria · Prima");
  assert.equal(giverLabel(gift("a", "sala", 1, "bought", { giverName: "Maria" })), "Presente de Maria");
  assert.equal(giverLabel(gift("a", "sala", 1, "bought", { byCouple: true })), "Dos noivos");
  assert.equal(giverLabel(gift("a", "sala", 1)), null);
});

test("progressLabel reads like the spec", () => {
  assert.equal(progressLabel({ chosen: 3, total: 8 }), "3 de 8 presentes escolhidos");
  assert.equal(progressLabel({ chosen: 0, total: 1 }), "0 de 1 presente escolhido");
});
