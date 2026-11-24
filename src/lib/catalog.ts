// Pure catalog rules shared by the rooms and catalog sections. No React, no aliases: node --test runs this file directly.
import type { Gift, RoomId } from "../data/gifts.ts";

export const PRICE_RANGES = [
  { id: "todos", label: "Qualquer preço", min: 0, max: Infinity },
  { id: "ate-150", label: "Até R$ 150", min: 0, max: 150 },
  { id: "150-500", label: "R$ 150 a R$ 500", min: 150, max: 500 },
  { id: "acima-500", label: "Acima de R$ 500", min: 500, max: Infinity },
] as const;

export type PriceRangeId = (typeof PRICE_RANGES)[number]["id"];

/** Which of `n` equal slices of a 0..1 scroll progress is active. */
export function activeIndex(progress: number, n: number): number {
  if (n <= 0) return 0;
  const p = Math.min(Math.max(progress, 0), 1);
  return Math.min(n - 1, Math.floor(p * n));
}

/** Gifts a guest can see: confirmed purchases leave the catalog. Ranges include the lower bound only. */
export function visibleGifts(gifts: Gift[], room: RoomId | "todos", price: PriceRangeId): Gift[] {
  const range = PRICE_RANGES.find((r) => r.id === price) ?? PRICE_RANGES[0];
  return gifts.filter(
    (g) =>
      g.status !== "confirmed" &&
      (room === "todos" || g.room === room) &&
      g.price >= range.min &&
      (range.max === Infinity ? true : g.price < range.max),
  );
}

/** "3 de 8 presentes escolhidos": the numerator counts confirmed purchases only. */
export function roomProgress(gifts: Gift[], room: RoomId): { chosen: number; total: number } {
  const inRoom = gifts.filter((g) => g.room === room);
  return { chosen: inRoom.filter((g) => g.status === "confirmed").length, total: inRoom.length };
}

export function progressLabel({ chosen, total }: { chosen: number; total: number }): string {
  return `${chosen} de ${total} ${total === 1 ? "presente escolhido" : "presentes escolhidos"}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const formatBRL = (value: number) => brl.format(value);

export function photoUrl(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;
}
