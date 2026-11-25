import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, normalizePhotos, validateProduct } from "./api.mjs";

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
