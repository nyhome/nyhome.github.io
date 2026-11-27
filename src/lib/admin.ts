// Admin-only reads and writes. firestore.rules lets admins (by UID) write anything, so nothing checks these but
// this file: every action re-reads the gift inside a transaction, so a panel loaded minutes ago can't double-count.
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from "firebase/auth";
import {
  Timestamp, addDoc, collection, deleteField, doc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where,
  writeBatch, type Transaction,
} from "firebase/firestore/lite";
import type { Delivery, Gift, GiftLink, Giver, RoomId, Voltage } from "@/data/gifts";
import { unitsLeft } from "./catalog";
import { EMULATOR, app, db, toGift, type Reservation } from "./firebase";

let authInstance: Auth | null = null;
function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(app());
    if (EMULATOR) connectAuthEmulator(authInstance, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return authInstance;
}

export const watchUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth(), cb);
export const signIn = () => signInWithPopup(auth(), new GoogleAuthProvider());
export const logOut = () => signOut(auth());

export interface AdminData {
  gifts: Gift[];
  /** Active reservations per gift id: still "reserved" and still holding units on the gift. */
  active: Record<string, Reservation[]>;
  /** Guests' confirmed purchases, newest first (the couple's own have no date and stay out). */
  purchases: Purchase[];
}

export interface Purchase {
  giftId: string;
  name: string;
  tier: string;
  units: number;
  /** Epoch ms of the confirmation. */
  at: number;
}

export async function fetchAll(): Promise<AdminData> {
  const [g, r] = await Promise.all([getDocs(collection(db(), "gifts")), getDocs(collection(db(), "reservations"))]);
  const gifts = g.docs.map((d) => toGift(d.id, d.data()));
  const byGift = new Map(gifts.map((x) => [x.id, x]));
  const active: Record<string, Reservation[]> = {};
  const purchases: Purchase[] = [];
  for (const d of r.docs) {
    const data = d.data();
    if (data.status === "bought")
      purchases.push({
        giftId: data.giftId, name: data.name, tier: data.tier, units: data.units ?? 1,
        at: ((data.closedAt ?? data.reservedAt) as Timestamp).toMillis(),
      });
    const res = { token: d.id, ...data, units: data.units ?? 1, reservedAt: (data.reservedAt as Timestamp).toMillis() } as Reservation;
    const gift = byGift.get(res.giftId);
    if (gift && res.status === "reserved" && res.holdId in gift.holds) (active[gift.id] ??= []).push(res);
  }
  purchases.sort((a, b) => b.at - a.at);
  return { gifts, active, purchases };
}

export interface GiftInput {
  room: RoomId;
  name: string;
  model: string;
  brand: string;
  description: string;
  dims: string;
  /** "" when it isn't electrical. */
  voltage: Voltage | "";
  price: number;
  lowestPrice: number;
  links: GiftLink[];
  photos: string[];
  quantity: number;
}

/** Thrown with a message the panel can show as is. */
export class AdminError extends Error {}

/** The current gift, read inside the transaction. */
async function current(tx: Transaction, id: string): Promise<Gift> {
  const snap = await tx.get(doc(db(), "gifts", id));
  if (!snap.exists()) throw new AdminError("Esse presente não existe mais.");
  return toGift(snap.id, snap.data());
}

/** A published gift is "bought" exactly when every unit is. */
const statusFor = (g: Gift, boughtUnits: number, quantity = g.quantity) =>
  g.status === "draft" ? "draft" : boughtUnits >= quantity ? "bought" : "available";

export async function saveGift(id: string | null, input: GiftInput) {
  // Firestore rejects undefined: drop the optional coupon when empty.
  const links = input.links.map(({ store, url, coupon }) => (coupon ? { store, url, coupon } : { store, url }));
  const data = { ...input, links, lowestPrice: Math.min(input.lowestPrice, input.price) };
  if (id)
    return runTransaction(db(), async (tx) => {
      const g = await current(tx, id);
      const taken = g.boughtUnits + g.heldUnits;
      // Units already held or bought can't disappear from under the guests who took them.
      if (input.quantity < taken) throw new AdminError(`Já tem ${taken} unidade(s) reservada(s) ou comprada(s); a quantidade não pode ser menor.`);
      tx.update(doc(db(), "gifts", id), { ...data, status: statusFor(g, g.boughtUnits, input.quantity) });
    });
  await addDoc(collection(db(), "gifts"), {
    ...data, status: "draft", boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], lastHold: "", createdAt: serverTimestamp(),
  });
}

/** Refused while guests hold units: their reservations would point at nothing and keep getting e-mails. */
export const deleteGift = (id: string) =>
  runTransaction(db(), async (tx) => {
    const g = await current(tx, id);
    if (g.heldUnits > 0) throw new AdminError("Tem convidado com reserva ativa nesse presente. Libere as reservas antes de excluir.");
    tx.delete(doc(db(), "gifts", id));
  });

export const publish = (id: string) => updateDoc(doc(db(), "gifts", id), { status: "available" });

/** Takes a published gift off the guests' catalog or puts it back; reservations and purchases stay as they are. */
export const setHidden = (id: string, hidden: boolean) => updateDoc(doc(db(), "gifts", id), { hidden });

/** Closes a guest's hold as a purchase (they forgot "Já comprei") or frees it, if it is still open. */
const closeHold = (res: Reservation, outcome: "bought" | "released") =>
  runTransaction(db(), async (tx) => {
    const r = await tx.get(doc(db(), "reservations", res.token));
    const g = await current(tx, res.giftId);
    const hold = g.holds[res.holdId];
    if (r.data()?.status !== "reserved" || !hold) throw new AdminError("Essa reserva já foi fechada (pelo convidado ou porque expirou).");
    const boughtUnits = g.boughtUnits + (outcome === "bought" ? hold.units : 0);
    tx.update(doc(db(), "gifts", g.id), {
      [`holds.${res.holdId}`]: deleteField(),
      heldUnits: g.heldUnits - hold.units,
      ...(outcome === "bought"
        ? {
            boughtUnits,
            givers: [...g.givers, { name: hold.giverName, tier: hold.giverTier, units: hold.units } satisfies Giver],
            status: statusFor(g, boughtUnits),
          }
        : {}),
    });
    tx.delete(doc(db(), "holdLocks", res.holdId));
    tx.update(doc(db(), "reservations", res.token), {
      status: outcome, closedAt: serverTimestamp(), ...(outcome === "bought" ? { adminNotified: true } : {}),
    });
  });

export const markBought = (_gift: Gift, res: Reservation) => closeHold(res, "bought");
export const releaseHold = (_gift: Gift, res: Reservation) => closeHold(res, "released");

/** The couple bought the units still open; guests' holds stay as they are. */
export const boughtByUs = (gift: Gift) =>
  runTransaction(db(), async (tx) => {
    const g = await current(tx, gift.id);
    const units = unitsLeft(g);
    if (!units) return;
    const boughtUnits = g.boughtUnits + units;
    tx.update(doc(db(), "gifts", g.id), {
      boughtUnits,
      givers: [...g.givers, { name: "", tier: "", units, byCouple: true } satisfies Giver],
      status: statusFor(g, boughtUnits),
    });
  });

/** Undoes every purchase recorded on the gift (marked by mistake); holds stay. The guests' confirmed reservations
 * go back to "released" so the dashboard history matches. */
export async function undoPurchases(gift: Gift) {
  const bought = await getDocs(query(collection(db(), "reservations"), where("giftId", "==", gift.id), where("status", "==", "bought")));
  const b = writeBatch(db());
  b.update(doc(db(), "gifts", gift.id), { boughtUnits: 0, givers: [], status: gift.status === "draft" ? "draft" : "available" });
  for (const d of bought.docs) b.update(d.ref, { status: "released" });
  await b.commit();
}

export async function setTier(gift: Gift, res: Reservation, tier: string) {
  const b = writeBatch(db());
  if (res.holdId in gift.holds) b.update(doc(db(), "gifts", gift.id), { [`holds.${res.holdId}.giverTier`]: tier });
  b.update(doc(db(), "reservations", res.token), { tier });
  await b.commit();
}

export const saveDelivery = (d: Delivery) => setDoc(doc(db(), "settings", "delivery"), d);
