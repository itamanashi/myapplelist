// node tools/test-malsync.mjs — intégration MAL-Sync (streaming & liens externes).
// Fixtures = markup réel MAL-Sync (MALSync/MALSync myanimelistClass.ts : malToKiss,
// streamingUI, pageRelation) : h2.mal_links + div.mal_links + br.mal_links,
// .remove-mal-sync, #mal-sync-stream-div, icônes img-only [title] en nav.
// Couvre : détection des groupes, liens externes (natifs exclus), libellé lié
// nettoyé du badge de statut, déplacement avec handlers préservés (clic [x]),
// marquage réclamé (pas de doublon), carte absente si rien, rendu ext 24px.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.setContent(`<body><div id="fx">
<div id="content">
<div class="breadcrumb"><div class="data title progress" id="mal-sync-stream-div"><a class="mal-sync-stream" title="voir-anime.com" href="https://voir-anime.com/r" target="_blank"><img src="https://favicon.malsync.moe/?domain=voir-anime.com"></a></div></div>
<div id="horiznav_nav"><ul>
<li><a href="/anime/41457/86">Details</a></li>
<li><a href="https://anilist.co/anime/153679" title="AniList" class="link"><img src="https://anilist.co/img/icons/favicon-32x32.png" width="16"></a></li>
</ul></div>
<div class="leftside">
<h2>Information</h2>
<h2 id="Voir-AnimeLinks" class="mal_links"><img src="https://favicon.malsync.moe/?domain=voir-anime.com"> Voir-Anime<span title="Voir-Anime" class="remove-mal-sync">x</span></h2>
<div class="mal_links"><a target="_blank" href="https://voir-anime.com/ep1">Episode 1</a></div>
<div class="mal_links"><a target="_blank" href="https://voir-anime.com/ep2">Episode 2</a></div>
<br class="mal_links">
<h2 id="ADKamiLinks" class="mal_links"><img src="https://favicon.malsync.moe/?domain=adkami.com"> ADKami<span title="ADKami" class="remove-mal-sync">x</span></h2>
<div class="mal_links"><a target="_blank" href="https://adkami.com/x">ADKami</a></div>
<br class="mal_links">
</div>
<div class="related-entries"><div class="entry"><div class="relation">Sequel (TV)</div><div class="image"><img alt="86 Part 2"></div><div class="content"><a href="https://myanimelist.net/anime/48569/86_Part_2">86 Part 2<span class="maltag">Completed</span></a></div></div></div>
</div>
<div id="side"></div><div id="who"></div><div id="empty"></div>
</div></body>`);
await page.addScriptTag({ path: path.join(root, "content", "anime-view.js") });

const r = await page.evaluate(() => {
  const A = window.__myappleAnime;
  const g = (id) => document.getElementById(id);
  const content = g("content");
  const groups = A._malsyncGroups(content);
  const ext = A._malsyncExt(content);
  const out = {
    groups: groups.map((x) => ({ head: x.head.textContent.replace(/\s+/g, " ").trim(), nodes: x.nodes.map((n) => n.tagName) })),
    ext: ext.map((l) => ({ name: l.name, href: l.href.slice(0, 40), icon: l.icon.slice(0, 45) })),
    label: A._relatedLabel(content.querySelector(".related-entries a"), content.querySelector(".related-entries img")),
  };
  // Handler direct façon MAL-Sync (jQuery .click) AVANT déplacement
  let clicks = 0;
  content.querySelectorAll(".remove-mal-sync").forEach((x) => x.addEventListener("click", () => { clicks++; }));
  // Rendu carte latérale
  const body = A._renderStream(g("side"), groups);
  out.card = !!document.getElementById("apl-sec-stream");
  out.moved = document.querySelectorAll("#apl-sec-stream h2.mal_links").length;
  out.pills = [...document.querySelectorAll("#apl-sec-stream div.mal_links a")].map((a) => a.textContent.trim());
  out.leftH2 = content.querySelectorAll(".leftside h2.mal_links").length;
  // Clic [x] après déplacement : le handler d'origine suit le nœud
  document.querySelector("#apl-sec-stream .remove-mal-sync")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.clicks = clicks;
  out.removeTitle = document.querySelector("#apl-sec-stream .remove-mal-sync")?.getAttribute("title") || null;
  // Re-balayage : rien de neuf (tout réclamé)
  out.regroup = A._malsyncGroups(content).length;
  // Rangée externe
  A._renderExt(g("who"), A._malsyncExt(content));
  out.extRow = [...document.querySelectorAll("#who .apl-ext a")].map((a) => a.title + "|" + a.target);
  // Cas absent : rien, aucune carte
  out.absentGroups = A._malsyncGroups(g("empty")).length;
  out.absentExt = A._malsyncExt(g("empty")).length;
  out.absentCard = A._renderStream(g("side"), []);
  return out;
});

// 1. Deux groupes détectés (Voir-Anime : 2 liens + br ; ADKami : 1 lien + br)
assert.equal(r.groups.length, 2);
assert.match(r.groups[0].head, /Voir-Anime/);
assert.deepEqual(r.groups[0].nodes, ["DIV", "DIV", "BR"]);
assert.deepEqual(r.groups[1].nodes, ["DIV", "BR"]);
// 2. Liens externes : AniList + reprise (Details natif exclu : sans title)
assert.deepEqual(r.ext.map((l) => l.name), ["AniList", "voir-anime.com"]);
assert.ok(r.ext[0].href.startsWith("https://anilist.co/"));
// 3. Libellé lié nettoyé du badge de statut MAL-Sync
assert.equal(r.label, "86 Part 2");
// 4. Carte latérale créée, nœuds DÉPLACÉS (source vidée), pills présents
assert.equal(r.card, true);
assert.equal(r.moved, 2);
assert.deepEqual(r.pills, ["Episode 1", "Episode 2", "ADKami"]);
assert.equal(r.leftH2, 0);
// 5. Clic [x] post-déplacement : handler d'origine intact + title préservé
assert.equal(r.clicks, 1);
assert.equal(r.removeTitle, "Voir-Anime");
// 6. Re-balayage : aucun doublon
assert.equal(r.regroup, 0);
// 7. Rangée externe 24px : tooltips + target blank
assert.deepEqual(r.extRow, ["AniList|_blank", "voir-anime.com|_blank"]);
// 8. Absent : rien, carte null
assert.equal(r.absentGroups, 0);
assert.equal(r.absentExt, 0);
assert.equal(r.absentCard, null);

await browser.close();
console.log("OK — MAL-Sync : 8 cas (groupes, externes, libellé, déplacement+clic, doublons, rangée, absent).");
