// Local HTTP route for an AI app on this Mac to post gifts straight into the list. The /presente skill
// (~/.claude/skills/presente) saves through scripts/produto.mjs, which reuses the validation below.
//
//   npm run api                         → http://127.0.0.1:4321
//   GET  /produtos/schema               → JSON schema of a product (hand it to the AI app)
//   GET  /produtos                      → every gift (id, status, price, links, priceCheckedAt), oldest check first
//   POST /produtos                      → one product or an array; published unless "status": "draft"
//   PATCH /produtos/<id>                → refresh price/links/status of one gift (the /atualizar-presentes skill)
//
// curl -X POST http://127.0.0.1:4321/produtos -H 'content-type: application/json' \
//   -d '{"name":"Cafeteira","model":"Oster OCAF650 127V","room":"cozinha","price":130,
//        "links":[{"store":"Amazon","url":"https://www.amazon.com.br/dp/B002NLADVU","coupon":"CASA10"}],
//        "photos":["https://m.media-amazon.com/images/I/51vVvDVetDL.jpg"]}'
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const ROOMS = ["sala", "cozinha", "banheiro", "quarto", "escritorio", "servico"];
// Same list as VOLTAGES in src/data/gifts.ts.
const VOLTAGES = ["127V", "220V", "Bivolt"];
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
    voltage: { type: "string", enum: VOLTAGES, description: "Só para eletrônicos/eletrodomésticos: a voltagem do anúncio. Omita se não se aplica" },
    room: { type: "string", enum: ROOMS },
    quantity: { type: "integer", minimum: 1, maximum: 50, default: 1, description: "Quantas unidades vocês querem (ex.: 3 jogos de lençol num produto só, nunca 3 produtos). Cada convidado escolhe quantas dá" },
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
  const price = typeof p.price === "string" && p.price.trim() ? Number(p.price.replace(",", ".")) : p.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) errors.push("price precisa ser um número >= 0");
  const links = Array.isArray(p.links) ? p.links.slice(0, 6) : [];
  if (!links.length) errors.push("links precisa ter pelo menos uma loja");
  links.forEach((l, i) => {
    if (!l || !isUrl(l.url)) errors.push(`links[${i}].url precisa ser uma URL http(s)`);
    if (!l || !str(l.store, 40)) errors.push(`links[${i}].store é obrigatório`);
  });
  const photos = normalizePhotos(Array.isArray(p.photos) ? p.photos.filter(isUrl) : []).slice(0, 10);
  // Accept "127", "220 v", "bivolt"...: an AI rarely writes it exactly like the enum.
  const voltage = p.voltage ? VOLTAGES.find((v) => v.toLowerCase() === String(p.voltage).toLowerCase().replace(/\s/g, "").replace(/^(127|220)$/, "$1v")) : "";
  if (voltage === undefined) errors.push(`voltage precisa ser um de: ${VOLTAGES.join(", ")}`);
  const quantity = p.quantity === undefined ? 1 : typeof p.quantity === "number" || /^\d+$/.test(p.quantity) ? Number(p.quantity) : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) errors.push("quantity precisa ser um inteiro de 1 a 50");
  if (p.status !== undefined && !["available", "draft"].includes(p.status)) errors.push("status precisa ser 'available' ou 'draft'");
  if (errors.length) return { errors };
  return {
    value: {
      name, room: p.room, price: Math.round(price * 100) / 100, lowestPrice: Math.round(price * 100) / 100, quantity,
      model: str(p.model, 200), brand: str(p.brand, 60), description: str(p.description, 300), dims: str(p.dims, 60),
      ...(voltage ? { voltage } : {}),
      links: links.map((l) => (str(l.coupon, 40) ? { store: str(l.store, 40), url: l.url, coupon: str(l.coupon, 40).toUpperCase() } : { store: str(l.store, 40), url: l.url })),
      photos,
      status: p.status ?? "available",
    },
  };
}

const UPDATABLE = ["price", "links", "status", "quantity"];

/**
 * Checks a price/links refresh against the gift as it is now; returns { update } (only the changed keys, normalized)
 * or { errors }. Reserved or bought gifts can't change status, and nothing else is touched. Pure: tested in api.test.mjs.
 */
export function mergeUpdate(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { errors: ["a atualização precisa ser um objeto JSON"] };
  const extra = Object.keys(patch).filter((k) => !UPDATABLE.includes(k));
  if (extra.length) return { errors: [`só dá para atualizar ${UPDATABLE.join(", ")}; recusado: ${extra.join(", ")}`] };
  const taken = (current.boughtUnits ?? 0) + (current.heldUnits ?? 0);
  if (patch.quantity !== undefined && Number(patch.quantity) < taken)
    return { errors: [`já tem ${taken} unidades reservadas ou compradas; quantity não pode ser menor`] };
  if (patch.status !== undefined && (current.heldUnits ?? 0) > 0)
    return { errors: ["o presente tem reservas ativas; o status dele não muda por aqui"] };
  if (patch.status !== undefined && !["available", "draft"].includes(current.status))
    return { errors: [`o presente está "${current.status}"; o status dele não muda por aqui`] };
  if (patch.status === "draft" && (current.boughtUnits ?? 0) > 0)
    return { errors: ["convidados já deram unidades desse presente; ele não volta a ser rascunho"] };
  const { value, errors } = validateProduct({
    ...current,
    ...patch,
    status: patch.status ?? (current.status === "draft" ? "draft" : "available"),
  });
  if (errors) return { errors };
  const update = {};
  for (const k of UPDATABLE) if (patch[k] !== undefined) update[k] = value[k];
  // The lowest price ever seen only goes down on its own; the couple can still edit it in the panel.
  if (update.price !== undefined) {
    // Gifts from before the field existed start from their old price.
    const lowest = Math.min(current.lowestPrice ?? current.price ?? Infinity, update.price);
    if (lowest !== current.lowestPrice) update.lowestPrice = lowest;
  }
  // A published gift is "bought" exactly when every unit is: more units reopen it, fewer can close it.
  const status = update.status ?? current.status;
  if (update.quantity !== undefined && status !== "draft") {
    const next = (current.boughtUnits ?? 0) >= update.quantity ? "bought" : "available";
    if (next !== current.status) update.status = next;
  }
  return { update };
}

/** Every gift with what a refresh needs, oldest price check first. */
export async function listGifts({ db }) {
  const snap = await db.collection("gifts").get();
  return snap.docs
    .map((d) => {
      const g = d.data();
      return {
        id: d.id, status: g.status, name: g.name, model: g.model, voltage: g.voltage ?? null, room: g.room, price: g.price,
        quantity: g.quantity ?? 1, boughtUnits: g.boughtUnits ?? 0, heldUnits: g.heldUnits ?? 0,
        links: g.links ?? [], priceCheckedAt: g.priceCheckedAt?.toDate().toISOString() ?? null,
      };
    })
    .sort((a, b) => (a.priceCheckedAt ?? "").localeCompare(b.priceCheckedAt ?? ""));
}

/** Applies a checked refresh and stamps priceCheckedAt; returns { ok, update } or { errors }. */
export async function updateGift({ db, FieldValue }, id, patch) {
  const ref = db.doc(`gifts/${id}`);
  // A transaction: a guest reserving between the read and the write would make the quantity check stale.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { errors: [`presente ${id} não existe`] };
    const { update, errors } = mergeUpdate(snap.data(), patch);
    if (errors) return { errors };
    tx.update(ref, { ...update, priceCheckedAt: FieldValue.serverTimestamp() });
    return { ok: true, update, name: snap.data().name };
  });
  if (result.errors) return result;
  console.log(`Atualizado: ${result.name} ${JSON.stringify(result.update)}`);
  return { ok: true, update: result.update };
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
  return !["POST", "PATCH"].includes(method) || /^application\/json\b/i.test(headers["content-type"] ?? "");
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

/** Saves a product checked by validateProduct; returns { id, status } of the gift it ended up in. */
export async function saveProduct({ db, FieldValue }, { status, ...data }) {
  // The same model again means more units of it, never a copy (a copy per unit is what quantity replaced).
  if (data.model) {
    const same = (await db.collection("gifts").where("model", "==", data.model).limit(1).get()).docs[0];
    if (same) {
      const merged = await db.runTransaction(async (tx) => {
        const g = (await tx.get(same.ref)).data();
        const quantity = (g.quantity ?? 1) + data.quantity;
        if (quantity > 50) throw new Error(`${data.name} já tem ${g.quantity} unidades; com mais ${data.quantity} passaria de 50`);
        // More units reopen a sold-out gift; a draft stays a draft (it still needs publishing).
        const next = g.status === "bought" ? "available" : g.status;
        tx.update(same.ref, { quantity, status: next });
        return { quantity, status: next };
      });
      console.log(`Já existia: ${data.name} agora com ${merged.quantity} unidades (${merged.status}) id=${same.id}`);
      return { id: same.id, status: merged.status };
    }
  }
  const ref = await db.collection("gifts").add({
    ...data, status, boughtUnits: 0, heldUnits: 0, holds: {}, givers: [], lastHold: "", createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`${status === "draft" ? "Rascunho" : "Publicado"}: ${data.name} (R$ ${data.price}) id=${ref.id}`);
  return { id: ref.id, status };
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
    if (req.method === "GET" && path === "/produtos")
      return listGifts(fs).then(
        (produtos) => send(res, 200, { produtos }),
        (e) => send(res, 500, { error: `falha ao ler o Firestore: ${e.message}` }),
      );
    if (req.method === "GET" && path === "")
      return send(res, 200, { ok: true, uso: "GET /produtos lista; POST /produtos cria; PATCH /produtos/<id> atualiza price/links/status. Formato em GET /produtos/schema." });
    const patchId = req.method === "PATCH" && path.match(/^\/produtos\/([A-Za-z0-9]{1,40})$/)?.[1];
    if (!patchId && (req.method !== "POST" || path !== "/produtos"))
      return send(res, 404, { error: "use GET /produtos, POST /produtos, PATCH /produtos/<id> ou GET /produtos/schema" });

    // Decode as one stream, so an "ç" split across two chunks isn't mangled.
    req.setEncoding("utf8");
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
    if (patchId) {
      const result = await updateGift(fs, patchId, body).catch((e) => ({ errors: [`falha ao gravar: ${e.message}`] }));
      return send(res, result.errors ? 400 : 200, result.errors ? { error: "atualização inválida", detalhes: result.errors } : result);
    }

    const checked = [body].flat().map(validateProduct);
    const bad = checked.flatMap((c, index) => (c.errors ? [{ index, errors: c.errors }] : []));
    // All or nothing: a batch with one bad product saves none, so the AI can fix and resend the whole thing.
    if (bad.length) return send(res, 400, { error: "produto inválido", detalhes: bad });

    try {
      const criados = [];
      for (const { value } of checked) criados.push({ ...(await saveProduct(fs, value)), name: value.name });
      send(res, 201, { ok: true, criados });
    } catch (e) {
      console.error("Falha ao gravar:", e.message);
      send(res, 500, { error: "falha ao gravar no Firestore" });
    }
  }).listen(PORT, "127.0.0.1", () => {
    // shortcut: no token, the server only listens on 127.0.0.1 and allowed() refuses websites; add one if it ever needs to be reachable from another device
    console.log(`API da lista em http://127.0.0.1:${PORT}  (GET/POST /produtos, PATCH /produtos/<id>, GET /produtos/schema). Ctrl+C para parar.`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
