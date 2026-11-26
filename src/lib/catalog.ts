// Pure catalog rules shared by the rooms and catalog sections. No React, no aliases: node --test runs this file directly.
import type { Gift, RoomId } from "../data/gifts.ts";

export const PRICE_RANGES = [
  { id: "todos", label: "Qualquer preço", min: 0, max: Infinity },
  { id: "ate-150", label: "Até R$ 150", min: 0, max: 150 },
  { id: "150-500", label: "R$ 150 a R$ 500", min: 150, max: 500 },
  { id: "acima-500", label: "Acima de R$ 500", min: 500, max: Infinity },
] as const;

export type PriceRangeId = (typeof PRICE_RANGES)[number]["id"];

export const SORTS = [
  { id: "menor", label: "Menor preço" },
  { id: "maior", label: "Maior preço" },
] as const;

export type SortId = (typeof SORTS)[number]["id"];

/** Which of `n` equal slices of a 0..1 scroll progress is active. */
export function activeIndex(progress: number, n: number): number {
  if (n <= 0) return 0;
  const p = Math.min(Math.max(progress, 0), 1);
  return Math.min(n - 1, Math.floor(p * n));
}

// Same 72h as hold() in firestore.rules and HOLD_MS in scripts/mailer.mjs.
export const HOLD_HOURS = 72;
const HOLD_MS = HOLD_HOURS * 3600_000;

export const holdEndsAt = (reservedAt: number) => reservedAt + HOLD_MS;

/** Units still open to a new reservation. Holds past 72h keep counting until the mailer clears them (≤15 min). */
export const unitsLeft = (g: Gift) => Math.max(0, g.quantity - g.boughtUnits - g.heldUnits);

/** On the guests' catalog: published and not hidden. */
// shortcut: hidden gifts are filtered here, not in firestore.rules, so they stay readable by id (guests holding one still
// see their reservation); move it into the rules if hiding ever has to keep the data secret.
export const isListed = (g: Gift) => g.status !== "draft" && !g.hidden;

export const isSoldOut = (g: Gift) => g.status === "bought" || unitsLeft(g) === 0;

/** Gifts a guest can see, by price, sold-out ones last within each room. Ranges include the lower bound only. */
export function visibleGifts(gifts: Gift[], room: RoomId | "todos", price: PriceRangeId, sort: SortId = "menor"): Gift[] {
  const range = PRICE_RANGES.find((r) => r.id === price) ?? PRICE_RANGES[0];
  return gifts
    .filter(
      (g) =>
        isListed(g) &&
        (room === "todos" || g.room === room) &&
        g.price >= range.min &&
        (range.max === Infinity ? true : g.price < range.max),
    )
    .sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b)) || (sort === "menor" ? a.price - b.price : b.price - a.price));
}

/** "3 de 8 presentes escolhidos", counted in units: 3 sheet sets are 3 gifts. The couple's own count too. */
export function roomProgress(gifts: Gift[], room: RoomId): { chosen: number; total: number } {
  const inRoom = gifts.filter((g) => g.room === room && isListed(g));
  return { chosen: inRoom.reduce((n, g) => n + g.boughtUnits, 0), total: inRoom.reduce((n, g) => n + g.quantity, 0) };
}

/** Who is giving it, bought or on hold: "Presente de Maria · Prima", "Presente de Maria e João", "Dos noivos". */
export function giverLabel(g: Gift): string | null {
  const people = [
    ...g.givers.filter((x) => !x.byCouple).map((x) => ({ name: x.name, tier: x.tier })),
    ...Object.values(g.holds).map((h) => ({ name: h.giverName, tier: h.giverTier })),
  ];
  const couple = g.givers.some((x) => x.byCouple);
  if (!people.length) return couple ? "Dos noivos" : null;
  const names = [...new Set(people.map((p) => p.name))];
  const who =
    names.length === 1
      ? `${names[0]}${people.length === 1 && people[0].tier ? ` · ${people[0].tier}` : ""}`
      : names.length === 2
        ? `${names[0]} e ${names[1]}`
        : `${names[0]}, ${names[1]} e mais ${names.length - 2}`;
  return `Presente de ${who}${couple ? " e dos noivos" : ""}`;
}

/** "3 unidades · faltam 2"; null for single gifts. */
export function unitsLabel(g: Gift): string | null {
  if (g.quantity <= 1) return null;
  const left = unitsLeft(g);
  return `${g.quantity} unidades${left && left < g.quantity ? ` · faltam ${left}` : ""}`;
}

export function progressLabel({ chosen, total }: { chosen: number; total: number }): string {
  return `${chosen} de ${total} ${total === 1 ? "presente escolhido" : "presentes escolhidos"}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const formatBRL = (value: number) => brl.format(value);

export function photoUrl(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;
}
