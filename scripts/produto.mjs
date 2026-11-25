// Saves products to the list from JSON on stdin (one object or an array). Used by the /presente skill, where
// Claude reads the store pages in the user's own Chrome and hands the result to this script.
//   node scripts/produto.mjs < produto.json        node scripts/produto.mjs --schema
import { SCHEMA, firestore, saveProduct, validateProduct } from "./api.mjs";

if (process.argv.includes("--schema")) {
  console.log(JSON.stringify(SCHEMA, null, 2));
  process.exit(0);
}
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const checked = [JSON.parse(raw)].flat().map(validateProduct);
const bad = checked.flatMap((c, index) => (c.errors ? [{ index, errors: c.errors }] : []));
// All or nothing, like POST /produtos: fix and resend the whole batch.
if (bad.length) {
  console.error(JSON.stringify({ error: "produto inválido", detalhes: bad }, null, 2));
  process.exit(1);
}
const fs = await firestore();
for (const { value } of checked) await saveProduct(fs, value);
process.exit(0);
