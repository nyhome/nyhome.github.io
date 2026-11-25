// The list from the command line, for the Claude skills that read store pages in the user's own Chrome.
//   node scripts/produto.mjs < produto.json          create products (one object or an array)   → /presente
//   node scripts/produto.mjs listar                  every gift as JSON, oldest price check first  → /atualizar-presentes
//   node scripts/produto.mjs atualizar <id> < x.json refresh price/links/status of one gift        → /atualizar-presentes
//   node scripts/produto.mjs --schema
import { SCHEMA, firestore, listGifts, saveProduct, updateGift, validateProduct } from "./api.mjs";

const [cmd, id] = process.argv.slice(2);
const stdin = async () => {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
};
const fail = (body) => {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
};

if (cmd === "--schema") {
  console.log(JSON.stringify(SCHEMA, null, 2));
  process.exit(0);
}

if (cmd === "listar") {
  console.log(JSON.stringify(await listGifts(await firestore()), null, 2));
  process.exit(0);
}

if (cmd === "atualizar") {
  if (!id) fail({ error: "uso: node scripts/produto.mjs atualizar <id> < atualizacao.json" });
  const result = await updateGift(await firestore(), id, await stdin());
  if (result.errors) fail({ error: "atualização inválida", detalhes: result.errors });
  process.exit(0);
}

const checked = [await stdin()].flat().map(validateProduct);
const bad = checked.flatMap((c, index) => (c.errors ? [{ index, errors: c.errors }] : []));
// All or nothing, like POST /produtos: fix and resend the whole batch.
if (bad.length) fail({ error: "produto inválido", detalhes: bad });
const fs = await firestore();
for (const { value } of checked) await saveProduct(fs, value);
process.exit(0);
