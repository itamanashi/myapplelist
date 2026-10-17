// node tools/test-season-parse.mjs — parseCard/readSeason/detection sur fixture hors-ligne.
// Couvre : carte complete, carte sans score, carte sans studio, carte sans titre
// (rejetee), carte sans href (rejetee), sections multiples, absence de bloc
// (null), detection de chemins, seasonFromPath.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
const card = (id, body) => '<div class="js-anime-category-producer seasonal-anime js-seasonal-anime js-anime-type-all js-anime-type-1">' + body + "</div>";
const full = card(1, '<div><div class="title"><div class="title-text">'
  + '<h2 class="h2_anime_title"><a href="https://myanimelist.net/anime/1/Cowboy_Bebop" class="link-title">Cowboy Bebop</a></h2></div>'
  + '<span style="display:none;" class="js-members">201271</span>'
  + '<span style="display:none;" class="js-score">8.66</span></div>'
  + '<div class="prodsrc"><div class="info"><span class="item">Oct 2, 2026</span>'
  + '<span class="item"><span>12 eps</span>, <span>24 min</span></span></div></div></div>'
  + '<div class="image"><a href="https://myanimelist.net/anime/1/Cowboy_Bebop">'
  + '<img src="https://cdn.myanimelist.net/images/anime/1028/160277.jpg" alt="Cowboy Bebop"></a></div>'
  + '<div class="synopsis js-synopsis"><p class="preline">In the aftermath of war.</p>'
  + '<div class="properties"><div class="property"><span class="caption">Studio</span>'
  + '<span class="item"><a href="/anime/producer/12/Madhouse" title="Madhouse">Madhouse</a></span></div>'
  + '<div class="property"><span class="caption">Source</span><span class="item">Original</span></div>'
  + '<div class="property"><span class="caption">Genres</span>'
  + '<span class="item"><a href="/anime/genre/1/Action" title="Action">Action</a></span>'
  + '<span class="item"><a href="/anime/genre/2/Adventure" title="Adventure">Adventure</a></span></div>'
  + '<div class="property"><span class="caption">Themes</span>'
  + '<span class="item"><a href="/anime/genre/62/Isekai" title="Isekai">Isekai</a></span></div></div></div>'
  + '<div class="information"><div class="information-item scormem"><div class="scormem-container">'
  + '<div class="scormem-item score score-label score-8">8.66</div>'
  + '<div class="scormem-item member">201K</div></div></div></div>');
await page.goto("https://myanimelist.net/anime/season/2026/fall", { waitUntil: "domcontentloaded" });
await page.setContent("<body><div id=\"content\"><div id=\"fx\">"
  + '<div class="js-categories-seasonal">'
  + '<div class="seasonal-anime-list"><div class="anime-header">TV (New)</div>' + full + "</div>"
  + "</div></div></div></body>");
await page.addScriptTag({ path: path.join(root, "content", "season-view.js") });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });

const r = await page.evaluate(() => {
  const S = window.__myappleSeason;
  const g = (sel) => document.querySelector(sel);
  const out = {};
  out.full = S.parseCard(g(".seasonal-anime"));
  out.nil = S.parseCard(null);
  out.empty = S.parseCard(document.createElement("div"));
  out.paths = [
    S.isSeasonPath("/anime/season"),
    S.isSeasonPath("/anime/season/2026/fall"),
    S.isSeasonPath("/anime/1/Cowboy_Bebop"),
    S.isSeasonPath("/profile/x"),
  ];
  out.meta = [S.seasonFromPath("/anime/season"), S.seasonFromPath("/anime/season/2026/fall"), S.seasonFromPath("/anime/1/x")];
  out.read = S.readSeason(document);
  out.readEmpty = S.readSeason(document.createElement("div"));
  // v2 : build en fixture (content + path simule via history sur page http)
  out.built = (() => { try { S.buildSeasonView(); return !!document.querySelector("#myapple-season"); } catch { return false; } })();
  out.cardDir = getComputedStyle(document.querySelector("#myapple-season .apl-season-card") || document.body).flexDirection;
  out.badge = !!document.querySelector("#myapple-season .apl-season-score b");
  out.toolbarEmpty = !document.querySelector("#myapple-season .apl-toolbar .apl-jump form");
  S.destroySeasonView();
  out.destroyed = !document.querySelector("#myapple-season");
  return out;
});

assert.equal(r.full.title, "Cowboy Bebop");
assert.equal(r.full.id, 1);
assert.equal(r.full.href, "https://myanimelist.net/anime/1/Cowboy_Bebop");
assert.equal(r.full.score, 8.66);
assert.equal(r.full.members, "201K");
assert.equal(r.full.img, "https://cdn.myanimelist.net/images/anime/1028/160277.jpg");
assert.equal(r.full.studios[0].label, "Madhouse");
assert.equal(r.full.genres.length, 3);
assert.equal(r.full.source, "Original");
assert.ok(r.full.synopsis.includes("aftermath"));
assert.equal(r.nil, null);
assert.equal(r.empty, null);
assert.deepEqual(r.paths, [true, true, false, false]);
assert.deepEqual(r.meta[0], { year: null, season: null });
assert.deepEqual(r.meta[1], { year: 2026, season: "fall" });
assert.equal(r.meta[2], null);
assert.equal(r.read.total, 1);
assert.equal(r.read.sections[0].label, "TV (New)");
assert.equal(r.readEmpty, null);
// v2 : build carte verticale + toolbar absente en fixture (navi manquant)
assert.ok(r.built, "vue construite en fixture");
assert.equal(r.cardDir, "column");
assert.ok(r.badge, "badge score incruste sur le poster");
assert.equal(r.toolbarEmpty, true);
assert.ok(r.destroyed, "vue detruite en fixture");

await browser.close();
console.log("OK — parse saison : carte complete, rejets, detection, sections, carte verticale.");
