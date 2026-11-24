import { test } from "node:test";
import assert from "node:assert/strict";
import { activeIndex, visibleGifts, roomProgress, progressLabel } from "./catalog.ts";
import type { Gift } from "../data/gifts.ts";

const gift = (id: string, room: Gift["room"], price: number, status: Gift["status"] = "available"): Gift => ({
  id, room, price, status, name: id, store: "Amazon", url: "", photos: [], description: "", brand: "", model: "",
});

const gifts = [
  gift("a", "sala", 89),
  gift("b", "sala", 150),
  gift("c", "sala", 720, "confirmed"),
  gift("d", "cozinha", 1290, "reserved"),
  gift("e", "cozinha", 499),
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

test("visibleGifts hides confirmed gifts and keeps reserved ones", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "todos").map((g) => g.id), ["a", "b", "d", "e"]);
  assert.deepEqual(visibleGifts(gifts, "sala", "todos").map((g) => g.id), ["a", "b"]);
});

test("price ranges include the lower bound and exclude the upper one", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "ate-150").map((g) => g.id), ["a"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "150-500").map((g) => g.id), ["b", "e"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "acima-500").map((g) => g.id), ["d"]);
});

test("roomProgress counts only confirmed purchases as chosen", () => {
  assert.deepEqual(roomProgress(gifts, "sala"), { chosen: 1, total: 3 });
  assert.deepEqual(roomProgress(gifts, "cozinha"), { chosen: 0, total: 2 });
  assert.deepEqual(roomProgress(gifts, "quarto"), { chosen: 0, total: 0 });
});

test("progressLabel reads like the spec", () => {
  assert.equal(progressLabel({ chosen: 3, total: 8 }), "3 de 8 presentes escolhidos");
  assert.equal(progressLabel({ chosen: 0, total: 1 }), "0 de 1 presente escolhido");
});
