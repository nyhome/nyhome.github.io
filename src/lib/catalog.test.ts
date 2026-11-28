import { test } from "node:test";
import assert from "node:assert/strict";
import { activeIndex, visibleGifts, roomProgress, progressLabel, isLocked, isSoldOut, giverLabel, unitsLabel, unitsLeft } from "./catalog.ts";
import type { Gift } from "../data/gifts.ts";

const NOW = Date.UTC(2026, 10, 24, 12);

const gift = (id: string, room: Gift["room"], price: number, extra: Partial<Gift> = {}): Gift => ({
  id, room, price, lowestPrice: price, status: "available", name: id, model: "", brand: "", description: "", links: [], photos: [],
  quantity: 1, boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], ...extra,
});
const bought = (extra: Partial<Gift> = {}): Partial<Gift> => ({ status: "bought", boughtUnits: 1, givers: [{ name: "Ana", tier: "Tia", units: 1 }], ...extra });
const held = (name = "Maria", tier = "Prima", units = 1): Partial<Gift> => ({
  heldUnits: units, holds: { h1: { units, reservedAt: NOW, giverName: name, giverTier: tier } },
});

const gifts = [
  gift("c", "sala", 720, bought()),
  gift("a", "sala", 89),
  gift("b", "sala", 150),
  gift("d", "cozinha", 1290, held()),
  gift("e", "cozinha", 499),
  gift("x", "cozinha", 300, { status: "draft" }),
  gift("h", "cozinha", 200, { hidden: true }),
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

test("visibleGifts hides drafts and hidden gifts, keeps sold-out gifts and puts them last", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "todos").map((g) => g.id), ["a", "b", "e", "c", "d"]);
  assert.deepEqual(visibleGifts(gifts, "sala", "todos").map((g) => g.id), ["a", "b", "c"]);
});

test("visibleGifts sorts by price either way, sold-out still last", () => {
  const shuffled = [gifts[4], gifts[2], gifts[0], gifts[1], gifts[3]];
  assert.deepEqual(visibleGifts(shuffled, "todos", "todos", "menor").map((g) => g.id), ["a", "b", "e", "c", "d"]);
  assert.deepEqual(visibleGifts(shuffled, "todos", "todos", "maior").map((g) => g.id), ["e", "b", "a", "d", "c"]);
});

test("price ranges include the lower bound and exclude the upper one", () => {
  assert.deepEqual(visibleGifts(gifts, "todos", "ate-150").map((g) => g.id), ["a"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "150-500").map((g) => g.id), ["b", "e"]);
  assert.deepEqual(visibleGifts(gifts, "todos", "acima-500").map((g) => g.id), ["c", "d"]);
});

test("a multi-unit gift stays open until every unit is bought or held", () => {
  const sheets = gift("s", "quarto", 754, { quantity: 3, boughtUnits: 1, givers: [{ name: "Ana", tier: "Tia", units: 1 }], ...held("Maria", "Prima", 1) });
  assert.equal(unitsLeft(sheets), 1);
  assert.equal(isSoldOut(sheets), false);
  assert.equal(isSoldOut({ ...sheets, heldUnits: 2 }), true);
  assert.equal(isSoldOut(gift("b", "sala", 10, bought())), true);
  assert.equal(isSoldOut(gift("a", "sala", 10)), false);
  assert.equal(unitsLeft({ ...sheets, heldUnits: 5 }), 0);
});

test("roomProgress counts units, the couple's own included, and ignores drafts", () => {
  const list = [...gifts, gift("u", "cozinha", 50, bought({ givers: [{ name: "", tier: "", units: 1, byCouple: true }] })),
    gift("s", "cozinha", 55, { quantity: 3, boughtUnits: 2, givers: [{ name: "Ana", tier: "Tia", units: 2 }] })];
  assert.deepEqual(roomProgress(list, "sala"), { chosen: 1, total: 3 });
  assert.deepEqual(roomProgress(list, "cozinha"), { chosen: 3, total: 6 });
  assert.deepEqual(roomProgress(list, "quarto"), { chosen: 0, total: 0 });
});

test("giverLabel names givers and holders, or marks the couple's own purchase", () => {
  assert.equal(giverLabel(gift("a", "sala", 1, bought({ givers: [{ name: "Maria", tier: "Prima", units: 1 }] }))), "Presente de Maria · Prima");
  assert.equal(giverLabel(gift("a", "sala", 1, held("Maria", "Prima"))), "Presente de Maria · Prima");
  assert.equal(giverLabel(gift("a", "sala", 1, bought({ givers: [{ name: "", tier: "", units: 1, byCouple: true }] }))), "Comprado pelos noivos");
  assert.equal(giverLabel(gift("a", "sala", 1)), null);
  const many = gift("s", "quarto", 1, { quantity: 3, givers: [{ name: "Ana", tier: "Tia", units: 1 }, { name: "João", tier: "Tio", units: 1 }], ...held("Bia", "Amiga") });
  assert.equal(giverLabel(many), "Presente de Ana, João e mais 1");
  const two = gift("s", "quarto", 1, { quantity: 2, givers: [{ name: "Ana", tier: "Tia", units: 1 }, { name: "", tier: "", units: 1, byCouple: true }] });
  assert.equal(giverLabel(two), "Presente de Ana · Tia e dos noivos");
});

test("unitsLabel shows units and what is left, only for multi-unit gifts", () => {
  assert.equal(unitsLabel(gift("a", "sala", 1)), null);
  assert.equal(unitsLabel(gift("s", "quarto", 1, { quantity: 3 })), "3 unidades");
  assert.equal(unitsLabel(gift("s", "quarto", 1, { quantity: 3, boughtUnits: 1 })), "3 unidades · faltam 2");
  assert.equal(unitsLabel(gift("s", "quarto", 1, { quantity: 3, boughtUnits: 3, status: "bought" })), "3 unidades");
});

test("progressLabel reads like the spec", () => {
  assert.equal(progressLabel({ chosen: 3, total: 8 }), "3 de 8 presentes escolhidos");
  assert.equal(progressLabel({ chosen: 0, total: 1 }), "0 de 1 presente escolhido");
});

test("locked gifts: not reservable while open, listed after open ones and before sold-out ones", () => {
  const fridge = gift("f", "cozinha", 10, { locked: true });
  assert.equal(isLocked(fridge), true);
  assert.equal(isLocked(gift("g", "cozinha", 10, { locked: true, ...bought() })), false);
  const order = visibleGifts([gift("s", "sala", 1, bought()), fridge, gift("o", "sala", 99)], "todos", "todos").map((g) => g.id);
  assert.deepEqual(order, ["o", "f", "s"]);
});

test("a partial couple purchase gets no badge while units are still open", () => {
  const cups = gift("c", "cozinha", 10, { quantity: 2, boughtUnits: 1, givers: [{ name: "", tier: "", units: 1, byCouple: true }] });
  assert.equal(giverLabel(cups), null);
  assert.equal(unitsLabel(cups), "2 unidades · faltam 1");
});
