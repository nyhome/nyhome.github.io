import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, mergeUpdate, normalizePhotos, validateProduct } from "./api.mjs";

const ok = {
  name: "Cafeteira", model: "Oster OCAF650 127V", room: "cozinha", price: 130.05,
  links: [{ store: "Amazon", url: "https://www.amazon.com.br/dp/B002NLADVU", coupon: "casa10" }],
  photos: ["https://m.media-amazon.com/images/I/51vVvDVetDL.jpg", "not-a-url"],
};

test("a valid product is normalized and published by default", () => {
  const { value, errors } = validateProduct(ok);
  assert.equal(errors, undefined);
  assert.equal(value.status, "available");
  assert.equal(value.links[0].coupon, "CASA10");
  assert.deepEqual(value.photos, ["https://m.media-amazon.com/images/I/51vVvDVetDL.jpg"]);
  assert.equal(value.brand, "");
});

test("links without coupon carry no coupon key (Firestore rejects undefined)", () => {
  const { value } = validateProduct({ ...ok, links: [{ store: "Amazon", url: "https://a.co/x" }] });
  assert.deepEqual(value.links, [{ store: "Amazon", url: "https://a.co/x" }]);
});

test("missing or wrong fields are reported, not saved", () => {
  const { errors } = validateProduct({ name: "", room: "garagem", price: -1, links: [{ url: "ftp://x" }] });
  assert.ok(errors.some((e) => e.startsWith("name")));
  assert.ok(errors.some((e) => e.startsWith("room")));
  assert.ok(errors.some((e) => e.startsWith("price")));
  assert.ok(errors.some((e) => e.includes("links[0].url")));
  assert.ok(errors.some((e) => e.includes("links[0].store")));
  assert.deepEqual(validateProduct([ok]).errors, ["o produto precisa ser um objeto JSON"]);
  assert.ok(validateProduct({ ...ok, status: "sold" }).errors);
});

test("price as a pt-BR string and draft status are accepted", () => {
  const { value } = validateProduct({ ...ok, price: "129,90", status: "draft" });
  assert.equal(value.price, 129.9);
  assert.equal(value.status, "draft");
});

test("allowed: only non-browser clients on this Mac can post", () => {
  const post = (headers) => allowed({ method: "POST", headers: { host: "127.0.0.1:4321", "content-type": "application/json", ...headers } }, 4321);
  assert.equal(post({}), true);
  assert.equal(post({ origin: "http://127.0.0.1:4321" }), true);
  assert.equal(post({ origin: "https://evil.example" }), false);
  assert.equal(post({ origin: "null" }), false);
  assert.equal(post({ origin: "chrome-extension://abcdef" }), false);
  assert.equal(post({ "content-type": "text/plain" }), false);
  assert.equal(post({ host: "evil.example:4321" }), false);
  assert.equal(allowed({ method: "GET", headers: { host: "localhost:4321" } }, 4321), true);
});


test("normalizePhotos keeps one sharp copy of each photo", () => {
  assert.deepEqual(
    normalizePhotos([
      "https://m.media-amazon.com/images/I/51vVvDVetDL._AC_SX300_.jpg",
      "https://m.media-amazon.com/images/I/51vVvDVetDL._AC_SL1500_.jpg",
      "https://http2.mlstatic.com/D_Q_NP_620123-MLB71234_092023-R.webp",
      "https://http2.mlstatic.com/D_NQ_NP_2X_620123-MLB71234_092023-F.webp",
      "https://down-br.img.susercontent.com/file/br-11134207-abc_tn",
      "https://down-br.img.susercontent.com/file/br-11134207-abc",
      "https://loja.com/foto1.jpg",
      "https://loja.com/foto1.jpg",
    ]),
    [
      "https://m.media-amazon.com/images/I/51vVvDVetDL.jpg",
      "https://http2.mlstatic.com/D_NQ_NP_2X_620123-MLB71234_092023-F.webp",
      "https://down-br.img.susercontent.com/file/br-11134207-abc",
      "https://loja.com/foto1.jpg",
    ],
  );
});

test("voltage is optional and normalized from how an AI tends to write it", () => {
  assert.equal(validateProduct(ok).value.voltage, undefined);
  assert.equal(validateProduct({ ...ok, voltage: "127" }).value.voltage, "127V");
  assert.equal(validateProduct({ ...ok, voltage: "220 v" }).value.voltage, "220V");
  assert.equal(validateProduct({ ...ok, voltage: "bivolt" }).value.voltage, "Bivolt");
  assert.ok(validateProduct({ ...ok, voltage: "110V" }).errors);
});

test("mergeUpdate changes only price/links/status, normalized, and never a held gift's status", () => {
  const current = { ...ok, status: "available", voltage: "127V", byCouple: false };
  const { update } = mergeUpdate(current, { price: "119,90", links: [{ store: "Amazon", url: "https://amzn.to/novo", coupon: "off5" }] });
  assert.deepEqual(update, { price: 119.9, links: [{ store: "Amazon", url: "https://amzn.to/novo", coupon: "OFF5" }] });
  assert.deepEqual(mergeUpdate(current, { status: "draft" }).update, { status: "draft" });
  assert.ok(mergeUpdate(current, { name: "Outro" }).errors[0].includes("recusado: name"));
  assert.ok(mergeUpdate(current, { links: [] }).errors);
  assert.ok(mergeUpdate({ ...current, status: "reserved" }, { status: "draft" }).errors);
  assert.deepEqual(mergeUpdate({ ...current, status: "bought" }, { price: 99 }).update, { price: 99 });
});

test("quantity defaults to 1, must be a whole number, and can't drop below units already taken", () => {
  assert.equal(validateProduct(ok).value.quantity, 1);
  assert.equal(validateProduct({ ...ok, quantity: "3" }).value.quantity, 3);
  assert.ok(validateProduct({ ...ok, quantity: 0 }).errors);
  assert.ok(validateProduct({ ...ok, quantity: 2.5 }).errors);
  const current = { ...ok, status: "available", quantity: 3, boughtUnits: 1, heldUnits: 1 };
  assert.deepEqual(mergeUpdate(current, { quantity: 4 }).update, { quantity: 4 });
  assert.ok(mergeUpdate(current, { quantity: 1 }).errors[0].includes("2 unidades"));
});

test("mergeUpdate won't hide a gift that has active reservations", () => {
  const current = { ...ok, status: "available", quantity: 3, boughtUnits: 0, heldUnits: 1 };
  assert.ok(mergeUpdate(current, { status: "draft" }).errors[0].includes("reservas ativas"));
  assert.deepEqual(mergeUpdate(current, { price: 50 }).update, { price: 50 });
});
