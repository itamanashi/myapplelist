// node tools/test-producer-parse.mjs — readProducer/buildProducerView/destroy sur
// fixtures hors-ligne (gabarit réel /anime/producer/4/Bones : tuiles seasonal-anime,
// colonne .content-left, bio, site, actualités). Couvre : détection, détails,
// œuvres (type/relation/score/membres/année/statut), KPIs + répartition,
// filtres/recherche/tri/grille↔tableau, sommaire, idempotence, rollback destroy.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();

const tile = (id, title, typeCode, body) =>
  '<div class="js-anime-category-studio seasonal-anime js-seasonal-anime js-anime-type-all js-anime-type-' + typeCode + '">'
  + '<div class="image"><a href="/anime/' + id + '/' + title.replace(/[^A-Za-z0-9]+/g, "_") + '">'
  + `<img width="167" class="lazyload" data-src="https://cdn.myanimelist.net/r/167x242/images/anime/${id}.jpg?s=abc"></a></div>`
  + '<div class="title"><a href="/anime/' + id + '/' + title.replace(/[^A-Za-z0-9]+/g, "_") + '">' + title + "</a></div>"
  + body
  + "</div>";

const workTile = (id, title, typeCode, relation, score, members, date, status) =>
  tile(id, title, typeCode,
    '<div class="category">' + relation + "</div>"
    + '<div class="widget"><div class="stars">' + score + '<i class="fa-regular fa-star fa-sm ml2"></i></div>'
    + '<div class="users">' + members + '<i class="fa-solid fa-user fa-sm ml4"></i></div></div>'
    + '<div class="edit"><a href="/ownlist/anime/add?selected_series_id=' + id + '" class="Lightbox_AddEdit button_add ga-click ' + (status ? "watching" : "notinmylist") + '" data-status="' + (status || 0) + '"></a></div>'
    + '<span style="display: none;" class="js-members">' + members.replace(/[^\d]/g, "") + "</span>"
    + '<span style="display: none;" class="js-score">' + score + "</span>"
    + '<span style="display: none;" class="js-start_date">' + date + "</span>"
    + '<span style="display: none;" class="js-title">' + title + "</span>");

const newsUnit = (id, title, img) =>
  '<div class="news-unit clearfix rect"><a href="/news/' + id + '" class="image-link">'
  + `<img src="https://cdn.myanimelist.net/r/100x156/s/common/uploaded_files/${img}.jpg?s=x" alt="${title}"></a>`
  + '<div class="news-unit-right"><p class="title"><a href="/news/' + id + '">' + title + "</a></p>"
  + '<div class="text">Ten years ago, three companies came together to create the anime.</div>'
  + '<div class="information"><p class="info di-ib">Jul 19, 2024 6:03 PM by <a href="/profile/Kineta">Kineta</a> '
  + '<a href="/forum/?topicid=1" class="comment fw-b">26 Comments</a></p>'
  + '<p class="di-ib tags"><a href="/news/tag/anime_expo" class="tag tag-color5">Anime Expo</a>'
  + '<a href="/news/tag/staff" class="tag tag-color3">Staff</a></p></div></div></div>';

const FULL = '<div id="myanimelist"><div id="contentWrapper"><div>'
  + '<div class="h1 edit-info"><div class="h1-title"><h1 class="title-name">Bones</h1></div>'
  + '<div class="header-right"><a href="/login.php">Edit</a></div></div>'
  + '<div id="content" class="pl0 pr0">'
  + '  <div class="content-left">'
  + '    <div class="logo"><img class="lazyload" alt="Bones" data-src="https://cdn.myanimelist.net/s/common/company_logos/bones_600x600.jpg?s=4145"></div>'
  + '    <div id="profileRows"><a href="/login.php">Add to Favorites</a></div>'
  + '    <div class="spaceit_pad"><span class="dark_text">Japanese:</span> ボンズ</div>'
  + '    <div class="spaceit_pad"><span class="dark_text">Established:</span> Oct, 1998</div>'
  + '    <div class="spaceit_pad"><span class="dark_text">Member Favorites:</span> 23,547</div>'
  + '    <div class="spaceit_pad"><span>Bones (Bones Inc.) is a Japanese animation studio based in Suginami, Tokyo.</span></div>'
  + '    <h2>Available At</h2>'
  + '    <div class="user-profile-sns mb16"><span><i class="icon-sns fa-link"></i>'
  + '      <a href="http://www.bones.co.jp" target="_blank" rel="noreferrer">bones.co.jp</a></span></div>'
  + "  </div>"
  + '  <div class="content-right">'
  + '    <div class="normal_header ml8"><span>Recent News</span></div>'
  + '    <div class="news-list ml8 mt12">'
  + newsUnit(71420835, "Focus: Gachiakuta", "1721437311-79ff")
  + newsUnit(71420836, "Bones Announces New Project", "1721437312-aa11")
  + "    </div>"
  + '    <div class="normal_header js-search-filter-block"><span>Bones Anime</span></div>'
  + '    <div class="js-categories-seasonal tile-anime-list js-seasonal-anime-append">'
  + workTile(5, "Cowboy Bebop: Tengoku no Tobira", 3, "Studio", "8.38", "417,895", "20010901", 2)
  + workTile(5114, "Fullmetal Alchemist: Brotherhood", 1, "Studio", "9.11", "3,747,116", "20090405", 0)
  + workTile(517, "Wolf's Rain OVA", 2, "Studio", "7.98", "78,065", "20040123", 0)
  + workTile(999, "Kitty's Paradise", 1, "Producer", "6.71", "3,548", "19990105", 1)
  + "    </div>"
  + "  </div>"
  + "</div></div></div></div>";

const EMPTY = '<div id="myanimelist"><div id="contentWrapper"><div>'
  + '<div class="h1 edit-info"><h1 class="title-name"></h1></div>'
  + '<div id="content"><div class="content-left"></div><div class="content-right"></div></div>'
  + "</div></div></div>";

await page.goto("https://myanimelist.net", { waitUntil: "domcontentloaded" });
await page.route("**/anime/producer/4/**", (r) => r.fulfill({
  contentType: "text/html; charset=utf-8",
  body: "<!doctype html><html><head><title>Bones</title></head><body>" + FULL + "</body></html>",
}));
await page.goto("https://myanimelist.net/anime/producer/4/Bones", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "producer-view.js") });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });

const r = await page.evaluate(() => {
  const P = window.__myappleProducer;
  const out = {};
  out.paths = [
    P.isProducerPath("/anime/producer/4/Bones"),
    P.isProducerPath("/anime/studio/12/Madhouse"),
    P.isProducerPath("/anime/producer"),
    P.isProducerPath("/anime/1/Cowboy_Bebop"),
    P.isProducerPath("/people/2009/Shinichirou_Watanabe"),
  ];
  const d = P.readProducer(document);
  out.d = {
    id: d.id, kind: d.kind, name: d.name, portrait: d.portrait,
    japanese: d.japanese, established: d.established, founded: d.founded,
    favorites: d.favorites, website: d.website, details: d.details,
    bioIsNode: !!d.bioNode, bioText: d.bioText,
    works: d.works, news: d.news,
  };
  P.buildProducerView();
  const v = document.querySelector("#myapple-producer");
  const firstTitle = () => v.querySelector(".apl-works .apl-work-title")?.textContent;
  out.view = v ? {
    h1: v.querySelector(".apl-who h1")?.textContent,
    kind: v.querySelector(".apl-kind")?.textContent,
    poster: v.querySelector(".apl-poster img")?.getAttribute("src"),
    alt: v.querySelector(".apl-alt")?.textContent,
    site: v.querySelector(".apl-meta-link")?.getAttribute("href"),
    kpis: [...v.querySelectorAll(".apl-kpi")].map((k) => k.querySelector("b")?.textContent),
    kpiLabels: [...v.querySelectorAll(".apl-kpi > span")].map((s) => s.textContent),
    segs: v.querySelectorAll(".apl-typebar-seg").length,
    legend: [...v.querySelectorAll(".apl-legend-item")].map((i) => i.textContent),
    chips: [...v.querySelectorAll(".apl-chip")].map((c) => c.textContent),
    chipsPressed: [...v.querySelectorAll(".apl-chip")].map((c) => c.getAttribute("aria-pressed")),
    count: v.querySelector(".apl-card-count")?.textContent,
    first0: firstTitle(),
    cards: v.querySelectorAll(".apl-works .apl-work").length,
    score: v.querySelector(".apl-work-score")?.textContent,
    scoreAria: v.querySelector(".apl-work-score")?.getAttribute("aria-label"),
    status: [...v.querySelectorAll(".apl-work-status")].map((s) => s.className + "|" + s.textContent),
    toc: [...v.querySelectorAll(".apl-toc a")].map((a) => a.getAttribute("href")),
    news: [...v.querySelectorAll(".apl-news-item")].map((n) => ({
      title: n.querySelector(".apl-news-title")?.textContent,
      date: n.querySelector(".apl-news-meta > span")?.textContent,
      author: n.querySelector(".apl-news-author")?.textContent,
      tags: [...n.querySelectorAll(".apl-news-tag")].map((t) => t.textContent),
    })),
    bioMoved: !!v.querySelector(".apl-sec-bio .apl-panel-body > span"),
    bioNoDup: document.querySelectorAll(".apl-sec-bio > .apl-panel-body > span").length === 1,
    infos: v.querySelectorAll(".apl-infos dt").length,
    firstChild: document.querySelector("#content")?.firstElementChild?.id,
    bodyClass: document.body.classList.contains("myapple-producer"),
    idempotent: (P.buildProducerView(), document.querySelectorAll("#myapple-producer").length === 1),
  } : null;

  // Filtre type « Films »
  const chips = [...v.querySelectorAll(".apl-chip")];
  const movie = chips.find((c) => c.dataset.type === "movie");
  movie.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.afterMovie = {
    cards: v.querySelectorAll(".apl-works .apl-work").length,
    title: firstTitle(),
    count: v.querySelector(".apl-card-count")?.textContent,
    pressed: chips.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.type),
  };

  // Recherche sans résultat
  const search = v.querySelector(".apl-works-search");
  search.value = "zzz";
  search.dispatchEvent(new Event("input"));
  out.searchPending = { cards: v.querySelectorAll(".apl-works .apl-work").length };

  // Vue tableau (après reset du filtre)
  chips.find((c) => c.dataset.type === "all").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const tableBtn = v.querySelector('.apl-view-btn[data-view="table"]');
  tableBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  out.table = {
    visible: !v.querySelector(".apl-table-wrap")?.hidden,
    gridHidden: v.querySelector(".apl-works")?.hidden,
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    firstRow: v.querySelector(".apl-row-title")?.textContent,
    cols: [...v.querySelectorAll(".apl-works-table thead th")].map((h) => h.textContent),
    status: v.querySelector(".apl-status-badge")?.textContent,
    pressed: tableBtn.getAttribute("aria-pressed"),
  };

  // Tri par année croissante sur la grille
  v.querySelector('.apl-view-btn[data-view="grid"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const sort = v.querySelector(".apl-works-sort");
  sort.value = "date-asc";
  sort.dispatchEvent(new Event("change"));
  out.sortedOldest = firstTitle();

  P.destroyProducerView();
  out.destroyed = {
    gone: !document.querySelector("#myapple-producer"),
    bioRestored: !!document.querySelector(".content-left .spaceit_pad > span:not(.dark_text)"),
    bioCount: document.querySelectorAll(".content-left .spaceit_pad > span:not(.dark_text)").length,
    bodyClassGone: !document.body.classList.contains("myapple-producer"),
  };
  return out;
});

// ---- Lecture ----
assert.deepEqual(r.paths, [true, true, false, false, false]);
assert.equal(r.d.id, 4);
assert.equal(r.d.kind, "producer");
assert.equal(r.d.name, "Bones");
assert.equal(r.d.portrait, "https://cdn.myanimelist.net/s/common/company_logos/bones_600x600.jpg");
assert.equal(r.d.japanese, "ボンズ");
assert.equal(r.d.established, "Oct, 1998");
assert.equal(r.d.founded, 1998);
assert.equal(r.d.favorites, 23547);
assert.deepEqual(r.d.website, { href: "http://www.bones.co.jp", label: "bones.co.jp" });
assert.deepEqual(r.d.details, []); // Japanese/Established/Favorites promus dans le hero
assert.ok(r.d.bioIsNode);
assert.ok(r.d.bioText?.includes("animation studio"));
assert.equal(r.d.works.length, 4);
assert.deepEqual(r.d.works[0], {
  id: 5,
  img: "https://cdn.myanimelist.net/images/anime/5.jpg",
  title: "Cowboy Bebop: Tengoku no Tobira",
  url: "/anime/5/Cowboy_Bebop_Tengoku_no_Tobira",
  type: "Film",
  group: "movie",
  relation: "Studio",
  year: 2001,
  score: 8.38,
  members: 417895,
  status: { code: 2, label: "Terminé" },
});
assert.equal(r.d.works[3].relation, "Producer");
assert.equal(r.d.works[3].status.code, 1);
assert.equal(r.d.works[1].status, null); // data-status=0 → pas de statut de suivi
assert.equal(r.d.news.length, 2);
assert.equal(r.d.news[0].title, "Focus: Gachiakuta");
assert.equal(r.d.news[0].date, "Jul 19, 2024 6:03 PM");
assert.equal(r.d.news[0].author, "Kineta");
assert.equal(r.d.news[0].comments, "26 Comments");
assert.deepEqual(r.d.news[0].tags, ["Anime Expo", "Staff"]);

// ---- Vue ----
assert.ok(r.view, "vue construite");
assert.equal(r.view.h1, "Bones");
assert.equal(r.view.kind, "Producteur");
assert.equal(r.view.poster, "https://cdn.myanimelist.net/s/common/company_logos/bones_600x600.jpg");
assert.equal(r.view.alt, "ボンズ");
assert.equal(r.view.site, "http://www.bones.co.jp");
assert.equal(r.view.kpis.length, 4);
assert.equal(r.view.kpis[0], "4");
assert.equal(r.view.kpis[3], "1998");
assert.deepEqual(r.view.kpiLabels, ["Œuvres", "Note moyenne", "Favoris", "Fondation"]);
assert.equal(r.view.segs, 3); // TV + Films + OVA
assert.deepEqual(r.view.legend, ["TV2", "Films1", "OVA1"]);
assert.deepEqual(r.view.chips, ["Tout4", "TV2", "Films1", "OVA1"]);
assert.deepEqual(r.view.chipsPressed, ["true", "false", "false", "false"]);
assert.equal(r.view.count, "4 œuvres");
assert.equal(r.view.first0, "Fullmetal Alchemist: Brotherhood"); // tri membres ↓
assert.equal(r.view.cards, 4);
assert.ok(r.view.score.includes("9.11"), "pastille note");
assert.equal(r.view.scoreAria, "Note 9.11 sur 10");
assert.ok(r.view.status.some((s) => s.endsWith("|Terminé") && s.includes("st-2")), "statut code 2");
assert.ok(r.view.status.some((s) => s.endsWith("|En cours") && s.includes("st-1")), "statut code 1");
assert.equal(r.view.status.length, 2);
assert.deepEqual(r.view.toc, ["#apl-producer-works", "#apl-producer-news"]);
assert.equal(r.view.news.length, 2);
assert.equal(r.view.news[1].title, "Bones Announces New Project");
assert.equal(r.view.bioMoved, true);
assert.equal(r.view.bioNoDup, true);
assert.equal(r.view.infos, 0); // rien de promu restant
assert.equal(r.view.firstChild, "myapple-producer");
assert.equal(r.view.bodyClass, true);
assert.ok(r.view.idempotent, "build idempotent");

// Filtre
assert.equal(r.afterMovie.cards, 1);
assert.equal(r.afterMovie.title, "Cowboy Bebop: Tengoku no Tobira");
assert.equal(r.afterMovie.count, "1 / 4 œuvres");
assert.deepEqual(r.afterMovie.pressed, ["movie"]);
// Recherche debouncée : rien avant le délai
assert.equal(r.searchPending.cards, 1);
// Tableau
assert.equal(r.table.visible, true);
assert.equal(r.table.gridHidden, true);
assert.equal(r.table.rows, 4);
assert.equal(r.table.firstRow, "Fullmetal Alchemist: Brotherhood");
assert.deepEqual(r.table.cols, ["#", "Titre", "Type", "Relation", "Note", "Membres", "Année", "Ma liste"]);
assert.equal(r.table.status, "Terminé");
assert.equal(r.table.pressed, "true");
// Tri date-asc : Kitty's Paradise (1999) avant les autres
assert.equal(r.sortedOldest, "Kitty's Paradise");

// Destroy
assert.ok(r.destroyed.gone);
assert.ok(r.destroyed.bioRestored, "bio restaurée dans la colonne native");
assert.equal(r.destroyed.bioCount, 1, "aucune duplication");
assert.ok(r.destroyed.bodyClassGone);

// ---- Fixture vide : gate → aucune vue ----
await page.route("**/anime/producer/999/**", (r2) => r2.fulfill({
  contentType: "text/html; charset=utf-8",
  body: "<!doctype html><html><body>" + EMPTY + "</body></html>",
}));
await page.goto("https://myanimelist.net/anime/producer/999/Empty", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "producer-view.js") });
const g = await page.evaluate(() => {
  const P = window.__myappleProducer;
  const d = P.readProducer(document);
  P.buildProducerView();
  return {
    data: d,
    built: !!document.querySelector("#myapple-producer"),
    body: document.body.classList.contains("myapple-producer"),
  };
});
assert.equal(g.data.name, null);
assert.equal(g.data.works.length, 0);
assert.ok(!g.built, "gate de données : vue non construite sur page vide");
assert.ok(!g.body);

await browser.close();
console.log("OK — parse producer : tuiles seasonal, détails/bio/site, KPIs + répartition, filtres/tri/vue tableau, actualités, sommaire, rollback.");
