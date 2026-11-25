// Local HTTP route for an AI app on this Mac to post gifts straight into the list. The /presente skill
// (~/.claude/skills/presente) saves through scripts/produto.mjs, which reuses the validation below.
//
//   npm run api                         → http://127.0.0.1:4321
//   GET  /produtos/schema               → JSON schema of a product (hand it to the AI app)
//   POST /produtos                      → one product or an array; published unless "status": "draft"
//
// curl -X POST http://127.0.0.1:4321/produtos -H 'content-type: application/json' \
//   -d '{"name":"Cafeteira","model":"Oster OCAF650 127V","room":"cozinha","price":130,
//        "links":[{"store":"Amazon","url":"https://www.amazon.com.br/dp/B002NLADVU","coupon":"CASA10"}],
//        "photos":["https://m.media-amazon.com/images/I/51vVvDVetDL.jpg"]}'
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const ROOMS = ["sala", "cozinha", "banheiro", "quarto", "escritorio", "externa"];
const PORT = Number(process.env.PORT ?? 4321);

export const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Produto da lista de presentes Casa N&Y",
  type: "object",
  required: ["name", "room", "price", "links"],
  properties: {
    name: { type: "string", maxLength: 60, description: "Nome curto para o card, sem marca nem código. Ex.: 'Cafeteira elétrica'" },
    model: { type: "string", maxLength: 200, description: "Título/modelo completo e exato que o convidado vai buscar na loja (marca, linha, código, cor, voltagem)" },
    brand: { type: "string", maxLength: 60 },
    description: { type: "string", maxLength: 300, description: "Uma frase curta dizendo para que serve" },
    dims: { type: "string", maxLength: 60, description: "Medidas físicas, ex.: '160 x 40 cm'" },
    room: { type: "string", enum: ROOMS },
    price: { type: "number", minimum: 0, description: "Preço de referência em reais (o menor entre as lojas)" },
    links: {
      type: "array", minItems: 1, maxItems: 6,
      items: {
        type: "object", required: ["store", "url"],
        properties: {
          store: { type: "string", maxLength: 40, description: "Nome da loja. Ex.: 'Amazon', 'Mercado Livre'" },
          url: { type: "string", format: "uri" },
          coupon: { type: "string", maxLength: 40, description: "Código de cupom, se houver" },
        },
      },
    },
    photos: { type: "array", maxItems: 10, items: { type: "string", format: "uri" }, description: "URLs das fotos do produto, a melhor primeiro" },
    status: { type: "string", enum: ["available", "draft"], default: "available", description: "'draft' para revisar no painel antes de publicar" },
  },
};

const isUrl = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Drops repeated photos, keeping the sharpest copy: stores serve one image in several sizes (Amazon "._AC_SX300_",
 * Mercado Livre "D_Q_NP_…-R" vs "D_NQ_NP_2X_…-O", Shopee "…_tn"), and an AI reading the page often grabs two.
 */
export function normalizePhotos(urls) {
  const best = new Map();
  for (const raw of urls) {
    let url = raw;
    let key = raw;
    let score = 0;
    const amazon = raw.match(/^(https:\/\/[^/]*media-amazon\.com\/images\/I\/[^./]+)(?:\.[^/]*)?\.(jpe?g|png|webp)$/i);
    const ml = raw.match(/mlstatic\.com\/D_[A-Z_]*?(2X_)?(\d+-[A-Z]{3}\d+_\d+)-([A-Z])\./i);
    const shopee = raw.match(/^(https:\/\/[^/]*susercontent\.com\/file\/[^_@/?]+)(_tn)?/i);
    if (amazon) [url, key, score] = [`${amazon[1]}.${amazon[2]}`, amazon[1], 3]; // no size suffix = full size
    else if (ml) [key, score] = [ml[2], (ml[1] ? 2 : 0) + ("OF".includes(ml[3].toUpperCase()) ? 1 : 0)];
    else if (shopee) [url, key, score] = [shopee[1], shopee[1], 3];
    const prev = best.get(key);
    if (!prev) best.set(key, { url, score });
    else if (score > prev.score) Object.assign(prev, { url, score });
  }
  return [...best.values()].map((b) => b.url);
}

/** Validates and normalizes one product from the AI app. Returns { value } or { errors }. Pure: tested in api.test.mjs. */
export function validateProduct(p) {
  const errors = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return { errors: ["o produto precisa ser um objeto JSON"] };
  const name = str(p.name, 60);
  if (!name) errors.push("name é obrigatório");
  if (!ROOMS.includes(p.room)) errors.push(`room precisa ser um de: ${ROOMS.join(", ")}`);
  const price = typeof p.price === "string" ? Number(p.price.replace(",", ".")) : p.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) errors.push("price precisa ser um número >= 0");
  const links = Array.isArray(p.links) ? p.links.slice(0, 6) : [];
  if (!links.length) errors.push("links precisa ter pelo menos uma loja");
  links.forEach((l, i) => {
    if (!l || !isUrl(l.url)) errors.push(`links[${i}].url precisa ser uma URL http(s)`);
    if (!l || !str(l.store, 40)) errors.push(`links[${i}].store é obrigatório`);
  });
  const photos = normalizePhotos(Array.isArray(p.photos) ? p.photos.filter(isUrl) : []).slice(0, 10);
  if (p.status !== undefined && !["available", "draft"].includes(p.status)) errors.push("status precisa ser 'available' ou 'draft'");
  if (errors.length) return { errors };
  return {
    value: {
      name, room: p.room, price: Math.round(price * 100) / 100,
      model: str(p.model, 200), brand: str(p.brand, 60), description: str(p.description, 300), dims: str(p.dims, 60),
      links: links.map((l) => (str(l.coupon, 40) ? { store: str(l.store, 40), url: l.url, coupon: str(l.coupon, 40).toUpperCase() } : { store: str(l.store, 40), url: l.url })),
      photos,
      status: p.status ?? "available",
    },
  };
}

/**
 * Only non-browser clients (curl, the /presente skill, a local AI app) may write. Checking Host stops DNS rebinding;
 * refusing browser Origins and requiring a JSON content type (which forces a preflight we never approve) stops
 * websites open in the browser from posting. Checking Host stops DNS rebinding; refusing foreign Origins and
 * requiring a JSON content type (which forces a preflight we never approve) stops other websites from posting.
 */
export function allowed({ method, headers }, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(headers.host)) return false;
  if (headers.origin && !hosts.some((h) => headers.origin === `http://${h}`)) return false;
  return method !== "POST" || /^application\/json\b/i.test(headers["content-type"] ?? "");
}

/** Admin SDK: the emulator when FIRESTORE_EMULATOR_HOST is set, otherwise production via service-account.json. */
export async function firestore() {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: "demo-casa-ny" });
  else {
    const key = new URL("../service-account.json", import.meta.url);
    if (!existsSync(key)) throw new Error("Falta o service-account.json na raiz do projeto.");
    initializeApp({ credential: cert(JSON.parse(readFileSync(key, "utf8"))) });
  }
  return { db: getFirestore(), FieldValue };
}

/** Saves a product checked by validateProduct; returns the new gift id. */
export async function saveProduct({ db, FieldValue }, { status, ...data }) {
  const ref = await db.collection("gifts").add({
    ...data, status, reservedAt: null, giverName: null, giverTier: null, byCouple: false, createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`${status === "draft" ? "Rascunho" : "Publicado"}: ${data.name} (R$ ${data.price}) id=${ref.id}`);
  return ref.id;
}

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
};

async function main() {
  const fs = await firestore();

  createServer(async (req, res) => {
    if (!allowed(req, PORT)) return send(res, 403, { error: "requisição recusada" });
    const path = new URL(req.url, "http://x").pathname.replace(/\/$/, "");
    if (req.method === "GET" && path === "/produtos/schema") return send(res, 200, SCHEMA);
    if (req.method === "GET" && (path === "" || path === "/produtos"))
      return send(res, 200, { ok: true, uso: "POST /produtos com um produto ou uma lista (JSON). Formato em GET /produtos/schema." });
    if (req.method !== "POST" || path !== "/produtos") return send(res, 404, { error: "use POST /produtos ou GET /produtos/schema" });

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1_000_000) return send(res, 413, { error: "corpo grande demais" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "JSON inválido" });
    }
    const checked = [body].flat().map(validateProduct);
    const bad = checked.flatMap((c, index) => (c.errors ? [{ index, errors: c.errors }] : []));
    // All or nothing: a batch with one bad product saves none, so the AI can fix and resend the whole thing.
    if (bad.length) return send(res, 400, { error: "produto inválido", detalhes: bad });

    try {
      const criados = [];
      for (const { value } of checked) criados.push({ id: await saveProduct(fs, value), name: value.name, status: value.status });
      send(res, 201, { ok: true, criados });
    } catch (e) {
      console.error("Falha ao gravar:", e.message);
      send(res, 500, { error: "falha ao gravar no Firestore" });
    }
  }).listen(PORT, "127.0.0.1", () => {
    // shortcut: no token, the server only listens on 127.0.0.1 and allowed() refuses websites; add one if it ever needs to be reachable from another device
    console.log(`API da lista em http://127.0.0.1:${PORT}  (POST /produtos, GET /produtos/schema). Ctrl+C para parar.`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
