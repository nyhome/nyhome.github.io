// Security rules against the Firestore emulator. Run with: npm run test:rules
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

const H = 3600_000;
// Whatever UIDs the real rules list, the tests swap in a known one.
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  .replace(/request\.auth\.uid in \[[^\]]*\]/, "request.auth.uid in ['admin']");

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-casa-ny", firestore: { rules } });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const guest = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext("admin").firestore();

const giftData = (extra = {}) => ({
  room: "sala", name: "Luminária", model: "X-100", brand: "B", description: "", price: 100, links: [], photos: [],
  status: "available", reservedAt: null, giverName: null, giverTier: null, byCouple: false, createdAt: Timestamp.now(), ...extra,
});

async function seed(path, data) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
}

/** The reserve batch exactly as src/lib/firebase.ts sends it; `tweak` breaks one part per test. */
function reserve(db, giftId, token = randomUUID(), tweak = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "reservations", token), {
    giftId, name: "Maria Silva", email: "maria@example.com", tier: "Prima", status: "reserved",
    reservedAt: serverTimestamp(), adminNotified: false, ...tweak.res,
  });
  if (!tweak.skipLock) b.set(doc(db, "giftLocks", giftId), { token, ...tweak.lock });
  if (!tweak.skipGift)
    b.update(doc(db, "gifts", giftId), {
      status: "reserved", reservedAt: serverTimestamp(), giverName: "Maria", giverTier: "Prima", ...tweak.gift,
    });
  if (tweak.skipRes) return writeBatch(db).set(doc(db, "giftLocks", giftId), { token }).commit();
  return b.commit();
}

function close(db, giftId, token, outcome, giftExtra = {}) {
  const b = writeBatch(db);
  b.update(doc(db, "reservations", token), { status: outcome, closedAt: serverTimestamp() });
  b.update(
    doc(db, "gifts", giftId),
    outcome === "bought"
      ? { status: "bought", ...giftExtra }
      : { status: "available", reservedAt: null, giverName: null, giverTier: null, ...giftExtra },
  );
  return b.commit();
}

/** A gift already reserved by `token`, `ageH` hours ago. */
async function reservedGift(giftId, token, ageH = 1) {
  const at = Timestamp.fromMillis(Date.now() - ageH * H);
  await seed(`gifts/${giftId}`, giftData({ status: "reserved", reservedAt: at, giverName: "Ana", giverTier: "Tia" }));
  await seed(`giftLocks/${giftId}`, { token });
  await seed(`reservations/${token}`, {
    giftId, name: "Ana Souza", email: "ana@example.com", tier: "Tia", status: "reserved", reservedAt: at, adminNotified: false,
  });
}

// 1
test("guests read published gifts but not drafts; the catalog query must filter by status", async () => {
  await seed("gifts/a", giftData());
  await seed("gifts/r", giftData({ status: "reserved", reservedAt: Timestamp.now() }));
  await seed("gifts/b", giftData({ status: "bought" }));
  await seed("gifts/d", giftData({ status: "draft" }));
  for (const id of ["a", "r", "b"]) await assertSucceeds(getDoc(doc(guest(), "gifts", id)));
  await assertFails(getDoc(doc(guest(), "gifts", "d")));
  await assertSucceeds(getDocs(query(collection(guest(), "gifts"), where("status", "in", ["available", "reserved", "bought"]))));
  await assertFails(getDocs(collection(guest(), "gifts")));
});

// 2
test("guests can't create, delete or edit catalog fields", async () => {
  await seed("gifts/a", giftData());
  await assertFails(setDoc(doc(guest(), "gifts", "new"), giftData()));
  await assertFails(deleteDoc(doc(guest(), "gifts", "a")));
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { price: 1 }));
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { name: "x" }));
});

// 3
test("a valid reserve batch succeeds", async () => {
  await seed("gifts/a", giftData());
  await assertSucceeds(reserve(guest(), "a"));
});

// 4
test("reserve batches with bad data fail", async () => {
  await seed("gifts/a", giftData());
  const bad = [
    { gift: { reservedAt: Timestamp.fromMillis(Date.now() + 999 * H) } },
    { res: { reservedAt: Timestamp.fromMillis(Date.now() + 999 * H) } },
    { gift: { price: 1 } },
    { gift: { byCouple: true } },
    { res: { tier: "Chefe" }, gift: { giverTier: "Chefe" } },
    { gift: { giverTier: "Tio" } },
    { res: { email: "não-é-email" } },
    { res: { name: "x".repeat(61) } },
    { gift: { giverName: "" } },
    { res: { extra: 1 } },
    { res: { adminNotified: true } },
    { res: { status: "bought" } },
  ];
  for (const tweak of bad) await assertFails(reserve(guest(), "a", randomUUID(), tweak));
  await assertFails(reserve(guest(), "a", "not-a-uuid"));
});

// 5
test("a held gift can't be reserved; an expired hold can", async () => {
  await reservedGift("a", randomUUID(), 1);
  await assertFails(reserve(guest(), "a"));
  await reservedGift("b", randomUUID(), 73);
  await assertSucceeds(reserve(guest(), "b"));
});

// 6
test("drafts and bought gifts can't be reserved", async () => {
  await seed("gifts/d", giftData({ status: "draft" }));
  await seed("gifts/b", giftData({ status: "bought" }));
  await assertFails(reserve(guest(), "d"));
  await assertFails(reserve(guest(), "b"));
});

// 7
test("partial reserve batches fail", async () => {
  await seed("gifts/a", giftData());
  await assertFails(reserve(guest(), "a", randomUUID(), { skipLock: true }));
  await assertFails(reserve(guest(), "a", randomUUID(), { skipGift: true }));
  await assertFails(reserve(guest(), "a", randomUUID(), { skipRes: true }));
});

// 8
test("an existing (released) token can't be reused for a new reservation", async () => {
  const token = randomUUID();
  await seed("gifts/a", giftData());
  await seed(`reservations/${token}`, {
    giftId: "a", name: "Ana", email: "ana@example.com", tier: "Tia", status: "released", reservedAt: Timestamp.now(), adminNotified: false,
  });
  await assertFails(reserve(guest(), "a", token));
});

// 9
test("the holder confirms with the right token, even after the 72h", async () => {
  const t1 = randomUUID();
  await reservedGift("a", t1, 1);
  await assertSucceeds(close(guest(), "a", t1, "bought"));
  const t2 = randomUUID();
  await reservedGift("b", t2, 80);
  await assertSucceeds(close(guest(), "b", t2, "bought"));
});

// 10
test("a token can't close a gift it doesn't hold", async () => {
  const mine = randomUUID();
  const theirs = randomUUID();
  await reservedGift("mine", mine);
  await reservedGift("theirs", theirs);
  await assertFails(close(guest(), "theirs", mine, "bought"));
  // Swapping the lock in the same batch doesn't help: the rule reads the lock as it was before.
  const db = guest();
  const b = writeBatch(db);
  b.set(doc(db, "giftLocks", "theirs"), { token: mine });
  b.update(doc(db, "reservations", mine), { status: "bought", closedAt: serverTimestamp() });
  b.update(doc(db, "gifts", "theirs"), { status: "bought" });
  await assertFails(b.commit());
});

// 11
test("closing only one side fails", async () => {
  const t = randomUUID();
  await reservedGift("a", t);
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { status: "bought" }));
  await assertFails(updateDoc(doc(guest(), "reservations", t), { status: "bought", closedAt: serverTimestamp() }));
});

// 12
test("giving up clears the giver; leaving it behind fails", async () => {
  const t = randomUUID();
  await reservedGift("a", t);
  await assertFails(close(guest(), "a", t, "released", { giverName: "Ana" }));
  await assertSucceeds(close(guest(), "a", t, "released"));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), "gifts", "a"));
    if (snap.data().giverName !== null || snap.data().status !== "available") throw new Error("not cleared");
  });
});

// 13
test("the old holder can't act after someone re-reserved an expired hold", async () => {
  const old = randomUUID();
  await reservedGift("a", old, 73);
  await assertSucceeds(reserve(guest(), "a"));
  await assertFails(close(guest(), "a", old, "bought"));
  await assertFails(close(guest(), "a", old, "released"));
});

// 14
test("guests can't touch mail flags, email or tier of their reservation", async () => {
  const t = randomUUID();
  await reservedGift("a", t);
  for (const patch of [{ mailed: { welcome: true } }, { adminNotified: true }, { email: "x@y.z" }, { tier: "Mãe" }]) {
    const db = guest();
    const b = writeBatch(db);
    b.update(doc(db, "reservations", t), { status: "bought", closedAt: serverTimestamp(), ...patch });
    b.update(doc(db, "gifts", "a"), { status: "bought" });
    await assertFails(b.commit());
  }
});

// 15
test("reservations can be fetched by id but not listed; locks are unreadable", async () => {
  const t = randomUUID();
  await reservedGift("a", t);
  await assertSucceeds(getDoc(doc(guest(), "reservations", t)));
  await assertFails(getDocs(collection(guest(), "reservations")));
  await assertFails(getDoc(doc(guest(), "giftLocks", "a")));
});

// 16
test("admins (by UID) do everything; other accounts don't", async () => {
  const t = randomUUID();
  await reservedGift("a", t);
  await assertSucceeds(setDoc(doc(admin(), "gifts", "n"), giftData({ status: "draft" })));
  await assertSucceeds(getDocs(collection(admin(), "gifts")));
  await assertSucceeds(getDocs(collection(admin(), "reservations")));
  await assertSucceeds(getDoc(doc(admin(), "giftLocks", "a")));
  await assertSucceeds(updateDoc(doc(admin(), "gifts", "a"), { status: "bought", byCouple: true }));
  await assertSucceeds(deleteDoc(doc(admin(), "gifts", "n")));
  const other = env.authenticatedContext("someone-else").firestore();
  await assertFails(setDoc(doc(other, "gifts", "n"), giftData()));
  await assertFails(getDocs(collection(other, "reservations")));
});

// 17
test("delivery settings: public read, admin write", async () => {
  await seed("settings/delivery", { recipient: "N", address: "Rua A" });
  await assertSucceeds(getDoc(doc(guest(), "settings", "delivery")));
  await assertFails(setDoc(doc(guest(), "settings", "delivery"), { recipient: "x", address: "y" }));
  await assertSucceeds(setDoc(doc(admin(), "settings", "delivery"), { recipient: "x", address: "y" }));
});
