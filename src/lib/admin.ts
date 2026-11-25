// Admin-only reads and writes. firestore.rules lets admins (by UID) write anything, so these are plain batches.
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from "firebase/auth";
import {
  Timestamp, addDoc, collection, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore/lite";
import type { Delivery, Gift, GiftLink, RoomId, Voltage } from "@/data/gifts";
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
  /** The reservation behind each reserved/bought gift, matched by the shared reservedAt. */
  current: Record<string, Reservation>;
}

export async function fetchAll(): Promise<AdminData> {
  const [g, r] = await Promise.all([getDocs(collection(db(), "gifts")), getDocs(collection(db(), "reservations"))]);
  const gifts = g.docs.map((d) => toGift(d.id, d.data()));
  const byGift = new Map(gifts.map((x) => [x.id, x]));
  const current: Record<string, Reservation> = {};
  for (const d of r.docs) {
    const data = d.data();
    const res = { token: d.id, ...data, reservedAt: (data.reservedAt as Timestamp).toMillis() } as Reservation;
    const gift = byGift.get(res.giftId);
    if (gift && gift.reservedAt === res.reservedAt && res.status !== "released" && res.status !== "expired") current[gift.id] = res;
  }
  return { gifts, current };
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
}

export async function saveGift(id: string | null, input: GiftInput) {
  // Firestore rejects undefined: drop the optional coupon when empty.
  const links = input.links.map(({ store, url, coupon }) => (coupon ? { store, url, coupon } : { store, url }));
  const data = { ...input, links };
  if (id) return updateDoc(doc(db(), "gifts", id), data);
  await addDoc(collection(db(), "gifts"), {
    ...data, status: "draft", reservedAt: null, giverName: null, giverTier: null, byCouple: false, createdAt: serverTimestamp(),
  });
}

export async function deleteGift(id: string) {
  const b = writeBatch(db());
  b.delete(doc(db(), "gifts", id));
  b.delete(doc(db(), "giftLocks", id));
  await b.commit();
}

export const publish = (id: string) => updateDoc(doc(db(), "gifts", id), { status: "available" });

/** A guest's reservation becomes a purchase (the guest forgot to click "Já comprei"). */
export async function markBought(gift: Gift, res?: Reservation) {
  const b = writeBatch(db());
  b.update(doc(db(), "gifts", gift.id), { status: "bought" });
  if (res) b.update(doc(db(), "reservations", res.token), { status: "bought", adminNotified: true, closedAt: serverTimestamp() });
  await b.commit();
}

/** The couple bought it themselves; any guest hold on it is dropped. */
export async function boughtByUs(gift: Gift, res?: Reservation) {
  const b = writeBatch(db());
  b.update(doc(db(), "gifts", gift.id), { status: "bought", byCouple: true, giverName: null, giverTier: null });
  if (res) b.update(doc(db(), "reservations", res.token), { status: "released", closedAt: serverTimestamp() });
  b.delete(doc(db(), "giftLocks", gift.id));
  await b.commit();
}

/** Back to available: drops a reservation, or undoes a purchase marked by mistake. */
export async function release(gift: Gift, res?: Reservation) {
  const b = writeBatch(db());
  b.update(doc(db(), "gifts", gift.id), { status: "available", reservedAt: null, giverName: null, giverTier: null, byCouple: false });
  if (res) b.update(doc(db(), "reservations", res.token), { status: "released", closedAt: serverTimestamp() });
  b.delete(doc(db(), "giftLocks", gift.id));
  await b.commit();
}

export async function setTier(gift: Gift, res: Reservation | undefined, tier: string) {
  const b = writeBatch(db());
  b.update(doc(db(), "gifts", gift.id), { giverTier: tier });
  if (res) b.update(doc(db(), "reservations", res.token), { tier });
  await b.commit();
}

export const saveDelivery = (d: Delivery) => setDoc(doc(db(), "settings", "delivery"), d);
