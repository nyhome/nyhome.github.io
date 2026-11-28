import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Timestamp, collection, connectFirestoreEmulator, deleteField, doc, getDoc, getDocs, getFirestore, increment, query,
  runTransaction, serverTimestamp, where, writeBatch, type DocumentData, type Firestore,
} from "firebase/firestore/lite";
import type { Delivery, Gift, Giver, Goal, Hold } from "@/data/gifts";

// UI only: the real gate is isAdmin() in firestore.rules.
export const ADMIN_UIDS = ["lEYtbTBbpfXaUdzz7sQq05Qz1c32", "mVGO28Yprqcc7z60fCev1GdDlTo1"];

const EMULATOR = process.env.NEXT_PUBLIC_EMULATOR === "1";

export function app() {
  if (getApps().length) return getApp();
  // The web config is public by design; access is decided by the security rules.
  const config = EMULATOR
    ? { projectId: "demo-casa-ny", apiKey: "demo-key", authDomain: "localhost" }
    : JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG ?? "{}");
  return initializeApp(config);
}

let firestore: Firestore | null = null;
export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(app());
    if (EMULATOR) connectFirestoreEmulator(firestore, "127.0.0.1", 8177);
  }
  return firestore;
}

export { EMULATOR };

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : null);

export function toGift(id: string, d: DocumentData): Gift {
  const holds: Record<string, Hold> = {};
  for (const [hid, h] of Object.entries((d.holds ?? {}) as Record<string, DocumentData>))
    holds[hid] = { units: h.units ?? 1, reservedAt: ms(h.reservedAt) ?? 0, giverName: h.giverName ?? "", giverTier: h.giverTier ?? "" };
  const quantity = d.quantity ?? 1;
  return {
    id,
    room: d.room,
    name: d.name ?? "",
    model: d.model ?? "",
    brand: d.brand ?? "",
    description: d.description ?? "",
    dims: d.dims || undefined,
    voltage: d.voltage || undefined,
    variants: d.variants?.length ? d.variants : undefined,
    price: d.price ?? 0,
    // Gifts saved before the field existed start at their current price.
    lowestPrice: Math.min(d.lowestPrice ?? Infinity, d.price ?? 0),
    links: d.links ?? [],
    photos: d.photos ?? [],
    status: d.status,
    hidden: d.hidden === true,
    locked: d.locked === true,
    quantity,
    boughtUnits: d.boughtUnits ?? (d.status === "bought" ? quantity : 0),
    heldUnits: d.heldUnits ?? 0,
    holds,
    givers: (d.givers ?? []) as Giver[],
  };
}

/** Published gifts. The filter must match the read rule exactly, or the query is refused. */
export async function fetchGifts(): Promise<Gift[]> {
  const snap = await getDocs(query(collection(db(), "gifts"), where("status", "in", ["available", "bought"])));
  return snap.docs.map((d) => toGift(d.id, d.data()));
}

export async function fetchDelivery(): Promise<Delivery | null> {
  const snap = await getDoc(doc(db(), "settings", "delivery"));
  return snap.exists() ? (snap.data() as Delivery) : null;
}

export async function fetchGoal(): Promise<Goal | null> {
  const snap = await getDoc(doc(db(), "settings", "goal"));
  return snap.exists() ? (snap.data() as Goal) : null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0].slice(0, 30);

/** The reserve batch checked by firestore.rules. Returns the token that goes in the guest's personal link. */
export async function reserveGift(giftId: string, guest: { name: string; email: string; tier: string; units: number }): Promise<string> {
  const token = crypto.randomUUID();
  // A second random id: this one is public (it keys the hold on the gift), the token stays secret.
  const holdId = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const b = writeBatch(db());
  b.set(doc(db(), "reservations", token), {
    giftId,
    holdId,
    units: guest.units,
    name: guest.name.trim(),
    email: guest.email.trim(),
    tier: guest.tier,
    status: "reserved",
    reservedAt: serverTimestamp(),
    adminNotified: false,
  });
  b.set(doc(db(), "holdLocks", holdId), { token, giftId });
  b.update(doc(db(), "gifts", giftId), {
    [`holds.${holdId}`]: { units: guest.units, reservedAt: serverTimestamp(), giverName: firstName(guest.name), giverTier: guest.tier },
    heldUnits: increment(guest.units),
    lastHold: holdId,
  });
  await b.commit();
  return token;
}

export interface Reservation {
  token: string;
  giftId: string;
  holdId: string;
  units: number;
  name: string;
  email: string;
  tier: string;
  status: "reserved" | "bought" | "released" | "expired";
  reservedAt: number;
}

export async function fetchReservation(token: string): Promise<{ reservation: Reservation; gift: Gift | null } | null> {
  const snap = await getDoc(doc(db(), "reservations", token));
  if (!snap.exists()) return null;
  const d = snap.data();
  const reservation: Reservation = { token, ...(d as Omit<Reservation, "token" | "reservedAt">), units: d.units ?? 1, reservedAt: ms(d.reservedAt) ?? 0 };
  const g = await getDoc(doc(db(), "gifts", reservation.giftId));
  return { reservation, gift: g.exists() ? toGift(g.id, g.data()) : null };
}

/** Whether this reservation still holds its units (the mailer hasn't expired it). */
export const holdsGift = (r: Reservation, g: Gift | null) => g !== null && r.holdId in g.holds;

/** Confirm ("Já comprei") or give up ("Desistir"). A transaction: the rules check the new givers list exactly, so
 * another guest confirming the same gift a moment earlier must not leave this write based on an old list. */
export const closeReservation = (r: Reservation, outcome: "bought" | "released") =>
  runTransaction(db(), async (b) => {
    const snap = await b.get(doc(db(), "gifts", r.giftId));
    if (!snap.exists()) throw new Error("presente não existe mais");
    const g = toGift(snap.id, snap.data());
    const hold = g.holds[r.holdId];
    if (!hold) throw new Error("reserva expirada");
    b.update(doc(db(), "reservations", r.token), { status: outcome, closedAt: serverTimestamp() });
    const common = { [`holds.${r.holdId}`]: deleteField(), heldUnits: increment(-hold.units), lastHold: r.holdId };
    const giver: Giver = { name: hold.giverName, tier: hold.giverTier, units: hold.units };
    b.update(
      doc(db(), "gifts", r.giftId),
      outcome === "bought"
        ? {
            ...common,
            boughtUnits: increment(hold.units),
            givers: [...(snap.data().givers ?? []), giver],
            ...(g.boughtUnits + hold.units >= g.quantity ? { status: "bought" } : {}),
          }
        : common,
    );
  });
