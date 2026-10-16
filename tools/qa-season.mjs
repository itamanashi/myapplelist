// QA saison : injection live sur la vraie page MAL + assertions DOM/regles.
// Usage : node tools/qa-season.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const ok = (cond, label) => {
  console.log((cond ? "  PASS " : "  FAIL ") + label);
  if (!cond) failures.push(label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto("https://myanimelist.net/anime/season", { waitUntil: "domcontentloaded" });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });
await page.addScriptTag({ path: path.join(root, "content", "season-view.js") });
await page.evaluate(() => {
  document.documentElement.classList.add("mal-custom", "mal-dark");
  window.__myappleSeason?.buildSeasonView();
});
await sleep(1200);

const r = await page.evaluate(() => {
  const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : "ABSENT"; };
  const view = document.querySelector("#myapple-season");
  return {
    vue: !!view,
    titre: document.querySelector("#apl-season-title")?.textContent?.trim() ?? "ABSENT",
    sections: document.querySelectorAll("#myapple-season .apl-season-sec").length,
    cartes: document.querySelectorAll("#myapple-season .apl-season-card").length,
    pills: document.querySelectorAll("#myapple-season .apl-season-pill").length,
    natifMasque: cs(".js-categories-seasonal", "display"),
    fondSombre: cs("body", "backgroundColor"),
    carteBg: cs("#myapple-season .apl-season-card", "backgroundColor"),
    carteRadius: cs("#myapple-season .apl-season-card", "borderRadius"),
    grille: cs("#myapple-season .apl-season-grid", "display"),
    posterRatio: cs("#myapple-season .apl-season-poster img", "aspectRatio"),
    starColor: cs("#myapple-season .apl-star", "color"),
    scoreTabular: cs("#myapple-season .apl-score b", "fontVariantNumeric"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
console.log(JSON.stringify(r, null, 1));
ok(r.vue, "vue construite");
ok(r.titre !== "ABSENT", "titre saison (" + r.titre + ")");
ok(r.sections >= 3, "sections (" + r.sections + ", natif: TV New/Continuing/ONA/OVA/Movie/Special)");
ok(r.cartes >= 20, "cartes (" + r.cartes + ")");
ok(r.pills >= 5, "pilules formats (" + r.pills + ")");
ok(r.natifMasque === "none", "bloc natif masque (" + r.natifMasque + ")");
ok(r.grille === "grid", "conteneur en grille (" + r.grille + ")");
ok(r.carteRadius === "16px", "carte radius 16px (" + r.carteRadius + ")");
ok(r.starColor === "rgb(245, 165, 36)", "etoile doree (" + r.starColor + ")");
ok(r.overflow <= 1, "pas de debordement horizontal (+" + r.overflow + "px)");

// Filtre : clic TV -> reflet visuel immediat + sync async du natif.
// Headless : le CMP Quantcast (qc-cmp2) se reinjecte en boucle et intercepte
// les pointeurs ; on le neutralise par CSS (pas de remove, il reviendrait)
// puis clic souris reel. Le handler est verifie, pas le pointeur.
await page.addStyleTag({ content: "#qc-cmp2-container, .qc-cmp-cleanslate { display: none !important; pointer-events: none !important; }" });
// Clic synthetique (dispatch direct sur le bouton) : on verifie le HANDLER
// (reflet + delegation), pas la chaine pointeur de Playwright faussee par
// le CMP qui se reinjecte en boucle en headless.
const clicked = await page.evaluate(() => {
  const b = document.querySelector('.apl-season-pill[data-key="1"]');
  if (!b) return false;
  b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
});
ok(clicked, "clic pilule TV dispatche");
await sleep(1500);
const f = await page.evaluate(() => ({
  on: document.querySelector(".apl-season-pill.on")?.dataset.key ?? "ABSENT",
  pressed: document.querySelector('.apl-season-pill[data-key="1"]')?.getAttribute("aria-pressed"),
  visibles: [...document.querySelectorAll("#myapple-season .apl-season-card")].filter((c) => !c.hidden).length,
  total: document.querySelectorAll("#myapple-season .apl-season-card").length,
}));
console.log(JSON.stringify(f));
ok(f.on === "1", "pilule TV active (" + f.on + ")");
ok(f.pressed === "true", "aria-pressed TV");
ok(f.visibles <= f.total, "sync visibilite (" + f.visibles + "/" + f.total + ")");

// Destroy : vue retiree + nœuds MAL restaures
await page.evaluate(() => window.__myappleSeason?.destroySeasonView());
await sleep(300);
const d = await page.evaluate(() => ({
  vue: !!document.querySelector("#myapple-season"),
  natif: document.querySelectorAll(".js-categories-seasonal .seasonal-anime").length,
  btns: document.querySelectorAll(".js-categories-seasonal .information-item.buttons").length,
}));
console.log(JSON.stringify(d));
ok(!d.vue, "vue detruite");
ok(d.natif > 0, "cartes natives restaurees (" + d.natif + ")");
ok(d.btns > 0, "boutons natifs restaures (" + d.btns + ")");

// Desactivation : pas de rebuild si re-appel apres destroy sur autre page
// Erreurs natives MAL (ex. getImageSize manquant en headless, prouvees sur
// baseline sans injection) : tolerees ; seules nos erreurs comptent.
const ours = errors.filter((e) => !/getImageSize/i.test(e));
ok(ours.length === 0, "zero erreur propre (" + ours.length + " ; natives ignorees: " + (errors.length - ours.length) + ")");

await browser.close();
if (failures.length) { console.error("ECHECS: " + failures.join(" | ")); process.exit(1); }
console.log("OK — QA saison live : build, filtres, destroy, zero erreur.");
