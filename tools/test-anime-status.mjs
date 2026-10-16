// node tools/test-anime-status.mjs — lecture du VRAI statut liste depuis le DOM natif MAL.
// Fixtures = structures réelles observées live (verified 2026-10-16) :
//   div.user-status-block + select#myinfo_status / #myinfo_score + inputs myinfo_*.
// Couvre : anime Completed (2), manga Reading (1), hors-liste (null),
// fallback legacy ul.user-status, totaux bloc (data-num), labels statuts/scores.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.setContent(`<body><div id="fx">
<div id="c-anime"><div class="user-status-block">
<input type="hidden" id="myinfo_anime_id" value="41457">
<select name="myinfo_status" id="myinfo_status"><option value="1">Watching</option><option selected="selected" value="2">Completed</option><option value="3">On-Hold</option><option value="4">Dropped</option><option value="6">Plan to Watch</option></select>
<select name="myinfo_score" id="myinfo_score"><option value="0">Select</option><option value="10">(10) Masterpiece</option><option selected="selected" value="8">(8) Very Good</option><option value="1">(1) Appalling</option></select>
Episodes: <input type="text" id="myinfo_watchedeps" value="11">/<span id="curEps" data-num="11">11</span>
</div></div>
<div id="c-manga"><div class="user-status-block" data-type="manga">
<input type="hidden" id="myinfo_manga_id" value="1303">
<select name="myinfo_status" id="myinfo_status"><option selected="selected" value="1">Reading</option><option value="2">Completed</option><option value="3">On-Hold</option><option value="4">Dropped</option><option value="6">Plan to Read</option></select>
<select name="myinfo_score" id="myinfo_score"><option selected="selected" value="0">Select</option><option value="10">(10) Masterpiece</option></select>
Volumes: <input type="text" id="myinfo_volumes" value="0">/<span id="totalVols" data-num="20">20</span>
Chapters: <input type="text" id="myinfo_chapters" value="1">/<span id="totalChaps" data-num="171">171</span>
</div></div>
<div id="c-empty"><p>rien ici</p></div>
<div id="c-legacy"><ul class="user-status"><li><a href="/animelist/x?status=1">W</a></li><li class="selected"><a href="/animelist/x?status=6">P</a></li></ul><span id="curEps">3</span></div>
</div></body>`);
await page.addScriptTag({ path: path.join(root, "content", "anime-view.js") });

const r = await page.evaluate(() => {
  const A = window.__myappleAnime;
  const g = (id) => document.getElementById(id);
  return {
    anime: A._readListStatus(g("c-anime")),
    manga: A._readListStatus(g("c-manga")),
    empty: A._readListStatus(g("c-empty")),
    legacy: A._readListStatus(g("c-legacy")),
    totalsManga: A._readBlockTotals(g("c-manga")),
    totalsAnime: A._readBlockTotals(g("c-anime")),
    optAnime: A._statusOptions(false).map((o) => o.id + "=" + o.label).join("|"),
    optManga: A._statusOptions(true).map((o) => o.id + "=" + o.label).join("|"),
    totalsInfo: A._getTotals({ info: [{ key: "Episodes", text: "23" }, { key: "Chapters", text: "Unknown" }, { key: "Volumes", text: "20" }] }),
  };
});

// 1. Anime Completed : le VRAI statut 2 (pas le repli 6), score 8, 11 épisodes
assert.equal(r.anime.statusId, 2);
assert.equal(r.anime.score, 8);
assert.equal(r.anime.episodes, 11);
// 2. Manga Reading : statut 1, score 0, 1 chapitre, 0 tome
assert.equal(r.manga.statusId, 1);
assert.equal(r.manga.score, 0);
assert.equal(r.manga.episodes, 1);
assert.equal(r.manga.volumes, 0);
// 3. Hors-liste : null (jamais de statut inventé)
assert.equal(r.empty, null);
// 4. Fallback legacy conservé
assert.equal(r.legacy.statusId, 6);
assert.equal(r.legacy.episodes, 3);
// 5. Totaux bloc natif (data-num manga), anime sans total bloc
assert.deepEqual(r.totalsManga, { chapters: 171, volumes: 20 });
assert.deepEqual(r.totalsAnime, { chapters: null, volumes: null });
// 6. Libellés imposés : anime Watching/Plan to Watch, manga Reading/Plan to Read
assert.equal(r.optAnime, "1=Watching|2=Completed|3=On-Hold|4=Dropped|6=Plan to Watch");
assert.equal(r.optManga, "1=Reading|2=Completed|3=On-Hold|4=Dropped|6=Plan to Read");
// 7. Totaux grille infos : "23" -> 23, "Unknown" -> null
assert.deepEqual(r.totalsInfo, { eps: 23, chapters: null, volumes: 20 });

await browser.close();
console.log("OK — statut liste : 7 cas (anime Completed, manga Reading, hors-liste, legacy, totaux, labels, infos).");
