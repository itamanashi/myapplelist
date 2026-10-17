// node tools/test-people-parse.mjs — readPeople/buildPeopleView/destroy sur fixtures
// hors-ligne (HTML minimal reconstruit depuis les gabarits live vérifiés, /people/2009).
// Couvre : détails (deux formes de rows), bio (nœud déplacé + restauration),
// zones d'œuvres (voices/staff/published, section vide → null), gate de données
// (page vide → MAL natif), garde idempotence, rollback destroy.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();

const PORTRAIT = "https://cdn.myanimelist.net/r/84x124/images/voiceactors/3/48770.jpg";
const pageHTML = (body) => '<div id="myanimelist"><div id="content"><table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>' + body + "</tr></table></div></div>";

const watanabe = pageHTML(
  '<td valign="top" class="borderClass" width="225"><div style="text-align: center;">'
    + `<a href="/people/2009/pic"><img class="lazyload" data-src="${PORTRAIT}"></a></div>`
    + '<div class="spaceit_pad"><span class="dark_text">Given name:</span> 信一郎</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Family name:</span> 渡辺</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Alternate names:</span> Shinichiro Watanabe</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Birthday:</span> May 24, 1965</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Member Favorites:</span> 15,961</div>'
    + '<span class="dark_text">More:</span>' // row SANS div : gabarit 2 non-wrappé
    + '<div class="people-informantion-more js-people-informantion-more">He directed Cowboy&nbsp;Bebop.</div>'
  + "</td>"
  + '<td valign="top" class="borderClass">'
    + '<h1 class="title-name">Watanabe, Shinichirou</h1>'
    + '<div class="normal_header"><div class="floatRightHeader">Add rows</div><h2 class="h2_overwrite">Voice Acting Roles</h2></div>'
    + "No voice acting roles have been added to this person."
    + '<div class="normal_header"><span class="floatRightHeader">Add Position</span>Anime Staff Positions</div>'
    + '<div class="people-staff"><table border="0" class="js-table-people-staff">'
      + '<tr class="js-people-staff list-item-inmylist js-anime-watch-status-people-staff-plantowatch">'
        + `<td class="borderClass" width="25"><div class="picSurround"><a href="/anime/1/Cowboy_Bebop"><img data-src="https://cdn.myanimelist.net/r/84x124/images/anime/1106/91083.jpg"></a></div></td>`
        + '<td class="borderClass"><div class="spaceit_pad"><a href="/anime/1/Cowboy_Bebop" class="js-people-title">Cowboy Bebop</a></div>'
          + '<div class="spaceit_pad"><a href="https://myanimelist.net/ownlist/anime/1/edit?hideLayout=1" class="Lightbox_AddEdit button_edit ga-click plantowatch" data-status="6" data-work-type="anime"><span>PTW</span></a> <small>Director,2 eps</small></div>'
          + '<div class="spaceit_pad anime-info-text">TV, Spring 1998</div>'
          + '<small class="total-score" style="display:none;">8.76</small></td>'
        + '<td class="borderClass">  <div class="spaceit_pad"><span class="score-val">8.76</span></div>'
          + '<div class="spaceit_pad"><small class="series-total-members">899,150 Members</small></div></td>'
      + "</tr>"
    + "</table></div>"
    + '<div class="normal_header"><span class="floatRightHeader">Add Work</span>Published Manga</div>'
    + '<div class="people-manga"><table border="0">'
      + '<tr class="js-people-staff">'
        + `<td class="borderClass" width="25"><div class="picSurround"><a href="/manga/173/Cowboy_Bebop"><img src="https://cdn.myanimelist.net/images/manga/5/166652.jpg"></a></div></td>`
        + '<td class="borderClass"><div class="spaceit_pad"><a href="/manga/173/Cowboy_Bebop" class="js-people-title">Cowboy Bebop</a></div>'
          + '<div class="spaceit_pad"><small>Story</small></div>'
          + '<div class="spaceit_pad"><small class="total-score" style="display:none;">7.17</small></div></td>'
        + '<td class="borderClass"><div class="spaceit_pad"><span class="score-val">7.17</span></div></td>'
      + "</tr>"
    + "</table></div>"
  + "</td>"
);

const emptyPerson = pageHTML('<td class="borderClass" width="225"></td><td class="borderClass"><h1 class="title-name"></h1></td>');

await page.goto("https://myanimelist.net", { waitUntil: "domcontentloaded" });
// Personne remplie (path réel via route, contenu en fixture)
await page.route("**/people/2009/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><html><head><title>People</title></head><body>" + watanabe + "</body></html>" }));
await page.goto("https://myanimelist.net/people/2009/Shinichirou_Watanabe", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "people-view.js") });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });

const r = await page.evaluate(() => {
  const P = window.__myapplePeople;
  const out = {};
  out.paths = [
    P.isPeoplePath("/people/2009/Shinichirou_Watanabe"),
    P.isPeoplePath("/people/2009/Shinichirou_Watanabe/pic"),
    P.isPeoplePath("/people/Tanaka"),
    P.isPeoplePath("/anime/1/Cowboy_Bebop"),
    P.isPeoplePath("/profile/x"),
  ];
  const d = P.readPeople(document);
  out.d = {
    id: d.id,
    url: d.url || null,
    urlPath: (d.url || "").replace("https://myanimelist.net", ""),
    name: d.name,
    nameJp: d.nameJp,
    portrait: d.portrait,
    favorites: d.favorites,
    details: d.details,
    bioText: d.bioText?.includes("directed Cowboy Bebop"),
    bioHasNode: !!d.bioNode,
    voices: d.voices,
    staff: d.staff,
    staff0: d.staff?.[0],
    published: d.published,
  };
  P.buildPeopleView();
  const v = document.querySelector("#myapple-people");
  out.view = v ? {
    h1: v.querySelector(".apl-who h1")?.textContent,
    portrait: v.querySelector(".apl-poster img")?.getAttribute("src"),
    kpis: [...v.querySelectorAll(".apl-kpi")].map((k) => k.textContent?.trim()),
    cards: [...v.querySelectorAll(".apl-card > header > h2")].map((h) => h.textContent),
    bioMoved: !!v.querySelector(".apl-sec-bio .people-informantion-more"),
    bioNoDup: document.querySelectorAll(".people-informantion-more").length === 1,
    bioInHero: !!v.querySelector(".apl-hero-panel .apl-sec-bio"),
    infosInHero: !!v.querySelector(".apl-hero-panel .apl-sec-infos"),
    panelScroll: getComputedStyle(v.querySelector(".apl-hero-panel")).overflowY,
    worksOutsideHero: !!v.querySelector(":scope > .apl-sec-staff"),
    staff0Title: v.querySelector(".apl-sec-staff .apl-work-title")?.textContent,
    staff0Role: v.querySelector(".apl-sec-staff .apl-work-role-item")?.textContent,
    staff0Status: v.querySelector(".apl-sec-staff .apl-work-status")?.textContent,
    statusBadgeOnMedia: !!v.querySelector(".apl-sec-staff .apl-work-media > .apl-work-status"),
    moreHidden: !!v.querySelector(".apl-sec-staff .apl-work-media > .apl-work-more"),
    cardNoDot: getComputedStyle(v.querySelector(".apl-sec-staff h2"), "::before").content,
    infos: [...v.querySelectorAll(".apl-infos dt")].map((t) => t.textContent),
    ddEmptyDash: v.querySelector(".apl-infos dd")?.textContent,
    idempotent: (P.buildPeopleView(), document.querySelectorAll("#myapple-people").length === 1),
    firstChild: document.querySelector("#content")?.firstElementChild?.id,
  } : null;
  P.destroyPeopleView();
  out.destroyed = {
    gone: !document.querySelector("#myapple-people"),
    bioRestored: !!document.querySelector("#content .people-informantion-more"),
    noMovedDupes: document.querySelectorAll(".people-informantion-more").length === 1,
    bodyClassGone: !document.body.classList.contains("myapple-people"),
  };
  return out;
});

assert.deepEqual(r.paths, [true, true, false, false, false]);
assert.equal(r.d.id, 2009);
assert.equal(r.d.urlPath, "/people/2009/Shinichirou_Watanabe");
assert.equal(r.d.name, "Watanabe, Shinichirou");
assert.equal(r.d.nameJp, "渡辺 信一郎");
assert.equal(r.d.portrait, "https://cdn.myanimelist.net/images/voiceactors/3/48770.jpg"); // fixImg : ratio retiré
assert.equal(r.d.favorites, 15961);
assert.deepEqual(r.d.details, [["Alternate names", "Shinichiro Watanabe"], ["Birthday", "May 24, 1965"]]);
assert.ok(r.d.bioText);
assert.ok(r.d.bioHasNode);
assert.equal(r.d.voices, null); // "No voice acting roles have been added…" → null
assert.equal(r.d.staff.length, 1);
assert.deepEqual(r.d.staff[0], {
  img: "https://cdn.myanimelist.net/images/anime/1106/91083.jpg",
  title: "Cowboy Bebop",
  url: "/anime/1/Cowboy_Bebop",
  sub: "Director,2 eps",
  meta: "TV, Spring 1998",
  score: "8.76",
  members: "899,150 Members",
  year: 1998,
  format: "TV",
  status: { code: 6, label: "À voir" },
});
assert.equal(r.d.published?.length, 1);
// Vue
assert.equal(r.view.h1, "Watanabe, Shinichirou");
assert.equal(r.view.portrait, "https://cdn.myanimelist.net/images/voiceactors/3/48770.jpg");
assert.equal(r.view.kpis.length, 3); // Favoris / Staff anime / Œuvres publiées (pas de Rôles voix)
assert.equal(r.view.cards.includes("Rôles de doublage"), false);
assert.ok(r.view.cards.includes("Staff anime") && r.view.cards.includes("Œuvres publiées"));
assert.ok(r.view.cards.includes("Explorer sur MAL") === false, "card MAL retirée");
assert.ok(r.view.staff0Status, "pastille statut rendue");
assert.equal(r.view.staff0Status, "À voir");
assert.ok(!r.view.staff0Status.includes("Ma liste"), "« Ma liste » n'est pas un statut");
assert.ok(r.view.bioMoved, "bio déplacé (pas dupliqué)");
assert.ok(r.view.bioNoDup);
assert.ok(r.view.bioInHero, "bio dans le panneau du hero");
assert.ok(r.view.infosInHero, "informations dans le panneau du hero");
assert.equal(r.view.panelScroll, "auto", "panneau du hero scrollable");
assert.ok(r.view.worksOutsideHero, "œuvres hors du hero");
assert.equal(r.view.staff0Title, "Cowboy Bebop");
assert.equal(r.view.staff0Role, "Director,2 eps");
assert.ok(r.view.statusBadgeOnMedia, "badge statut posé sur la vignette");
assert.ok(r.view.moreHidden, "volet « infos » présent sur la vignette (masqué au repos)");
assert.equal(r.view.cardNoDot, "none", "point bleu (h2::before) retiré");
assert.deepEqual(r.view.infos, ["Alternate names", "Birthday"]);
assert.equal(r.view.ddEmptyDash, "Shinichiro Watanabe");
assert.ok(r.view.idempotent);
assert.equal(r.view.firstChild, "myapple-people");
// Destroy
assert.ok(r.destroyed.gone);
assert.ok(r.destroyed.bioRestored, "bio restauré à sa place");
assert.ok(r.destroyed.noMovedDupes, "aucune duplication du nœud bio");
assert.ok(r.destroyed.bodyClassGone);

// ---- Fixture vide : gate → aucune vue ----
await page.route("**/people/999/**", (r2) => r2.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><html><body>" + emptyPerson + "</body></html>" }));
await page.goto("https://myanimelist.net/people/999/Empty_Person", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "people-view.js") });
const g = await page.evaluate(() => {
  const P = window.__myapplePeople;
  const d = P.readPeople(document);
  P.buildPeopleView();
  return { data: d, built: !!document.querySelector("#myapple-people"), body: document.body.classList.contains("myapple-people") };
});
assert.equal(g.data.error, undefined);
assert.equal(g.data.name, null);
assert.ok(!g.built, "gate de données : vue non construite sur page vide");
assert.ok(!g.body);

// ---- Personne prolifique : barre filtre/tri, tri par année, lien perso, sommaire ----
const animeRow = (i, title, year, score) =>
  '<tr class="js-people-staff">'
  + `<td class="borderClass" width="25"><div class="picSurround"><a href="/anime/${i}/${title}"><img data-src="https://cdn.myanimelist.net/images/anime/${i}.jpg"></a></div></td>`
  + `<td class="borderClass"><div class="spaceit_pad"><a href="/anime/${i}/${title}" class="js-people-title">${title}</a></div>`
    + '<div class="spaceit_pad"><small>Director</small></div>'
    + `<div class="spaceit_pad anime-info-text">TV, Spring ${year}</div></td>`
  + `<td class="borderClass"><div class="spaceit_pad"><span class="score-val">${score}</span></div></td>`
  + "</tr>";

const voiceRow = (i, title, year, score, char, role) =>
  '<tr class="js-people-character">'
  + `<td class="borderClass" width="25"><div class="picSurround"><a href="/anime/${i}/${title}"><img data-src="https://cdn.myanimelist.net/images/anime/${i}.jpg"></a></div></td>`
  + `<td class="borderClass"><div class="spaceit_pad"><a href="/anime/${i}/${title}" class="js-people-title">${title}</a></div>`
    + `<div class="spaceit_pad anime-info-text">TV, Spring ${year}</div>`
    + `<div class="spaceit_pad"><span class="score-val">${score}</span></div></td>`
  + `<td class="borderClass"><div class="picSurround"><a href="/character/${100 + i}/${char}"><img data-src="https://cdn.myanimelist.net/images/characters/${100 + i}.jpg"></a></div>`
    + `<div class="spaceit_pad"><a href="/character/${100 + i}/${char}">${char}</a></div>`
    + `<div class="spaceit_pad">${role}</div></td>`
  + "</tr>";

const voices = [
  voiceRow(1, "Alpha", 2001, "8.10", "Spike", "Main"),
  voiceRow(2, "Beta", 1998, "7.20", "Jet", "Main"),
  voiceRow(3, "Gamma", 2015, "9.01", "Faye", "Supporting"),
  voiceRow(4, "Delta", 2007, "6.50", "Ed", "Supporting"),
  voiceRow(5, "Epsilon", 2020, "5.40", "Ein", "Supporting"),
  voiceRow(6, "Zeta", 2011, "8.88", "Vicious", "Supporting"),
].join("");
const staff = [
  animeRow(11, "S1", 1999, "8.00"), animeRow(12, "S2", 2003, "7.00"),
  animeRow(13, "S3", 2010, "6.00"), animeRow(14, "S4", 2018, "9.00"), animeRow(15, "S5", 2006, "5.00"),
].join("");

const prolific = pageHTML(
  '<td valign="top" class="borderClass" width="225"><div style="text-align: center;">'
    + `<a href="/people/555/pic"><img data-src="${PORTRAIT}"></a></div>`
    + '<div class="spaceit_pad"><span class="dark_text">Given name:</span> Test</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Family name:</span> Person</div>'
    + '<div class="spaceit_pad"><span class="dark_text">Member Favorites:</span> 1,234</div>'
    + '<span class="dark_text">More:</span><div class="people-informantion-more js-people-informantion-more">Bio line.</div>'
  + "</td>"
  + '<td valign="top" class="borderClass">'
    + '<h1 class="title-name">Person, Test</h1>'
    + '<div class="normal_header"><div class="floatRightHeader">Add Role</div><h2>Voice Acting Roles</h2></div>'
    + '<div class="people-characters"><table class="js-table-people-character">' + voices + "</table></div>"
    + '<div class="normal_header"><span class="floatRightHeader">Add Position</span>Anime Staff Positions</div>'
    + '<div class="people-staff"><table class="js-table-people-staff">' + staff + "</table></div>"
  + "</td>"
);

await page.route("**/people/555/**", (r3) => r3.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><html><head><title>People</title></head><body>" + prolific + "</body></html>" }));
await page.goto("https://myanimelist.net/people/555/Test_Person", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "people-view.js") });
const p = await page.evaluate(async () => {
  const P = window.__myapplePeople;
  const d = P.readPeople(document);
  P.buildPeopleView();
  const v = document.querySelector("#myapple-people");
  const gridCount = () => v.querySelectorAll(".apl-sec-voices .apl-work").length;
  const firstTitle = () => v.querySelector(".apl-sec-voices .apl-work-title")?.textContent;
  const out = {
    voices: d.voices.length,
    staff: d.staff.length,
    char0: d.voices[0].char,
    year0: d.voices[0].year,
    format0: d.voices[0].format,
    toc: [...v.querySelectorAll(".apl-toc a")].map((a) => a.getAttribute("href")),
    hasVoicesBar: !!v.querySelector(".apl-sec-voices .apl-works-bar"),
    hasStaffBar: !!v.querySelector(".apl-sec-staff .apl-works-bar"),
    charLink: v.querySelector(".apl-sec-voices .apl-voice .apl-work-title.is-char")?.getAttribute("href"),
    charRole: v.querySelector(".apl-sec-voices .apl-work-role-item")?.textContent,
    voiceCards: v.querySelectorAll('.apl-sec-voices .apl-work.apl-voice').length,
    faceChar: !!v.querySelector('.apl-sec-voices .apl-voice .apl-work-thumb-link.is-char'),
    faceAnime: !!v.querySelector('.apl-sec-voices .apl-voice .apl-work-thumb-link.is-anime'),
    titleChar: v.querySelector('.apl-sec-voices .apl-voice .apl-work-title.is-char')?.textContent,
    titleAnime: v.querySelector('.apl-sec-voices .apl-voice .apl-work-title.is-anime')?.textContent,
    roleCount: v.querySelectorAll(".apl-sec-voices .apl-work-role-item").length,
    noDots: v.querySelectorAll(".apl-sec-voices .apl-status-dot").length,
    badgeNoDot: !v.querySelector(".apl-sec-voices .apl-work-status .apl-status-dot"),
    count0: gridCount(),
    first0: firstTitle(),
  };
  const sort = v.querySelector(".apl-sec-voices .apl-works-sort");
  sort.value = "year-asc"; sort.dispatchEvent(new Event("change"));
  out.firstAsc = firstTitle();
  const search = v.querySelector(".apl-sec-voices .apl-works-search");
  search.value = "zzz"; search.dispatchEvent(new Event("input"));
  await new Promise((res) => setTimeout(res, 200));
  out.filtered = gridCount();
  out.emptyVisible = !v.querySelector(".apl-sec-voices .apl-works-empty")?.hidden;
  return out;
});
assert.equal(p.voices, 6);
assert.equal(p.staff, 5);
assert.deepEqual(p.char0, {
  name: "Spike",
  img: "https://cdn.myanimelist.net/images/characters/101.jpg",
  url: "/character/101/Spike",
  role: "Main",
});
assert.equal(p.year0, 2001);
assert.equal(p.format0, "TV");
assert.ok(p.toc.includes("#apl-people-voices") && p.toc.includes("#apl-people-staff"), "sommaire ancré sur les sections d'œuvres");
assert.ok(p.hasVoicesBar && p.hasStaffBar, "barre filtre/tri présente au-delà du seuil");
assert.equal(p.charLink, "/character/101/Spike");
assert.equal(p.charRole, "Main");
assert.equal(p.count0, 6);
assert.equal(p.voiceCards, 6, "1 carte = 1 personnage");
assert.ok(p.faceChar && p.faceAnime, "double face perso/anime");
assert.equal(p.titleChar, "Spike");
assert.equal(p.titleAnime, "Alpha");
assert.equal(p.noDots, 0, "aucune pastille statut");
assert.ok(p.badgeNoDot !== false, "badge statut sans pastille");
assert.equal(p.first0, "Spike"); // carte personnage : nom du perso par defaut
assert.equal(p.firstAsc, "Jet"); // Beta 1998 = plus ancienne année (nom perso)
assert.equal(p.filtered, 0);
assert.ok(p.emptyVisible, "message « Aucun résultat » affiché");

await browser.close();
console.log("OK — parse people (groupes 1 carte=1 oeuvre, badge sans pastille)  : détection, détails 2 gabarits, bio déplacé/restauré, zones d'œuvres, gate, rollback, sommaire, tri/filtre, lien personnage.");
