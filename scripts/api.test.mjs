import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProduct } from "./api.mjs";

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
