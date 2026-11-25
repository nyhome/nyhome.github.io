// Sends reservation e-mails and expires reservations whose 72h ran out. Runs every 15 min in GitHub Actions
// (.github/workflows/mailer.yml) and is safe to re-run: each e-mail is flagged on the reservation once sent.
//
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAILS (comma-separated), SITE_URL.
// Local dry run against the emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8177 DRY_RUN=1 node scripts/mailer.mjs
// The repo is public, so Actions logs are too: log counts only, never names, e-mails or tokens.
import { fileURLToPath } from "node:url";

const H = 3600_000;
// Same 72h as hold() in firestore.rules and HOLD_HOURS in src/lib/catalog.ts.
export const HOLD_MS = 72 * H;
export const REMINDER_MS = 48 * H;
const MAX_PER_RUN = 30;

/** What a pending reservation needs now. Pure, so it's tested in mailer.test.mjs. */
export function due(res, now) {
  const age = now - res.reservedAt;
  if (age >= HOLD_MS) return "expire";
  if (!res.mailed?.welcome) return "welcome";
  if (age >= REMINDER_MS && !res.mailed?.reminder) return "reminder";
  return null;
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const when = (ms) =>
  new Date(ms).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

const first = (name) => String(name).trim().split(/\s+/)[0];

function layout(body) {
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px;color:#36402a;background:#f5f1e5;line-height:1.5">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5c6450;margin:0 0 16px">Casa N&amp;Y · Lista de presentes</p>
${body}
<p style="font-size:13px;color:#5c6450;margin-top:32px">Com carinho, Nathália e Yago.</p></div>`;
}

const button = (href, label) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#36402a;color:#f5f1e5;padding:12px 22px;border-radius:4px;text-decoration:none;font-family:Arial,sans-serif;font-size:15px">${esc(label)}</a></p>`;

function giftDetails(gift, delivery) {
  const links = (gift.links ?? [])
    .map(
      (l) =>
        `<li><a href="${esc(l.url)}" style="color:#36402a">${esc(l.store)}</a>${l.coupon ? ` · cupom <strong>${esc(l.coupon)}</strong>` : ""}</li>`,
    )
    .join("");
  return `${gift.voltage ? `<p><strong>Voltagem: ${esc(gift.voltage)}</strong>${gift.voltage === "Bivolt" ? "" : " (confira na loja antes de comprar)"}</p>` : ""}
${gift.model ? `<p><strong>Modelo completo:</strong> ${esc(gift.model)}<br><span style="font-size:13px;color:#5c6450">Ao buscar pelo modelo, confira se é exatamente este. Às vezes a loja sugere produtos parecidos.</span></p>` : ""}
${links ? `<p style="margin-bottom:4px"><strong>Onde comprar</strong></p><ul style="margin-top:0">${links}</ul>` : ""}
${delivery?.address ? `<div style="border:1px solid #d9d6c3;border-radius:4px;padding:14px;margin-top:16px">
<p style="margin-top:0"><strong>Como enviar o presente</strong></p>
<p>Você pode receber em casa e nos entregar pessoalmente, ou mandar direto para o nosso endereço. Se for enviar, coloque o destinatário como <strong>${esc(delivery.recipient)}</strong>, para a entrega chegar certinho.</p>
<p style="margin-bottom:0;white-space:pre-line">${esc(delivery.recipient)}\n${esc(delivery.address)}</p></div>` : ""}`;
}

export function compose(kind, { res, gift, delivery, site }) {
  const link = `${site}/reserva?t=${res.token}`;
  const ends = when(res.reservedAt + HOLD_MS);
  const name = esc(gift?.name ?? "o presente");
  if (kind === "welcome")
    return {
      subject: `Você reservou: ${gift?.name ?? "um presente"}`,
      html: layout(`<h1 style="font-weight:400">Obrigado, ${esc(first(res.name))}!</h1>
<p><strong>${name}</strong> está reservado para você até <strong>${esc(ends)}</strong>. Compre na loja e depois volte pelo seu link para marcar <strong>Já comprei</strong>, ou para desistir se mudar de ideia.</p>
${button(link, "Já comprei / desistir")}
${giftDetails(gift ?? {}, delivery)}
<p style="font-size:13px;color:#5c6450">Este link é só seu. Se a compra não for confirmada até o fim do prazo, o presente volta para a lista.</p>`),
    };
  if (kind === "reminder")
    return {
      subject: `Faltam 24 horas: ${gift?.name ?? "sua reserva"}`,
      html: layout(`<h1 style="font-weight:400">Oi, ${esc(first(res.name))}</h1>
<p>Sua reserva de <strong>${name}</strong> vale até <strong>${esc(ends)}</strong>. Se já comprou, confirme pelo link. Se desistiu, libere o presente para outra pessoa.</p>
${button(link, "Já comprei / desistir")}
${giftDetails(gift ?? {}, delivery)}`),
    };
  if (kind === "expired")
    return {
      subject: `Sua reserva expirou: ${gift?.name ?? "presente"}`,
      html: layout(`<h1 style="font-weight:400">Oi, ${esc(first(res.name))}</h1>
<p>O prazo de 72 horas da sua reserva de <strong>${name}</strong> acabou e ele voltou para a lista. Se você já comprou, é só responder este e-mail que a gente acerta tudo por aqui.</p>
${button(site, "Ver a lista de presentes")}`),
    };
  if (kind === "admin")
    return {
      subject: `${first(res.name)} comprou ${gift?.name ?? "um presente"}`,
      html: layout(`<p><strong>${esc(res.name)}</strong> (${esc(res.tier)}, ${esc(res.email)}) confirmou a compra de <strong>${name}</strong>.</p>
${button(`${site}/admin`, "Abrir o painel")}`),
    };
  throw new Error(`unknown e-mail kind ${kind}`);
}

async function main() {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulator && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Until the repo secrets exist, the 15-min cron would fail (and e-mail a failure) every run.
    console.log("not configured: FIREBASE_SERVICE_ACCOUNT is missing");
    return;
  }
  initializeApp(
    emulator
      ? { projectId: process.env.GCLOUD_PROJECT ?? "demo-casa-ny" }
      : { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")) },
  );
  const db = getFirestore();
  const dry = process.env.DRY_RUN === "1";
  const site = (process.env.SITE_URL ?? "https://nyhome.github.io").replace(/\/$/, "");
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  let transport = null;
  if (!dry) {
    const { createTransport } = await import("nodemailer");
    transport = createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  }
  let sent = 0;
  const send = async (to, { subject, html }) => {
    if (sent >= MAX_PER_RUN) throw new Error("cap");
    sent++;
    if (dry) return console.log(`[dry] ${subject} (${html.length} bytes)`);
    await transport.sendMail({ from: `Casa N&Y <${process.env.GMAIL_USER}>`, to, subject, html });
  };

  const deliverySnap = await db.doc("settings/delivery").get();
  const delivery = deliverySnap.exists ? deliverySnap.data() : null;
  const giftCache = new Map();
  const giftOf = async (id) => {
    if (!giftCache.has(id)) {
      const s = await db.doc(`gifts/${id}`).get();
      giftCache.set(id, s.exists ? s.data() : null);
    }
    return giftCache.get(id);
  };

  const now = Date.now();
  const counts = { welcome: 0, reminder: 0, expired: 0, admin: 0, failed: 0 };

  const pending = await db.collection("reservations").where("status", "==", "reserved").get();
  for (const snap of pending.docs) {
    const res = { token: snap.id, ...snap.data(), reservedAt: snap.data().reservedAt.toMillis() };
    const kind = due(res, now);
    if (!kind) continue;
    try {
      const gift = await giftOf(res.giftId);
      if (kind === "expire") {
        // Free the gift only if it is still this reservation's (same reservedAt); someone may have re-reserved it.
        await db.runTransaction(async (tx) => {
          const g = await tx.get(db.doc(`gifts/${res.giftId}`));
          const r = await tx.get(snap.ref);
          if (r.data().status !== "reserved") return;
          if (g.exists && g.data().status === "reserved" && g.data().reservedAt?.toMillis() === res.reservedAt) {
            tx.update(g.ref, { status: "available", reservedAt: null, giverName: null, giverTier: null });
            tx.delete(db.doc(`giftLocks/${res.giftId}`));
          }
          tx.update(snap.ref, { status: "expired", closedAt: FieldValue.serverTimestamp() });
        });
        // shortcut: e-mailed after the commit, so a crash right here loses this one notice; fine for a courtesy note
        await send(res.email, compose("expired", { res, gift, delivery, site }));
        await snap.ref.update({ "mailed.expired": true });
        counts.expired++;
      } else {
        await send(res.email, compose(kind, { res, gift, delivery, site }));
        await snap.ref.update({ [`mailed.${kind}`]: true });
        counts[kind]++;
      }
    } catch (e) {
      if (e.message === "cap") break;
      counts.failed++;
      console.error(`reservation failed: ${e.code ?? e.name}`);
    }
  }

  const bought = await db.collection("reservations").where("status", "==", "bought").where("adminNotified", "==", false).get();
  for (const snap of bought.docs) {
    if (!admins.length) break;
    const res = { token: snap.id, ...snap.data(), reservedAt: snap.data().reservedAt.toMillis() };
    try {
      await send(admins.join(","), compose("admin", { res, gift: await giftOf(res.giftId), delivery, site }));
      await snap.ref.update({ adminNotified: true });
      counts.admin++;
    } catch (e) {
      if (e.message === "cap") break;
      counts.failed++;
      console.error(`admin notice failed: ${e.code ?? e.name}`);
    }
  }

  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
