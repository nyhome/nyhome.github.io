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
  brand: "", description: "", dims: "", status: "available", reservedAt: null, giverName: null, giverTier: null,
  byCouple: false, createdAt: Timestamp.now(),
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
  edredom: { room: "quarto", name: "Edredom", model: "Altenburg Queen", price: 350, status: "bought", byCouple: true,
    photos: [u("1615874959474-d609969a20ed")], links: [] },
};

const batch = db.batch();
for (const [id, g] of Object.entries(gifts)) batch.set(db.doc(`gifts/${id}`), { ...base, ...g });
batch.set(db.doc("settings/delivery"), { recipient: "Nathália Exemplo", address: "Rua das Flores, 123, ap 45\nJardim, São Paulo - SP\n01234-567" });

// Reservations: 1h (welcome due), 50h (reminder due), 73h (expires), and a confirmed purchase (admin notice due).
const reservations = [
  { gift: "panela", ageH: 1, name: "Maria Silva", tier: "Prima", status: "reserved" },
  { gift: "cafeteira", ageH: 50, name: "João Souza", tier: "Tio", status: "reserved", mailed: { welcome: true } },
  { gift: "toalhas", ageH: 73, name: "Ana Lima", tier: "Amiga", status: "reserved", mailed: { welcome: true, reminder: true } },
  { gift: "vaso", ageH: 5, name: "Pedro Alves", tier: "Irmão", status: "bought", mailed: { welcome: true } },
];
const tokens = {};
for (const r of reservations) {
  const token = randomUUID();
  tokens[r.gift] = token;
  const at = Timestamp.fromMillis(Date.now() - r.ageH * H);
  batch.set(db.doc(`reservations/${token}`), {
    giftId: r.gift, name: r.name, email: `${r.name.split(" ")[0].toLowerCase()}@example.com`, tier: r.tier, status: r.status,
    reservedAt: at, adminNotified: false, ...(r.mailed ? { mailed: r.mailed } : {}),
  });
  batch.set(db.doc(`giftLocks/${r.gift}`), { token });
  batch.update(db.doc(`gifts/${r.gift}`), { status: r.status, reservedAt: at, giverName: r.name.split(" ")[0], giverTier: r.tier });
}
await batch.commit();
console.log("Seeded. Personal links:");
for (const [gift, token] of Object.entries(tokens)) console.log(`  ${gift}: http://localhost:3000/reserva?t=${token}`);
