// Turns store listings into draft gifts: opens each URL in your real Chrome (Playwright), collects the product data,
// asks a local Ollama model to tidy it up, and saves it as a draft you review and publish in /admin.
//
//   npm run importar -- <url> [<url> ...]          save drafts (needs service-account.json, or FIRESTORE_EMULATOR_HOST)
//   npm run importar -- --dry <url>                 print what it would save
// Env: OLLAMA_MODEL (default qwen2.5:7b), OLLAMA_URL (default http://localhost:11434).
// The browser profile lives in .playwright-profile/, so a login or captcha you solve once is remembered.
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOMS = ["sala", "cozinha", "banheiro", "quarto", "escritorio", "externa"];
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const OLLAMA = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");

export function storeName(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("amazon")) return "Amazon";
  if (host.includes("mercadolivre") || host.includes("mercadolibre")) return "Mercado Livre";
  if (host.includes("shopee")) return "Shopee";
  if (host.includes("magazineluiza") || host.includes("magalu")) return "Magalu";
  if (host.includes("tokstok")) return "Tok&Stok";
  const base = host.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** "R$ 1.299,90", "1299.90", 1299.9 → 1299.9; null when it isn't a price. */
export function parsePrice(v) {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Price from a JSON-LD Product's offers (object or list; price or lowPrice). */
export function ldPrice(product) {
  const offers = [product?.offers].flat().filter(Boolean);
  for (const o of offers) {
    const p = parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
    if (p) return p;
  }
  return null;
}

/** "Cafeteira X : Amazon.com.br: Cozinha" / "Cafeteira X | Loja" → "Cafeteira X". */
export const cleanTitle = (t) => String(t ?? "").split(/\s[|:]\s|\s-\s(?=[^-]*$)/)[0].trim();

/** At most 5 words and no brand; the model sometimes answers with the whole title. */
export function shortName(n, brand = "") {
  const b = String(brand).trim().toLowerCase();
  const words = String(n ?? "").trim().split(/\s+/).filter((w) => w && w.toLowerCase() !== b);
  return words.length && words.length <= 5 ? words.join(" ") : "";
}

/** Fallback alias from the listing title: "Oster Cafeteira Oster com Jarra Inox 1,2L" → "Cafeteira". */
export function nameFromModel(model, brand = "") {
  const b = brand.trim().toLowerCase();
  const rest = model.split(/\s+/).filter((w) => w.toLowerCase() !== b).join(" ");
  return rest.split(/,|\s(?:com|para)\s|\s\S*\d/i)[0].split(/\s+/).slice(0, 3).join(" ").trim();
}

/** A coupon looks like a code (CASA10, PRIMEIRACOMPRA); anything else the model says is dropped. */
export const couponOf = (c) => (/^[A-Z0-9][A-Z0-9_-]{2,24}$/i.test(String(c ?? "").trim()) ? String(c).trim().toUpperCase() : "");

/** Drops sprites and icons, and collapses Amazon's many sizes of one photo into its full-size URL. */
export function cleanPhotos(urls) {
  const out = [];
  for (const u of urls) {
    if (/sprite|\/G\/\d+\/|logo|icon|\.svg|\.gif/i.test(u)) continue;
    const full = u.replace(/(\/images\/I\/[^.]+)\.[^/]*?(\.(?:jpe?g|png|webp))$/i, "$1$2");
    if (!out.includes(full)) out.push(full);
  }
  return out;
}

/** Model codes worth searching elsewhere: tokens mixing letters and digits ("OCAF650", "RI2240/91"), never plain words or sizes. */
export function modelCodes(model) {
  return [...new Set(String(model ?? "").toUpperCase().split(/[\s,;()]+/))]
    .map((t) => t.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ""))
    .filter((t) => t.length >= 4 && /[A-Z]/.test(t) && /\d/.test(t) && !/^\d+[A-Z]{1,3}$/.test(t));
}

const SEARCH = {
  Amazon: (q) => `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}`,
  "Mercado Livre": (q) => `https://lista.mercadolivre.com.br/${encodeURIComponent(q)}`,
  Shopee: (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`,
};
const PRODUCT_URL = { Amazon: /\/dp\/[A-Z0-9]{10}/, "Mercado Livre": /MLB-?\d+|\/p\/MLB/, Shopee: /-i\.\d+\.\d+/ };

/** The same model at the other big stores: first search result whose title contains the model code. */
async function otherStores(page, draft) {
  const code = modelCodes(draft.model)[0];
  if (!code) return [];
  const have = new Set(draft.links.map((l) => l.store));
  const found = [];
  for (const [store, search] of Object.entries(SEARCH)) {
    if (have.has(store)) continue;
    try {
      await page.goto(search(code), { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(2500);
      // Captcha or "verify traffic" wall: skip this store (npm run importador:login helps).
      if (/captcha|verify|login|signin/i.test(page.url())) continue;
      const href = await page.evaluate(
        ({ code, pattern }) => {
          const norm = (t) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const re = new RegExp(pattern);
          const a = [...document.querySelectorAll("a[href]")].find((el) => re.test(el.href) && norm(el.textContent || el.closest("[data-component-type], li, div")?.textContent || "").includes(norm(code)));
          return a ? a.href.split("#")[0] : null;
        },
        { code, pattern: PRODUCT_URL[store].source },
      );
      if (href) found.push({ store, url: href.split("?")[0].replace(/\/ref=.*$/, "") });
    } catch {
      // A store that blocks or times out just doesn't make the list.
    }
  }
  return found;
}

// Runs inside the page.
function collect() {
  const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? [x, ...flat(x["@graph"] ?? [])] : []);
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
    try {
      return flat(JSON.parse(s.textContent));
    } catch {
      return [];
    }
  });
  const product = ld.find((x) => [x["@type"]].flat().includes("Product")) ?? null;
  const meta = (k) => document.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.content ?? null;

  const seen = new Set();
  const images = [];
  const add = (url, alt = "") => {
    if (!url || typeof url !== "string" || url.startsWith("data:")) return;
    const abs = new URL(url, location.href).href;
    if (seen.has(abs) || images.length >= 30) return;
    seen.add(abs);
    images.push({ url: abs, alt: alt.slice(0, 120) });
  };
  [product?.image].flat().forEach((i) => add(typeof i === "string" ? i : i?.url));
  add(meta("og:image"));
  // The product's own gallery (Amazon, Mercado Livre). Thumbnails are tiny; cleanPhotos turns them into full size.
  const gallery = [...document.querySelectorAll("#altImages img, .ui-pdp-gallery img")]
    .map((img) => img.dataset.zoom || img.dataset.src || img.src)
    .filter((u) => u && !u.startsWith("data:"));
  for (const img of document.querySelectorAll("img")) {
    // Amazon keeps the big version in these attributes.
    if (img.dataset.oldHires) add(img.dataset.oldHires, img.alt);
    if (img.dataset.aDynamicImage) {
      try {
        Object.keys(JSON.parse(img.dataset.aDynamicImage)).forEach((u) => add(u, img.alt));
      } catch {}
    }
    if (img.naturalWidth >= 300 && img.naturalHeight >= 300) add(img.currentSrc || img.src, img.alt);
  }

  return {
    product,
    title: meta("og:title") ?? document.title,
    // Amazon has an accessibility <h1> before the real title, so #productTitle goes first.
    h1: (document.querySelector("#productTitle") ?? document.querySelector("h1"))?.innerText.trim() || null,
    description: meta("og:description") ?? meta("description"),
    metaPrice: meta("product:price:amount"),
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    images,
    gallery,
    text: document.body.innerText.replace(/\s+\n/g, "\n").slice(0, 6000),
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome genérico curto do tipo de produto, 1 a 4 palavras, SEM marca, SEM código e SEM medidas. Ex.: 'Cafeteira elétrica', 'Jogo de panelas', 'Luminária de piso'" },
    brand: { type: "string" },
    price: { type: "number", description: "Preço atual em reais, ou 0 se não souber" },
    dims: { type: "string", description: "Dimensões físicas (comprimento x largura x altura ou diâmetro), ex.: '160 x 40 cm'. Nunca peso nem volume. Vazio se não houver" },
    description: { type: "string", description: "Uma frase curta e simpática dizendo para que serve, em português" },
    room: { type: "string", enum: ROOMS },
    coupon: { type: "string", description: "Código de cupom de desconto escrito na página, ex.: 'CASA10'. Vazio se não houver. Nunca invente" },
    photos: { type: "array", items: { type: "integer" }, maxItems: 6, description: "Índices das imagens que mostram o próprio produto, na melhor ordem, no máximo 6" },
  },
  required: ["name", "brand", "price", "dims", "description", "room", "coupon", "photos"],
};

async function extract(data) {
  const prompt = `Extraia os dados deste anúncio para uma lista de presentes de casa nova.
Título: ${data.h1 ?? data.title}
Descrição: ${data.description ?? ""}
JSON-LD Product: ${JSON.stringify(data.product ?? {}).slice(0, 2000)}
Imagens candidatas (índice: alt):
${data.images.slice(0, 20).map((im, i) => `${i}: ${(im.alt || "(sem alt)").slice(0, 60)}`).join("\n")}
Texto da página:
${data.text.slice(0, 4000)}`;
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(240_000),
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: SCHEMA,
      // Capped output: a 7B model in JSON mode can otherwise loop on an array until the request times out.
      options: { temperature: 0, num_ctx: 8192, num_predict: 700 },
      messages: [
        { role: "system", content: "Você extrai dados de produtos de páginas de lojas brasileiras. Responda só com o JSON pedido. Não invente: deixe vazio o que não estiver na página." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}. Ele está rodando? (ollama serve) O modelo ${MODEL} foi baixado? (ollama pull ${MODEL})`);
  return JSON.parse((await res.json()).message.content);
}

/** Merges page data and the model's answer. Structured data (JSON-LD, meta) beats the model for price. */
export function toDraft(url, data, ai) {
  // The page's own gallery is the best source; otherwise the images the model picked; otherwise everything found.
  const gallery = cleanPhotos(data.gallery ?? []);
  const picked = cleanPhotos((ai.photos ?? []).filter((i) => Number.isInteger(i) && data.images[i]).map((i) => data.images[i].url));
  const photos = gallery.length >= 2 ? gallery : picked.length ? picked : cleanPhotos(data.images.map((i) => i.url));
  // The listing title is what a guest pastes into the store's search, so it is the "modelo completo".
  const model = (data.product?.name || data.h1 || cleanTitle(data.title) || "").trim();
  const brand = (ai.brand || data.product?.brand?.name || "").trim();
  return {
    room: ROOMS.includes(ai.room) ? ai.room : "sala",
    name: shortName(ai.name, brand) || nameFromModel(model, brand),
    model,
    brand,
    description: (ai.description || "").trim(),
    dims: /\d\s*(kg|g|ml|l)\b/i.test(ai.dims ?? "") ? "" : (ai.dims || "").trim(),
    price: ldPrice(data.product) ?? parsePrice(data.metaPrice) ?? parsePrice(ai.price) ?? 0,
    links: [{ store: storeName(url), url: data.canonical || url, ...(couponOf(ai.coupon) ? { coupon: couponOf(ai.coupon) } : {}) }],
    // The model only picks indices from what the page had, so it can't invent URLs.
    photos: photos.slice(0, 6),
  };
}

export async function firestore() {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: "demo-casa-ny" });
  else {
    const key = new URL("../service-account.json", import.meta.url);
    if (!existsSync(key)) throw new Error("Falta o service-account.json na raiz do projeto (ou use --dry).");
    initializeApp({ credential: cert(JSON.parse(readFileSync(key, "utf8"))) });
  }
  return { db: getFirestore(), FieldValue };
}

export const saveDraft = ({ db, FieldValue }, draft, status = "draft") =>
  db.collection("gifts").add({
    ...draft, status, reservedAt: null, giverName: null, giverTier: null, byCouple: false, createdAt: FieldValue.serverTimestamp(),
  });

async function openBrowser() {
  const { chromium } = await import("playwright");
  const ctx = await chromium.launchPersistentContext(fileURLToPath(new URL("../.playwright-profile", import.meta.url)), {
    channel: "chrome", headless: false, locale: "pt-BR", viewport: { width: 1280, height: 900 },
  });
  return { ctx, page: ctx.pages()[0] ?? (await ctx.newPage()) };
}

const hasProduct = (data) => data.product || data.images.length >= 2;

/** One listing → draft. `onBlocked` runs when the page looks like a login/captcha wall, then the page is read again. */
async function importOne(page, url, onBlocked) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  let data = await page.evaluate(collect);
  if (!hasProduct(data)) {
    await onBlocked(page);
    data = await page.evaluate(collect);
  }
  if (!data.images.length && !data.product) throw new Error(`a página não trouxe dados de produto (título: "${data.title}")`);
  process.stdout.write(`  ${data.images.length} imagens, ${data.product ? "com" : "sem"} JSON-LD. Perguntando ao ${MODEL}... `);
  const draft = toDraft(page.url() || url, data, await extract(data));
  console.log("ok");
  const more = await otherStores(page, draft);
  if (more.length) console.log(`  Também em: ${more.map((l) => l.store).join(", ")}`);
  draft.links.push(...more);
  return draft;
}

async function cli(urls, dry) {
  const fs = dry ? null : await firestore();
  const { ctx, page } = await openBrowser();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async () => {
    if (process.stdin.isTTY) await rl.question("  Parece que a página pediu login ou captcha. Resolva no navegador e aperte Enter... ");
    await page.waitForTimeout(1500);
  };
  let ok = 0;
  for (const url of urls) {
    console.log(`\n→ ${url}`);
    try {
      const draft = await importOne(page, url, ask);
      console.log(JSON.stringify(draft, null, 2).replace(/^/gm, "  "));
      if (fs) console.log(`  Salvo como rascunho (${(await saveDraft(fs, draft)).id}). Revise e publique em /admin.`);
      ok++;
    } catch (e) {
      console.log(`\n  Falhou: ${e.message}`);
    }
  }
  rl.close();
  await ctx.close();
  console.log(`\n${ok} de ${urls.length} importados.`);
  process.exitCode = ok === urls.length ? 0 : 1;
}

/** Opens the importer's Chrome on each store so you can log in once; logged-in sessions get far fewer captchas. */
async function login() {
  const { ctx, page } = await openBrowser();
  await page.goto("https://www.mercadolivre.com.br/login");
  for (const u of ["https://shopee.com.br/buyer/login", "https://www.amazon.com.br/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.com.br%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=brflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0"])
    await (await ctx.newPage()).goto(u).catch(() => {});
  console.log("Faça login nas lojas que quiser nas abas do Chrome e depois feche a janela.");
  await new Promise((r) => ctx.on("close", r));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--login")) return login();
  const urls = args.filter((a) => /^https?:\/\//.test(a));
  if (!urls.length) {
    console.log("Uso: npm run importar -- [--dry] <url> [<url> ...]");
    process.exit(1);
  }
  await cli(urls, args.includes("--dry"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
