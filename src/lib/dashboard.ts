// Numbers for the admin "Visão geral" tab. Pure, so node --test runs it directly (no aliases).
import type { Gift, RoomId } from "../data/gifts.ts";

export interface PurchaseLike {
  giftId: string;
  name: string;
  tier: string;
  units: number;
  at: number;
}

const DAY = 864e5;

/** Values are in reais and count units: 3 sheet sets at R$ 754 are R$ 2.262 of the list. Drafts stay out. */
export function summarize(allGifts: Gift[], purchases: PurchaseLike[], now: number, days = 30) {
  const gifts = allGifts.filter((g) => g.status !== "draft");
  const byId = new Map(gifts.map((g) => [g.id, g]));
  const val = (g: Gift, units: number) => g.price * units;

  const total = gifts.reduce((s, g) => s + val(g, g.quantity), 0);
  const bought = gifts.reduce((s, g) => s + val(g, g.boughtUnits), 0);
  const reserved = gifts.reduce((s, g) => s + val(g, g.heldUnits), 0);
  const units = {
    total: gifts.reduce((s, g) => s + g.quantity, 0),
    bought: gifts.reduce((s, g) => s + g.boughtUnits, 0),
    held: gifts.reduce((s, g) => s + g.heldUnits, 0),
  };

  const rooms = new Map<RoomId, { id: RoomId; total: number; bought: number; reserved: number }>();
  for (const g of gifts) {
    const r = rooms.get(g.room) ?? { id: g.room, total: 0, bought: 0, reserved: 0 };
    r.total += val(g, g.quantity);
    r.bought += val(g, g.boughtUnits);
    r.reserved += val(g, g.heldUnits);
    rooms.set(g.room, r);
  }

  const tiers = new Map<string, number>();
  let couple = 0;
  for (const g of gifts)
    for (const x of g.givers) {
      if (x.byCouple) couple += val(g, x.units);
      else tiers.set(x.tier || "Sem parentesco", (tiers.get(x.tier || "Sem parentesco") ?? 0) + val(g, x.units));
    }

  // Cumulative guest purchases per day over the last `days` days (the couple's own purchases carry no date).
  const start = Math.floor(now / DAY) * DAY - (days - 1) * DAY;
  const daily = Array<number>(days).fill(0);
  let before = 0;
  for (const p of purchases) {
    const g = byId.get(p.giftId);
    if (!g) continue;
    const i = Math.floor((p.at - start) / DAY);
    if (i < 0) before += val(g, p.units);
    else if (i < days) daily[i] += val(g, p.units);
  }
  const timeline = daily.reduce<number[]>((acc, v, i) => (acc.push((acc[i - 1] ?? before) + v), acc), []);

  const latest = purchases
    .filter((p) => byId.has(p.giftId))
    .slice(0, 8)
    .map((p) => {
      const g = byId.get(p.giftId)!;
      return { ...p, gift: g.name, room: g.room, value: val(g, p.units) };
    });

  return {
    total, bought, reserved, left: Math.max(0, total - bought - reserved), units, gifts: gifts.length,
    rooms: [...rooms.values()].sort((a, b) => b.total - a.total),
    tiers: [...tiers.entries()].map(([tier, value]) => ({ tier, value })).sort((a, b) => b.value - a.value),
    couple, timeline, daily, start, latest,
  };
}
