// Admin-only reads and writes. firestore.rules lets admins (by UID) write anything, so these are plain batches.
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from "firebase/auth";
import {
  Timestamp, addDoc, collection, deleteField, doc, getDocs, increment, serverTimestamp, setDoc, updateDoc, writeBatch,
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
  links: GiftLink[];
  photos: string[];
  quantity: number;
}

export async function saveGift(id: string | null, input: GiftInput) {
  // Firestore rejects undefined: drop the optional coupon when empty.
  const links = input.links.map(({ store, url, coupon }) => (coupon ? { store, url, coupon } : { store, url }));
  const data = { ...input, links };
  if (id) return updateDoc(doc(db(), "gifts", id), data);
  await addDoc(collection(db(), "gifts"), {
    ...data, status: "draft", boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], lastHold: "", createdAt: serverTimestamp(),
  });
}

export async function deleteGift(id: string) {
  await writeBatch(db()).delete(doc(db(), "gifts", id)).commit();
}

export const publish = (id: string) => updateDoc(doc(db(), "gifts", id), { status: "available" });

/** Drops a hold from the gift, in the same batch as the reservation update. */
function dropHold(b: ReturnType<typeof writeBatch>, gift: Gift, res: Reservation) {
  b.update(doc(db(), "gifts", gift.id), { [`holds.${res.holdId}`]: deleteField(), heldUnits: increment(-(gift.holds[res.holdId]?.units ?? res.units)) });
  b.delete(doc(db(), "holdLocks", res.holdId));
}

/** A guest's reservation becomes a purchase (the guest forgot to click "Já comprei"). */
export async function markBought(gift: Gift, res: Reservation) {
  const hold = gift.holds[res.holdId];
  const units = hold?.units ?? res.units;
  const giver: Giver = { name: hold?.giverName ?? res.name.split(" ")[0], tier: hold?.giverTier ?? res.tier, units };
  const b = writeBatch(db());
  dropHold(b, gift, res);
  b.update(doc(db(), "gifts", gift.id), {
    boughtUnits: increment(units),
    givers: [...gift.givers, giver],
    ...(gift.boughtUnits + units >= gift.quantity ? { status: "bought" } : {}),
  });
  b.update(doc(db(), "reservations", res.token), { status: "bought", adminNotified: true, closedAt: serverTimestamp() });
  await b.commit();
}

/** Frees a guest's units (they gave up, or the hold should go). */
export async function releaseHold(gift: Gift, res: Reservation) {
  const b = writeBatch(db());
  dropHold(b, gift, res);
  b.update(doc(db(), "reservations", res.token), { status: "released", closedAt: serverTimestamp() });
  await b.commit();
}

/** The couple bought the units still open; guests' holds stay as they are. */
export async function boughtByUs(gift: Gift) {
  const units = unitsLeft(gift);
  if (!units) return;
  await updateDoc(doc(db(), "gifts", gift.id), {
    boughtUnits: increment(units),
    givers: [...gift.givers, { name: "", tier: "", units, byCouple: true } satisfies Giver],
    ...(gift.boughtUnits + units >= gift.quantity ? { status: "bought" } : {}),
  });
}

/** Undoes every purchase recorded on the gift (marked by mistake); holds stay. */
export const undoPurchases = (gift: Gift) =>
  updateDoc(doc(db(), "gifts", gift.id), { boughtUnits: 0, givers: [], status: "available" });

export async function setTier(gift: Gift, res: Reservation, tier: string) {
  const b = writeBatch(db());
  if (res.holdId in gift.holds) b.update(doc(db(), "gifts", gift.id), { [`holds.${res.holdId}.giverTier`]: tier });
  b.update(doc(db(), "reservations", res.token), { tier });
  await b.commit();
}

export const saveDelivery = (d: Delivery) => setDoc(doc(db(), "settings", "delivery"), d);
