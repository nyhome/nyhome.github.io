import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Timestamp, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, where,
  writeBatch, type DocumentData, type Firestore,
} from "firebase/firestore/lite";
import type { Delivery, Gift } from "@/data/gifts";

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
  return {
    id,
    room: d.room,
    name: d.name ?? "",
    model: d.model ?? "",
    brand: d.brand ?? "",
    description: d.description ?? "",
    dims: d.dims || undefined,
    variants: d.variants?.length ? d.variants : undefined,
    price: d.price ?? 0,
    links: d.links ?? [],
    photos: d.photos ?? [],
    status: d.status,
    reservedAt: ms(d.reservedAt),
    giverName: d.giverName ?? null,
    giverTier: d.giverTier ?? null,
    byCouple: d.byCouple ?? false,
  };
}

/** Published gifts. The filter must match the read rule exactly, or the query is refused. */
export async function fetchGifts(): Promise<Gift[]> {
  const snap = await getDocs(query(collection(db(), "gifts"), where("status", "in", ["available", "reserved", "bought"])));
  return snap.docs.map((d) => toGift(d.id, d.data()));
}

export async function fetchDelivery(): Promise<Delivery | null> {
  const snap = await getDoc(doc(db(), "settings", "delivery"));
  return snap.exists() ? (snap.data() as Delivery) : null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0].slice(0, 30);

/** The reserve batch checked by firestore.rules. Returns the token that goes in the guest's personal link. */
export async function reserveGift(giftId: string, guest: { name: string; email: string; tier: string }): Promise<string> {
  const token = crypto.randomUUID();
  const b = writeBatch(db());
  b.set(doc(db(), "reservations", token), {
    giftId,
    name: guest.name.trim(),
    email: guest.email.trim(),
    tier: guest.tier,
    status: "reserved",
    reservedAt: serverTimestamp(),
    adminNotified: false,
  });
  b.set(doc(db(), "giftLocks", giftId), { token });
  b.update(doc(db(), "gifts", giftId), {
    status: "reserved",
    reservedAt: serverTimestamp(),
    giverName: firstName(guest.name),
    giverTier: guest.tier,
  });
  await b.commit();
  return token;
}

export interface Reservation {
  token: string;
  giftId: string;
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
  const reservation: Reservation = { token, ...(d as Omit<Reservation, "token" | "reservedAt">), reservedAt: ms(d.reservedAt) ?? 0 };
  const g = await getDoc(doc(db(), "gifts", reservation.giftId)).catch(() => null);
  return { reservation, gift: g?.exists() ? toGift(g.id, g.data()) : null };
}

/** Whether this reservation still holds its gift (nobody re-reserved it after an expired hold). */
export const holdsGift = (r: Reservation, g: Gift | null) =>
  g !== null && g.status === "reserved" && g.reservedAt === r.reservedAt;

/** Confirm ("Já comprei") or give up ("Desistir"). */
export async function closeReservation(token: string, giftId: string, outcome: "bought" | "released") {
  const b = writeBatch(db());
  b.update(doc(db(), "reservations", token), { status: outcome, closedAt: serverTimestamp() });
  b.update(
    doc(db(), "gifts", giftId),
    outcome === "bought" ? { status: "bought" } : { status: "available", reservedAt: null, giverName: null, giverTier: null },
  );
  await b.commit();
}
