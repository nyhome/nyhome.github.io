import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPhotos, cleanTitle, nameFromModel, ldPrice, parsePrice, shortName, storeName, toDraft } from "./importar.mjs";

test("storeName maps known stores and title-cases the rest", () => {
  assert.equal(storeName("https://www.amazon.com.br/dp/X"), "Amazon");
  assert.equal(storeName("https://produto.mercadolivre.com.br/MLB-1"), "Mercado Livre");
  assert.equal(storeName("https://shopee.com.br/x"), "Shopee");
  assert.equal(storeName("https://www.camicado.com.br/p"), "Camicado");
});

test("parsePrice reads pt-BR and dotted prices", () => {
  assert.equal(parsePrice("R$ 1.299,90"), 1299.9);
  assert.equal(parsePrice("1299.90"), 1299.9);
  assert.equal(parsePrice(89), 89);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("grátis"), null);
});

test("ldPrice handles offer lists and lowPrice", () => {
  assert.equal(ldPrice({ offers: { price: "249.9" } }), 249.9);
  assert.equal(ldPrice({ offers: [{ lowPrice: 100 }, { price: 120 }] }), 100);
  assert.equal(ldPrice({}), null);
});

test("toDraft keeps only real image indices and prefers structured price over the model's", () => {
  const data = {
    title: "Cafeteira X", product: { offers: { price: "399" } }, metaPrice: null, canonical: "https://a.co/c",
    images: [{ url: "https://img/1" }, { url: "https://img/2" }],
  };
  const d = toDraft("https://www.amazon.com.br/x", data, {
    name: "Cafeteira", brand: "Oster", price: 999, dims: "", description: "Café", room: "cozinha", photos: [1, 7, 1],
  });
  assert.equal(d.model, "Cafeteira X");
  assert.deepEqual(d.photos, ["https://img/2"]);
  assert.equal(d.price, 399);
  assert.deepEqual(d.links, [{ store: "Amazon", url: "https://a.co/c" }]);
  assert.equal(d.room, "cozinha");
  assert.equal(toDraft("https://x.com", { ...data, images: data.images }, { photos: [], room: "garagem" }).room, "sala");
});

test("cleanPhotos drops sprites and collapses Amazon sizes to the full image", () => {
  assert.deepEqual(
    cleanPhotos([
      "https://m.media-amazon.com/images/G/32/gno/sprites/nav-sprite-global-1x._CB546817485_.png",
      "https://m.media-amazon.com/images/I/51vVvDVetDL._AC_SL1000_.jpg",
      "https://m.media-amazon.com/images/I/51vVvDVetDL._AC_SY355_.jpg",
      "https://http2.mlstatic.com/D_NQ_NP_2X_123-F.webp",
    ]),
    ["https://m.media-amazon.com/images/I/51vVvDVetDL.jpg", "https://http2.mlstatic.com/D_NQ_NP_2X_123-F.webp"],
  );
});

test("cleanTitle and shortName", () => {
  assert.equal(cleanTitle("Cafeteira Oster OCAF650 : Amazon.com.br: Cozinha"), "Cafeteira Oster OCAF650");
  assert.equal(cleanTitle("Jogo De Panelas Tramontina | Mercado Livre"), "Jogo De Panelas Tramontina");
  assert.equal(shortName("Cafeteira elétrica"), "Cafeteira elétrica");
  assert.equal(shortName("Oster Cafeteira Oster", "Oster"), "Cafeteira");
  assert.equal(shortName("Oster Cafeteira Oster com Jarra Inox 1,2L, OCAF650, 127V"), "");
});

test("nameFromModel strips the brand and cuts at the first detail", () => {
  assert.equal(nameFromModel("Oster Cafeteira Oster com Jarra Inox 1,2L, OCAF650, 127V", "Oster"), "Cafeteira");
  assert.equal(nameFromModel("Jogo de Panelas Tramontina Paris 5 peças", "Tramontina"), "Jogo de Panelas");
  assert.equal(nameFromModel("Luminária Piso Arco Preta 160cm", ""), "Luminária Piso Arco");
});
