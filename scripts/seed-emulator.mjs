// Fills the LOCAL emulator with sample gifts and reservations of different ages, for testing the site and the mailer.
// Usage: npm run emulators (other terminal), then: FIRESTORE_EMULATOR_HOST=127.0.0.1:8177 npm run seed
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST so this never touches production.");
  process.exit(1);
}
initializeApp({ projectId: "demo-casa-ny" });
const db = getFirestore();
const H = 3600_000;
const u = (id) => `https://images.unsplash.com/photo-${id}?w=900&q=75&auto=format&fit=crop`;

const base = {
  brand: "", description: "", dims: "", status: "available",
  createdAt: Timestamp.now(), quantity: 1, boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], lastHold: "",
};
const gifts = {
  luminaria: { room: "sala", name: "Luminária de piso", model: "Tok&Stok Arco LP-200 Preta Bivolt", price: 489, dims: "160 cm",
    photos: [u("1507473885765-e6ed057f782c"), u("1513506003901-1e6a229e2d15")],
    links: [{ store: "Amazon", url: "https://www.amazon.com.br/s?k=luminaria+piso", coupon: "CASA10" }, { store: "Mercado Livre", url: "https://lista.mercadolivre.com.br/luminaria-piso" }],
    description: "Luz de leitura ao lado do sofá." },
  panela: { room: "cozinha", name: "Jogo de panelas", model: "Tramontina Paris 5 peças Inox 65630/350", price: 899,
    photos: [u("1565538810643-b5bdb714032a")], links: [{ store: "Amazon", url: "https://www.amazon.com.br/s?k=tramontina+paris" }] },
  toalhas: { room: "banheiro", name: "Kit de toalhas", model: "Buddemeyer Kit 4 peças Algodão Egípcio Branco", price: 249,
    photos: [u("1620626011761-996317b8d101")], links: [{ store: "Shopee", url: "https://shopee.com.br/search?keyword=toalha" }] },
  cafeteira: { room: "cozinha", name: "Cafeteira", model: "Oster Inox 2 em 1 OCAF500", price: 399,
    photos: [u("1565538810643-b5bdb714032a")], links: [{ store: "Amazon", url: "https://www.amazon.com.br/s?k=cafeteira" }] },
  vaso: { room: "sala", name: "Vaso de cerâmica", model: "Vaso Terracota 30cm", price: 120,
    photos: [u("1578500494198-246f612d3b3d")], links: [{ store: "Shopee", url: "https://shopee.com.br/search?keyword=vaso" }] },
  rascunho: { room: "quarto", name: "Rascunho importado", model: "Jogo de cama Queen", price: 300, status: "draft",
    photos: [u("1615874959474-d609969a20ed")], links: [] },
  lencol: { room: "quarto", name: "Jogo de lençol", model: "Hoomy Algodão Egípcio Casal", price: 754, quantity: 3,
    photos: [u("1615874959474-d609969a20ed")], links: [{ store: "Amazon", url: "https://www.amazon.com.br/s?k=lencol" }] },
  edredom: { room: "quarto", name: "Edredom", model: "Altenburg Queen", price: 350, status: "bought",
    photos: [u("1615874959474-d609969a20ed")], links: [] },
};

const batch = db.batch();
for (const [id, g] of Object.entries(gifts)) batch.set(db.doc(`gifts/${id}`), { ...base, ...g });
batch.set(db.doc("settings/delivery"), { recipient: "Nathália Exemplo", address: "Rua das Flores, 123, ap 45\nJardim, São Paulo - SP\n01234-567" });

// Reservations: 1h (welcome due), 50h (reminder due), 73h (expires), and a confirmed purchase (admin notice due).
// Reservations: 1h (welcome due), 50h (reminder due), 73h (expires), a confirmed purchase (admin notice due),
// and 2 of the 3 sheet sets held by one guest.
const reservations = [
  { gift: "panela", ageH: 1, name: "Maria Silva", tier: "Prima", status: "reserved" },
  { gift: "cafeteira", ageH: 50, name: "João Souza", tier: "Tio", status: "reserved", mailed: { welcome: true } },
  { gift: "toalhas", ageH: 73, name: "Ana Lima", tier: "Amiga", status: "reserved", mailed: { welcome: true, reminder: true } },
  { gift: "vaso", ageH: 5, name: "Pedro Alves", tier: "Irmão", status: "bought", mailed: { welcome: true } },
  { gift: "lencol", ageH: 2, name: "Beatriz Costa", tier: "Madrinha", status: "reserved", units: 2 },
];
const tokens = {};
const held = {};
for (const r of reservations) {
  const token = randomUUID();
  const holdId = token.replaceAll("-", "").slice(0, 20);
  const units = r.units ?? 1;
  tokens[r.gift] = token;
  const at = Timestamp.fromMillis(Date.now() - r.ageH * H);
  const first = r.name.split(" ")[0];
  batch.set(db.doc(`reservations/${token}`), {
    giftId: r.gift, holdId, units, name: r.name, email: `${first.toLowerCase()}@example.com`, tier: r.tier, status: r.status,
    reservedAt: at, adminNotified: false, ...(r.mailed ? { mailed: r.mailed } : {}),
  });
  if (r.status === "reserved") {
    batch.set(db.doc(`holdLocks/${holdId}`), { token, giftId: r.gift });
    held[r.gift] ??= { holds: {}, heldUnits: 0 };
    held[r.gift].holds[holdId] = { units, reservedAt: at, giverName: first, giverTier: r.tier };
    held[r.gift].heldUnits += units;
  } else {
    batch.update(db.doc(`gifts/${r.gift}`), { status: "bought", boughtUnits: units, givers: [{ name: first, tier: r.tier, units }] });
  }
}
for (const [gift, h] of Object.entries(held)) batch.update(db.doc(`gifts/${gift}`), h);
// The couple's own purchase.
batch.update(db.doc("gifts/edredom"), { boughtUnits: 1, givers: [{ name: "", tier: "", units: 1, byCouple: true }] });
await batch.commit();
console.log("Seeded. Personal links:");
for (const [gift, token] of Object.entries(tokens)) console.log(`  ${gift}: http://localhost:3000/reserva?t=${token}`);
