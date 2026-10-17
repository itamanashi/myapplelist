// Build CSS : concatène content/css/*.css -> content/overlay.css (bundle généré).
// Source de vérité = les modules. Ne jamais éditer overlay.css à la main.
// Usage : node tools/build-css.mjs [--check]  (--check : échoue si le bundle n'est pas à jour)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssDir = join(root, "content", "css");
const out = join(root, "content", "overlay.css");

// Ordre d'injection = ordre du manifest avant (tokens -> base -> vues -> a11y en dernier
// pour que les garde-fous focus/reduced-motion gagnent en cas de conflit).
const MODULES = [
  "00-tokens.css",
  "10-base.css",
  "20-topbar.css",
  "30-panel.css",
  "40-profile.css",
  "50-a11y.css",
  "60-lists.css",
  "70-anime-detail.css",
  "80-season.css",
   "90-people.css",
];

const HEADER =
  "/* MyAppleList — bundle GENERE. Ne pas editer : modifier content/css/*.css puis `node tools/build-css.mjs`. */\n";

const parts = MODULES.map((m) => {
  const body = readFileSync(join(cssDir, m), "utf8");
  const opens = (body.match(/\{/g) || []).length;
  const closes = (body.match(/\}/g) || []).length;
  if (opens !== closes) throw new Error(`${m} : accolades desequilibrees (${opens}/${closes})`);
  return body.trimEnd() + "\n";
});
const bundle = HEADER + parts.join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(out, "utf8");
  if (current !== bundle) {
    console.error("overlay.css pas a jour : lance `node tools/build-css.mjs`.");
    process.exit(1);
  }
  console.log(`OK : overlay.css a jour (${MODULES.length} modules, ${bundle.split("\n").length} lignes).`);
} else {
  writeFileSync(out, bundle, "utf8");
  console.log(`OK : overlay.css regenere (${MODULES.length} modules, ${bundle.split("\n").length} lignes).`);
}
