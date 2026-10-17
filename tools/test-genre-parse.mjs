// node tools/test-genre-parse.mjs — readGenre/buildGenreView/destroy sur fixtures
// hors-ligne (gabarit réel /anime/genre/1/Action : h1.h1, description, tuiles
// .seasonal-anime, pagination, statut de suivi + note perso). Couvre : détection,
// parsing, hero/KPIs/répartition, filtres type + « Ma liste », recherche, tri,
// vue tableau, pagination, déplacement/restauration de la description.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();

const prop = (caption, items) =>
  '<div class="property"><span class="caption">' + caption + "</span>"
  + items.map((i) => '<span class="item"><a href="' + i.href + '" title="' + i.label + '">' + i.label + "</a></span>").join("")
  + "</div>";

const tile = (o) =>
  '<div class="js-anime-category-producer seasonal-anime js-seasonal-anime js-anime-type-all js-anime-type-' + o.type + '">'
  + "<div>"
  + '<div class="title"><div class="title-text">'
  + '<h2 class="h2_anime_title"><a href="' + o.href + '" class="link-title">' + o.title + "</a></h2>"
  + (o.subtitle ? '<h3 class="h3_anime_subtitle">' + o.subtitle + "</h3>" : "")
  + "</div>"
  + '<span style="display: none;" class="js-members">' + o.membersRaw + "</span>"
  + '<span style="display: none;" class="js-score">' + o.score + "</span>"
  + '<span style="display: none;" class="js-start_date">' + o.date + "</span>"
  + "</div>"
  + '<div class="prodsrc"><div class="info">'
  + '<span class="item">' + o.air + "</span>"
  + '<span class="item finished">Finished</span>'
  + '<span class="item"><span>' + o.eps + " eps</span>, <span>24 min</span></span>"
  + "</div></div>"
  + '<div class="synopsis"><p class="preline">' + o.synopsis + "</p>"
  + '<div class="properties">'
  + prop("Studio", [{ label: o.studio, href: "/anime/producer/1/Studio" }])
  + prop("Source", [{ label: "Manga", href: "" }])
  + prop("Themes", o.themes.map((t) => ({ label: t, href: "#" })))
  + prop("Demographic", [{ label: "Shounen", href: "#" }])
  + "</div></div>"
  + '<div class="image"><a href="' + o.href + '">'
  + `<img class="lazyload" data-src="https://cdn.myanimelist.net/images/anime/${o.id}.webp"></a></div>`
  + '<div class="information">'
  + '<div class="information-item scormem"><div class="scormem-container">'
  + '<div class="scormem-item score score-label" title="Score">' + o.score + "</div>"
  + '<div class="scormem-item member" title="Members">' + o.members + "</div>"
  + "</div></div>"
  + '<div class="information-item buttons">'
  + (o.status
    ? '<a href="/ownlist/anime/' + o.id + '/edit" class="Lightbox_AddEdit js-anime-watch-status completed">'
      + '<span data-work-type="anime" data-status="' + o.status + '">' + o.statusLabel + "</span></a>"
    : '<a href="/ownlist/anime/add?selected_series_id=' + o.id + '" class="Lightbox_AddEdit addtolist">'
      + '<span data-work-type="anime" data-status="0">Add to My List</span></a>')
  + (o.ownScore ? '<div class="bubble anime score"><span class="bubble-item content"><i class="fa-solid fa-star"></i>' + o.ownScore + "</span></div>" : "")
  + "</div></div>"
  + "</div></div>";

const WORKS = [
  tile({
    id: 16498, title: "Shingeki no Kyojin", subtitle: "L'Attaque des Titans", type: 1,
    href: "/anime/16498/Shingeki_no_Kyojin", membersRaw: "4441007", members: "4.4M", score: "8.58", date: "20130407",
    air: "TV, 2013", eps: 25, studio: "Wit Studio", themes: ["Gore", "Military", "Survival"],
    synopsis: "Centuries ago, mankind was slaughtered to near extinction.", status: 2, statusLabel: "Completed", ownScore: 8,
  }),
  tile({
    id: 5114, title: "Fullmetal Alchemist: Brotherhood", subtitle: "", type: 1,
    href: "/anime/5114/Fullmetal_Alchemist__Brotherhood", membersRaw: "3747116", members: "3.7M", score: "9.11", date: "20090405",
    air: "TV, 2009", eps: 64, studio: "Bones", themes: ["Military"],
    synopsis: "After a horrific alchemy experiment goes wrong.", status: 6, statusLabel: "Plan to Watch", ownScore: null,
  }),
  tile({
    id: 32281, title: "Kimi no Na wa.", subtitle: "Your Name.", type: 3,
    href: "/anime/32281/Kimi_no_Na_wa", membersRaw: "3200000", members: "3.2M", score: "8.83", date: "20160826",
    air: "Movie, 2016", eps: 1, studio: "CoMix Wave Films", themes: ["Romance"],
    synopsis: "Mitsuha and Taki swap bodies.", status: 1, statusLabel: "Watching", ownScore: 9,
  }),
  tile({
    id: 1, title: "Cowboy Bebop", subtitle: "", type: 1,
    href: "/anime/1/Cowboy_Bebop", membersRaw: "1800000", members: "1.8M", score: "8.76", date: "19980403",
    air: "TV, 1998", eps: 26, studio: "Sunrise", themes: ["Space"],
    synopsis: "Crime is rampant throughout the solar system.", status: null, statusLabel: "", ownScore: null,
  }),
].join("");

const pager = '<div class="mt12 mb12"><div class="pagination ac">'
  + '<a class="link current" href="https://myanimelist.net/anime/genre/1/Action?page=1">1 - 100</a>'
  + '<a class="link" href="https://myanimelist.net/anime/genre/1/Action?page=2">101 - 200</a>'
  + '<a class="link" href="https://myanimelist.net/anime/genre/1/Action?page=3">201 - 300</a>'
  + "</div></div>";

const FULL = '<div id="myanimelist"><div id="contentWrapper"><div><h1 class="h1">Action Anime</h1></div>'
  + '<div id="content" class="pl0 pr0">'
  + '<div class="breadcrumb"></div>'
  + '<div class="ml8 mr8">'
  + '<div id="horiznav_nav"></div>'
  + '<form id="advancedsearch"></form>'
  + '<div class="normal_header"><span class="di-ib mt4">Action Anime <span class="fw-n">(5,043)</span></span></div>'
  + '<div class="mt8 ml8 mr8"><p class="genre-description">Exciting action sequences take priority and significant conflicts between characters are usually resolved with one\'s physical power.</p></div>'
  + '<div class="js-categories-seasonal js-block-list tile"><div class="seasonal-anime-list">' + WORKS + "</div></div>"
  + pager
  + "</div></div></div></div>";

const EMPTY = '<div id="myanimelist"><div id="contentWrapper"><div><h1 class="h1"></h1></div>'
  + '<div id="content"><div class="js-categories-seasonal"></div></div></div></div>';

await page.goto("https://myanimelist.net", { waitUntil: "domcontentloaded" });
await page.route("**/anime/genre/1/**", (r) => r.fulfill({
  contentType: "text/html; charset=utf-8",
  body: "<!doctype html><html><head><title>Action</title></head><body>" + FULL + "</body></html>",
}));
await page.goto("https://myanimelist.net/anime/genre/1/Action", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "genre-view.js") });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });

const r = await page.evaluate(async () => {
  const G = window.__myappleGenre;
  const out = {};
  out.paths = [
    G.isGenrePath("/anime/genre/1/Action"),
    G.isGenrePath("/anime/genre/62/Isekai"),
    G.isGenrePath("/anime/genre"),
    G.isGenrePath("/anime/1/Cowboy_Bebop"),
  ];
  const d = G.readGenre(document);
  out.d = {
    id: d.id, name: d.name, total: d.total, range: d.range,
    pager: d.pager, pagerCount: d.pager.length,
    desc: d.description?.slice(0, 30), descNode: !!d.descriptionNode,
    works: d.works,
  };
  G.buildGenreView();
  const v = document.querySelector("#myapple-genre");
  const firstTitle = () => v.querySelector(".apl-works .apl-work-title")?.textContent;
  out.view = v ? {
    h1: v.querySelector(".apl-who h1")?.textContent,
    alt: v.querySelector(".apl-alt")?.textContent,
    kpis: [...v.querySelectorAll(".apl-kpi")].map((k) => k.querySelector("b")?.textContent),
    kpiLabels: [...v.querySelectorAll(".apl-kpi > span")].map((s) => s.textContent),
    legend: [...v.querySelectorAll(".apl-legend-item")].map((i) => i.textContent),
    chips: [...v.querySelectorAll(".apl-chip")].map((c) => c.textContent),
    mineBtn: v.querySelector(".apl-mine-btn")?.textContent,
    count: v.querySelector(".apl-card-count")?.textContent,
    cards: v.querySelectorAll(".apl-works .apl-work").length,
    first: firstTitle(),
    order: [...v.querySelectorAll(".apl-work-title")].map((t) => t.textContent),
    score: v.querySelector(".apl-work-score")?.textContent,
    scoreAria: v.querySelector(".apl-work-score")?.getAttribute("aria-label"),
    statuses: [...v.querySelectorAll(".apl-work-status")].map((s) => s.textContent),
    own: [...v.querySelectorAll(".apl-work-own")].map((s) => s.textContent),
    subtitle: v.querySelector(".apl-work-subtitle")?.textContent,
    studio: v.querySelector(".apl-work-studio")?.textContent,
    pager: [...v.querySelectorAll(".apl-pager-link")].map((a) => ({
      label: a.textContent, current: a.getAttribute("aria-current"),
    })),
    descMoved: !!v.querySelector(".apl-sec-desc .genre-description"),
    descNoDup: document.querySelectorAll(".genre-description").length === 1,
    firstChild: document.querySelector("#content")?.firstElementChild?.id,
    bodyClass: document.body.classList.contains("myapple-genre"),
    idempotent: (G.buildGenreView(), document.querySelectorAll("#myapple-genre").length === 1),
  } : null;

  // « Ma liste »
  const mine = v.querySelector(".apl-mine-btn");
  mine.click();
  out.mine = {
    cards: v.querySelectorAll(".apl-works .apl-work").length,
    pressed: mine.getAttribute("aria-pressed"),
    count: v.querySelector(".apl-card-count")?.textContent,
  };
  mine.click(); // reset

  // Filtre type Films
  const chips = [...v.querySelectorAll(".apl-chip")];
  const movies = chips.find((c) => c.dataset.type === "movie");
  movies.click();
  out.movie = { cards: v.querySelectorAll(".apl-works .apl-work").length, title: firstTitle() };
  chips.find((c) => c.dataset.type === "all").click();

  // Recherche (debounce 120 ms)
  const search = v.querySelector(".apl-works-search");
  search.value = "bebop";
  search.dispatchEvent(new Event("input"));
  await new Promise((res) => setTimeout(res, 220));
  out.search = { cards: v.querySelectorAll(".apl-works .apl-work").length, title: firstTitle() };

  // Vue tableau (recherche remise à zéro)
  search.value = "";
  search.dispatchEvent(new Event("input"));
  await new Promise((res) => setTimeout(res, 220));
  v.querySelector('.apl-view-btn[data-view="table"]').click();
  out.table = {
    visible: !v.querySelector(".apl-table-wrap")?.hidden,
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    firstRow: v.querySelector(".apl-row-title")?.textContent,
    cols: [...v.querySelectorAll(".apl-works-table thead th")].map((h) => h.textContent),
    status: v.querySelector(".apl-status-badge")?.textContent,
    studio: v.querySelector(".apl-works-table tbody .apl-col-studio")?.textContent,
  };

  G.destroyGenreView();
  out.destroyed = {
    gone: !document.querySelector("#myapple-genre"),
    descRestored: !!document.querySelector("#content .mt8.ml8.mr8 > .genre-description"),
    descCount: document.querySelectorAll(".genre-description").length,
    bodyClassGone: !document.body.classList.contains("myapple-genre"),
  };
  return out;
});

// ---- Détection / lecture ----
assert.deepEqual(r.paths, [true, true, false, false]);
assert.equal(r.d.id, 1);
assert.equal(r.d.name, "Action");
assert.equal(r.d.total, 5043);
assert.deepEqual(r.d.range, { start: 1, end: 100 });
assert.equal(r.d.pagerCount, 3);
assert.ok(r.d.desc?.includes("Exciting action"));
assert.ok(r.d.descNode);
assert.equal(r.d.works.length, 4);
assert.deepEqual(r.d.works[0], {
  id: 16498,
  title: "Shingeki no Kyojin",
  subtitle: "L'Attaque des Titans",
  url: "/anime/16498/Shingeki_no_Kyojin",
  img: "https://cdn.myanimelist.net/images/anime/16498.webp",
  type: "TV",
  group: "tv",
  year: 2013,
  air: "TV, 2013",
  airStatus: "Finished",
  episodes: "25 eps, 24 min",
  score: 8.58,
  members: 4400000,
  studio: { label: "Wit Studio", href: "/anime/producer/1/Studio" },
  genres: ["Gore", "Military", "Survival", "Shounen"],
  status: { code: 2, label: "Terminé" },
  ownScore: 8,
});
assert.equal(r.d.works[1].status.code, 6);
assert.equal(r.d.works[1].ownScore, null);
assert.equal(r.d.works[3].status, null);
assert.equal(r.d.works[2].type, "Film");

// ---- Vue ----
assert.ok(r.view, "vue construite");
assert.equal(r.view.h1, "Action");
assert.ok(r.view.alt.includes("titres") && r.view.alt.includes("Anime"));
assert.equal(r.view.kpis.length, 4);
assert.equal(r.view.kpiLabels[0], "Titres");
assert.equal(r.view.kpis[0].replace(/\D/g, ""), "5043");
assert.equal(r.view.kpiLabels[2], "Dans ma liste");
assert.equal(r.view.kpis[2], "3");
assert.deepEqual(r.view.legend, ["TV3", "Films1"]);
assert.deepEqual(r.view.chips, ["Tout4", "TV3", "Films1"]);
assert.equal(r.view.mineBtn, "Ma liste3");
assert.equal(r.view.count, "4 titres");
assert.equal(r.view.cards, 4);
assert.equal(r.view.first, "Shingeki no Kyojin"); // tri membres ↓
assert.deepEqual(r.view.order, ["Shingeki no Kyojin", "Fullmetal Alchemist: Brotherhood", "Kimi no Na wa.", "Cowboy Bebop"]);
assert.ok(r.view.score.includes("8.58"));
assert.equal(r.view.scoreAria, "Note 8.58 sur 10");
assert.deepEqual(r.view.statuses, ["Terminé", "À voir", "En cours"]);
assert.deepEqual(r.view.own, ["★8", "★9"]);
assert.equal(r.view.subtitle, "L'Attaque des Titans");
assert.equal(r.view.studio, "Wit Studio");
assert.deepEqual(r.view.pager, [
  { label: "1 - 100", current: "page" },
  { label: "101 - 200", current: null },
  { label: "201 - 300", current: null },
]);
assert.ok(r.view.descMoved, "description déplacée dans le hero");
assert.ok(r.view.descNoDup, "aucune duplication");
assert.equal(r.view.firstChild, "myapple-genre");
assert.equal(r.view.bodyClass, true);
assert.ok(r.view.idempotent, "build idempotent");

// ---- Interactions ----
assert.equal(r.mine.cards, 3);
assert.equal(r.mine.pressed, "true");
assert.equal(r.mine.count, "3 / 4 titres");
assert.equal(r.movie.cards, 1);
assert.equal(r.movie.title, "Kimi no Na wa.");
assert.equal(r.search.cards, 1);
assert.equal(r.search.title, "Cowboy Bebop");
assert.equal(r.table.visible, true);
assert.equal(r.table.rows, 4);
assert.equal(r.table.firstRow, "Shingeki no Kyojin");
assert.deepEqual(r.table.cols, ["#", "Titre", "Type", "Studio", "Note", "Membres", "Année", "Ma liste"]);
assert.equal(r.table.status, "Terminé");
assert.equal(r.table.studio, "Wit Studio");

// ---- Destroy ----
assert.ok(r.destroyed.gone);
assert.ok(r.destroyed.descRestored, "description restaurée à sa place");
assert.equal(r.destroyed.descCount, 1);
assert.ok(r.destroyed.bodyClassGone);

// ---- Fixture vide : gate → aucune vue ----
await page.route("**/anime/genre/999/**", (r2) => r2.fulfill({
  contentType: "text/html; charset=utf-8",
  body: "<!doctype html><html><body>" + EMPTY + "</body></html>",
}));
await page.goto("https://myanimelist.net/anime/genre/999/Empty", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "genre-view.js") });
const g = await page.evaluate(() => {
  const G = window.__myappleGenre;
  const d = G.readGenre(document);
  G.buildGenreView();
  return {
    data: d,
    built: !!document.querySelector("#myapple-genre"),
    body: document.body.classList.contains("myapple-genre"),
  };
});
assert.equal(g.data.name, null);
assert.equal(g.data.works.length, 0);
assert.ok(!g.built, "gate de données : vue non construite sur page vide");
assert.ok(!g.body);

await browser.close();
console.log("OK — parse genre : tuiles (type/studio/statut/note perso), description déplacée, KPIs + répartition, filtres Ma liste/type, recherche, tableau, pagination, rollback.");
