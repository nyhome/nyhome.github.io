// Security rules against the Firestore emulator. Run with: npm run test:rules
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
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
  status: "available", quantity: 1, boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], lastHold: "",
  createdAt: Timestamp.now(), ...extra,
});

async function seed(path, data) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
}

/** The reserve batch exactly as src/lib/firebase.ts sends it; `tweak` breaks one part per test. */
function reserve(db, giftId, { token = randomUUID(), holdId = randomUUID().slice(0, 20), units = 1, ...tweak } = {}) {
  const b = writeBatch(db);
  if (!tweak.skipRes)
    b.set(doc(db, "reservations", token), {
      giftId, holdId, units, name: "Maria Silva", email: "maria@example.com", tier: "Prima", status: "reserved",
      reservedAt: serverTimestamp(), adminNotified: false, ...tweak.res,
    });
  if (!tweak.skipLock) b.set(doc(db, "holdLocks", holdId), { token, giftId, ...tweak.lock });
  if (!tweak.skipGift)
    b.update(doc(db, "gifts", giftId), {
      [`holds.${holdId}`]: { units, reservedAt: serverTimestamp(), giverName: "Maria", giverTier: "Prima", ...tweak.hold },
      heldUnits: increment(units),
      lastHold: holdId,
      ...tweak.gift,
    });
  return b.commit();
}

/** Confirm or give up, as src/lib/firebase.ts sends it. `hold` is what the gift shows for that hold. */
function close(db, giftId, token, holdId, outcome, hold, { givers = [], quantity = 1, boughtUnits = 0, giftExtra = {} } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, "reservations", token), { status: outcome, closedAt: serverTimestamp() });
  const common = { [`holds.${holdId}`]: deleteField(), heldUnits: increment(-hold.units), lastHold: holdId };
  b.update(
    doc(db, "gifts", giftId),
    outcome === "bought"
      ? {
          ...common,
          boughtUnits: increment(hold.units),
          givers: [...givers, { name: hold.giverName, tier: hold.giverTier, units: hold.units }],
          ...(boughtUnits + hold.units >= quantity ? { status: "bought" } : {}),
          ...giftExtra,
        }
      : { ...common, ...giftExtra },
  );
  return b.commit();
}

/** A gift with one hold already in place, `ageH` hours old. */
async function heldGift(giftId, { token = randomUUID(), holdId = "hold1", units = 1, ageH = 1, gift = {} } = {}) {
  const at = Timestamp.fromMillis(Date.now() - ageH * H);
  const hold = { units, reservedAt: at, giverName: "Ana", giverTier: "Tia" };
  await seed(`gifts/${giftId}`, giftData({ heldUnits: units, holds: { [holdId]: hold }, lastHold: holdId, ...gift }));
  await seed(`holdLocks/${holdId}`, { token, giftId });
  await seed(`reservations/${token}`, {
    giftId, holdId, units, name: "Ana Souza", email: "ana@example.com", tier: "Tia", status: "reserved", reservedAt: at, adminNotified: false,
  });
  return { token, holdId, hold };
}

test("guests read published gifts but not drafts; the catalog query must filter by status", async () => {
  await seed("gifts/a", giftData());
  await seed("gifts/b", giftData({ status: "bought" }));
  await seed("gifts/d", giftData({ status: "draft" }));
  for (const id of ["a", "b"]) await assertSucceeds(getDoc(doc(guest(), "gifts", id)));
  await assertFails(getDoc(doc(guest(), "gifts", "d")));
  await assertSucceeds(getDocs(query(collection(guest(), "gifts"), where("status", "in", ["available", "bought"]))));
  await assertFails(getDocs(collection(guest(), "gifts")));
});

test("guests can't create, delete or edit catalog fields", async () => {
  await seed("gifts/a", giftData());
  await assertFails(setDoc(doc(guest(), "gifts", "new"), giftData()));
  await assertFails(deleteDoc(doc(guest(), "gifts", "a")));
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { price: 1 }));
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { quantity: 9 }));
});

test("a valid reserve batch succeeds, for one unit or several", async () => {
  await seed("gifts/a", giftData());
  await assertSucceeds(reserve(guest(), "a"));
  await seed("gifts/s", giftData({ quantity: 3 }));
  await assertSucceeds(reserve(guest(), "s", { units: 2 }));
  await assertSucceeds(reserve(guest(), "s", { units: 1 }));
});

test("reserve batches with bad data fail", async () => {
  await seed("gifts/a", giftData({ quantity: 2 }));
  const bad = [
    { hold: { reservedAt: Timestamp.fromMillis(Date.now() + 999 * H) } },
    { res: { reservedAt: Timestamp.fromMillis(Date.now() + 999 * H) } },
    { gift: { price: 1 } },
    { gift: { heldUnits: 0 } },
    { res: { tier: "Chefe" }, hold: { giverTier: "Chefe" } },
    { hold: { giverTier: "Tio" } },
    { res: { units: 2 } },
    { res: { email: "não-é-email" } },
    { res: { name: "x".repeat(61) } },
    { hold: { giverName: "" } },
    { hold: { extra: 1 } },
    { res: { extra: 1 } },
    { res: { adminNotified: true } },
    { res: { status: "bought" } },
    { units: 0 },
  ];
  for (const tweak of bad) await assertFails(reserve(guest(), "a", tweak));
  await assertFails(reserve(guest(), "a", { token: "not-a-uuid" }));
});

test("units can't go past the quantity, counting holds and purchases", async () => {
  await seed("gifts/s", giftData({ quantity: 3, boughtUnits: 1, givers: [{ name: "Ana", tier: "Tia", units: 1 }] }));
  await assertFails(reserve(guest(), "s", { units: 3 }));
  await assertSucceeds(reserve(guest(), "s", { units: 2 }));
  await assertFails(reserve(guest(), "s", { units: 1 }));
});

test("drafts and fully bought gifts can't be reserved", async () => {
  await seed("gifts/d", giftData({ status: "draft" }));
  await seed("gifts/b", giftData({ status: "bought", boughtUnits: 1 }));
  await assertFails(reserve(guest(), "d"));
  await assertFails(reserve(guest(), "b"));
});

test("locked gifts can't be reserved until unlocked", async () => {
  await seed("gifts/l", giftData({ locked: true }));
  await assertFails(reserve(guest(), "l"));
  await seed("gifts/l", giftData({ locked: false }));
  await assertSucceeds(reserve(guest(), "l"));
});

test("partial reserve batches fail", async () => {
  await seed("gifts/a", giftData());
  await assertFails(reserve(guest(), "a", { skipLock: true }));
  await assertFails(reserve(guest(), "a", { skipGift: true }));
  await assertFails(reserve(guest(), "a", { skipRes: true }));
});

test("existing tokens and hold ids can't be reused", async () => {
  const { token, holdId } = await heldGift("a", { gift: { quantity: 3 } });
  await assertFails(reserve(guest(), "a", { token }));
  await assertFails(reserve(guest(), "a", { holdId }));
});

test("a reserve can't touch another guest's hold", async () => {
  await heldGift("s", { gift: { quantity: 3 } });
  const db = guest();
  const holdId = "newhold";
  const token = randomUUID();
  const b = writeBatch(db);
  b.set(doc(db, "reservations", token), {
    giftId: "s", holdId, units: 1, name: "Bia", email: "bia@example.com", tier: "Amiga", status: "reserved",
    reservedAt: serverTimestamp(), adminNotified: false,
  });
  b.set(doc(db, "holdLocks", holdId), { token, giftId: "s" });
  b.update(doc(db, "gifts", "s"), {
    [`holds.${holdId}`]: { units: 1, reservedAt: serverTimestamp(), giverName: "Bia", giverTier: "Amiga" },
    "holds.hold1": deleteField(),
    heldUnits: increment(1),
    lastHold: holdId,
  });
  await assertFails(b.commit());
});

test("the holder confirms with the right token, even after the 72h; the gift is bought when every unit is", async () => {
  const one = await heldGift("a", { ageH: 80 });
  await assertSucceeds(close(guest(), "a", one.token, one.holdId, "bought", one.hold));
  const two = await heldGift("s", { units: 2, gift: { quantity: 3 } });
  await assertSucceeds(close(guest(), "s", two.token, two.holdId, "bought", two.hold, { quantity: 3 }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = (await getDoc(doc(ctx.firestore(), "gifts", "s"))).data();
    const a = (await getDoc(doc(ctx.firestore(), "gifts", "a"))).data();
    if (s.status !== "available" || s.boughtUnits !== 2 || s.heldUnits !== 0) throw new Error(`s: ${JSON.stringify(s)}`);
    if (a.status !== "bought") throw new Error("a not bought");
  });
});

test("confirming must record the giver and the right status", async () => {
  const h = await heldGift("a");
  await assertFails(close(guest(), "a", h.token, h.holdId, "bought", h.hold, { giftExtra: { givers: [] } }));
  await assertFails(close(guest(), "a", h.token, h.holdId, "bought", h.hold, { giftExtra: { status: "available" } }));
  await assertFails(close(guest(), "a", h.token, h.holdId, "bought", h.hold, { giftExtra: { boughtUnits: 5 } }));
});

test("a token can't close a hold it doesn't own", async () => {
  const mine = await heldGift("mine", { holdId: "hm" });
  await heldGift("theirs", { holdId: "ht" });
  await assertFails(close(guest(), "theirs", mine.token, "ht", "bought", mine.hold));
  // Swapping the lock in the same batch doesn't help: the rule reads the lock as it was before.
  const db = guest();
  const b = writeBatch(db);
  b.set(doc(db, "holdLocks", "ht"), { token: mine.token, giftId: "theirs" });
  b.update(doc(db, "reservations", mine.token), { status: "bought", closedAt: serverTimestamp() });
  b.update(doc(db, "gifts", "theirs"), { "holds.ht": deleteField(), heldUnits: increment(-1), boughtUnits: increment(1), lastHold: "ht", status: "bought" });
  await assertFails(b.commit());
});

test("closing only one side fails", async () => {
  const h = await heldGift("a");
  await assertFails(updateDoc(doc(guest(), "gifts", "a"), { "holds.hold1": deleteField(), heldUnits: 0, lastHold: "hold1" }));
  await assertFails(updateDoc(doc(guest(), "reservations", h.token), { status: "bought", closedAt: serverTimestamp() }));
});

test("giving up frees the units and leaves no giver", async () => {
  const h = await heldGift("s", { units: 2, gift: { quantity: 3 } });
  await assertFails(close(guest(), "s", h.token, h.holdId, "released", h.hold, { giftExtra: { givers: [{ name: "Ana", tier: "Tia", units: 2 }] } }));
  await assertSucceeds(close(guest(), "s", h.token, h.holdId, "released", h.hold));
  await assertSucceeds(reserve(guest(), "s", { units: 3 }));
});

test("guests can't touch mail flags, email or tier of their reservation", async () => {
  const h = await heldGift("a");
  for (const patch of [{ mailed: { welcome: true } }, { adminNotified: true }, { email: "x@y.z" }, { tier: "Mãe" }]) {
    const db = guest();
    const b = writeBatch(db);
    b.update(doc(db, "reservations", h.token), { status: "bought", closedAt: serverTimestamp(), ...patch });
    b.update(doc(db, "gifts", "a"), {
      "holds.hold1": deleteField(), heldUnits: increment(-1), boughtUnits: increment(1), lastHold: "hold1", status: "bought",
      givers: [{ name: "Ana", tier: "Tia", units: 1 }],
    });
    await assertFails(b.commit());
  }
});

test("reservations can be fetched by id but not listed; locks are unreadable", async () => {
  const h = await heldGift("a");
  await assertSucceeds(getDoc(doc(guest(), "reservations", h.token)));
  await assertFails(getDocs(collection(guest(), "reservations")));
  await assertFails(getDoc(doc(guest(), "holdLocks", "hold1")));
});

test("admins (by UID) do everything; other accounts don't", async () => {
  await heldGift("a");
  await assertSucceeds(setDoc(doc(admin(), "gifts", "n"), giftData({ status: "draft" })));
  await assertSucceeds(getDocs(collection(admin(), "gifts")));
  await assertSucceeds(getDocs(collection(admin(), "reservations")));
  await assertSucceeds(getDoc(doc(admin(), "holdLocks", "hold1")));
  await assertSucceeds(updateDoc(doc(admin(), "gifts", "a"), { status: "bought", boughtUnits: 1 }));
  await assertSucceeds(deleteDoc(doc(admin(), "gifts", "n")));
  const other = env.authenticatedContext("someone-else").firestore();
  await assertFails(setDoc(doc(other, "gifts", "n"), giftData()));
  await assertFails(getDocs(collection(other, "reservations")));
});

test("private: admin only", async () => {
  await seed("private/goal", { people: { admin: { name: "Y", amount: 1 } } });
  await assertFails(getDoc(doc(guest(), "private", "goal")));
  await assertFails(setDoc(doc(guest(), "private", "goal"), { people: {} }));
  await assertSucceeds(getDoc(doc(admin(), "private", "goal")));
  await assertSucceeds(setDoc(doc(admin(), "private", "goal"), { people: {} }));
});

test("delivery settings: public read, admin write", async () => {
  await seed("settings/delivery", { recipient: "N", address: "Rua A" });
  await assertSucceeds(getDoc(doc(guest(), "settings", "delivery")));
  await assertFails(setDoc(doc(guest(), "settings", "delivery"), { recipient: "x", address: "y" }));
  await assertSucceeds(setDoc(doc(admin(), "settings", "delivery"), { recipient: "x", address: "y" }));
});
