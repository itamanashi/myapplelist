// Vue Saisons (/anime/season[/YYYY/saison]) : EXTRACTION + RECONSTRUCTION.
// readSeason() extrait les sections MAL (.seasonal-anime-list > .anime-header
// + cartes .seasonal-anime) ; buildSeasonView() reconstruit hero + filtres +
// sections en grille. Les blocs .information-item.buttons ("Add to My List")
// et .broadcast (streaming) sont DEPLACES, jamais dupliques ; destroy()
// les RESTAURE. Appel : window.__myappleSeason?.buildSeasonView().
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";
const cleanThumb = (u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0];

/* ---------- detection ---------- */
function isSeasonPath(path) {
  return /^\/anime\/season(\/|$)/.test(path || "");
}

function seasonFromPath(path) {
  const m = String(path || "").match(/^\/anime\/season(?:\/(\d{4})\/([a-z]+))?\/?$/i);
  if (!m) return null;
  return { year: m[1] ? parseInt(m[1], 10) : null, season: (m[2] || "").toLowerCase() || null };
}

/* ---------- parsing (lecture seule, DOM intact) ---------- */
function parseCard(node) {
  if (!node || !node.querySelector) return null;
  const link = node.querySelector("h2.h2_anime_title a.link-title") || node.querySelector("h2 a[href]");
  const title = T(link);
  const href = link?.getAttribute("href") || "";
  if (!title || !href) return null;
  const idm = href.match(/\/anime\/(\d+)/);
  const imgEl = node.querySelector(".image img");
  const scoreTxt = T(node.querySelector(".scormem-item.score"));
  const score = parseFloat((scoreTxt.match(/[\d.]+/) || [])[0] || "");
  const membersTxt = T(node.querySelector(".scormem-item.member"));
  const airDate = T(node.querySelector(".prodsrc .info"));
  const synopsis = T(node.querySelector(".synopsis p.preline"));
  const props = [...node.querySelectorAll(".synopsis .properties .property")].map((p) => {
    const key = T(p.querySelector(".caption"));
    const links = [...p.querySelectorAll(".item a")].map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label);
    const itemEl = p.querySelector(".item");
    return { key, text: itemEl ? T(itemEl) : "", links };
  }).filter((p) => p.key);
  const studioProp = props.find((p) => /^studios?$/i.test(p.key));
  const genreProps = props.filter((p) => /^(genres?|themes?|theme|demographics?|demographic)$/i.test(p.key));
  return {
    id: idm ? parseInt(idm[1], 10) : null,
    title, href,
    img: cleanThumb(IMG(imgEl)),
    score: Number.isFinite(score) ? score : null,
    members: membersTxt || "",
    airDate, synopsis,
    studios: studioProp ? (studioProp.links.length ? studioProp.links : [{ label: studioProp.text, href: "" }]) : [],
    genres: genreProps.flatMap((p) => (p.links.length ? p.links : [{ label: p.text, href: "" }])).filter((g) => g.label),
    source: props.find((p) => /^source$/i.test(p.key))?.text || "",
    node,
  };
}

function readSeason(doc) {
  const scope = doc || (typeof document !== "undefined" ? document : null);
  if (!scope || !scope.querySelector) return null;
  const box = scope.querySelector(".js-categories-seasonal");
  if (!box) return null;
  const sections = [...box.querySelectorAll(":scope > .seasonal-anime-list")].map((sec) => {
    const label = T(sec.querySelector(":scope > .anime-header"));
    const cards = [...sec.querySelectorAll(":scope > .seasonal-anime.js-seasonal-anime")]
      .map(parseCard).filter(Boolean);
    return { label, cards };
  }).filter((s) => s.label && s.cards.length);
  if (!sections.length) return null;
  const seen = new Set();
  const nav = [...scope.querySelectorAll('a[href*="/anime/season/"]')]
    .map((a) => ({ label: T(a), href: a.getAttribute("href") || "" }))
    .filter((l) => l.label && /\/anime\/season\/\d{4}\//.test(l.href))
    .filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))).slice(0, 12);
  return { sections, nav, total: sections.reduce((n, s) => n + s.cards.length, 0) };
}


/* ---------- construction ---------- */
function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtScore(v) { return v == null ? "N/A" : v.toFixed(2).replace(/0$/, ""); }

// Nœuds MAL déplacés : { slot, home, next, node } — restaurés au destroy.
const moved = [];
function claim(node, slot) {
  if (!node || !slot || node.dataset.aplClaimed) return;
  node.dataset.aplClaimed = "true";
  moved.push({ slot, home: node.parentNode, next: node.nextSibling, node });
  slot.appendChild(node);
}
function rollback() {
  while (moved.length) {
    const rec = moved.pop();
    try {
      delete rec.node.dataset.aplClaimed;
      if (rec.slot.contains(rec.node)) rec.slot.removeChild(rec.node);
      if (rec.home) rec.home.insertBefore(rec.node, rec.next);
    } catch { /* restauration best-effort */ }
  }
}

function currentTypeFilter() {
  const on = document.querySelector("ul.btn-seasonal li.js-btn-seasonal.on");
  return (on && on.dataset.key) || "all";
}

function renderHero(view, d) {
  const hero = el("section", "apl-season-hero", view);
  const meta = seasonFromPath(root.location?.pathname || "") || {};
  const h1nat = document.querySelector("h1.h1");
  const main = el("div", "apl-season-hero-main", hero);
  el("p", "apl-kind", main, "Saison");
  const h1 = el("h1", null, main, h1nat ? T(h1nat) : "Seasonal Anime");
  h1.id = "apl-season-title";
  const sub = [];
  if (meta.year) sub.push(String(meta.year));
  if (meta.season) sub.push(meta.season[0].toUpperCase() + meta.season.slice(1));
  sub.push(d.total + " anime");
  el("p", "apl-muted", main, sub.join(" · "));
  if (d.nav.length) {
    const nav = el("nav", "apl-season-nav", hero);
    nav.setAttribute("aria-label", "Autres saisons");
    d.nav.forEach((l) => {
      const nat = [...document.querySelectorAll('a[href*="/anime/season/"]')]
        .find((x) => (x.getAttribute("href") || "") === l.href && T(x) === l.label);
      if (nat && !nat.dataset.aplClaimed) {
        nat.classList.add("apl-season-link");
        claim(nat, nav);
      } else {
        const b = el("a", "apl-season-link", nav, l.label);
        b.href = l.href;
      }
    });
  }
}

function renderFilters(view) {
  const native = document.querySelector("ul.btn-seasonal");
  const bar = el("div", "apl-season-filters", view);
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filtrer par format");
  const active = currentTypeFilter();
  const btns = [...(native?.querySelectorAll("li.js-btn-seasonal") || [])]
    .map((li) => ({ key: li.dataset.key, label: T(li) }));
  const list = btns.length ? btns : [
    { key: "all", label: "All" }, { key: "1", label: "TV" },
    { key: "5", label: "ONA" }, { key: "2", label: "OVA" },
    { key: "3", label: "Movie" }, { key: "4", label: "Special" },
  ];
  list.forEach((item) => {
    const b = el("button", "apl-season-pill" + (item.key === active ? " on" : ""), bar, item.label);
    b.type = "button";
    b.dataset.key = item.key;
    b.setAttribute("aria-pressed", item.key === active ? "true" : "false");
  });
  // Écoute en CAPTURE sur window : un intercepteur global MAL au niveau
  // document stoppe la propagation avant notre barre (prouvé : win-cap passe,
  // doc-cap jamais). Filtrage strict sur nos pilules, aucun layout.
  window.addEventListener("click", (e) => {
    const b = e.target?.closest?.("#myapple-season .apl-season-pill");
    if (!b || !bar.contains(b) || !view.isConnected) return;
    const key = b.dataset.key;
    bar.querySelectorAll(".apl-season-pill").forEach((p) => {
      const on = p.dataset.key === key;
      p.classList.toggle("on", on);
      p.setAttribute("aria-pressed", String(on));
    });
    scheduleSync(view);
    // Délégation au filtre natif (source de vérité ; peut lever hors
    // contexte MAL complet — jamais bloquant pour nous).
    try {
      native?.querySelector('li.js-btn-seasonal[data-key="' + key + '"]')?.click();
    } catch { /* filtre natif indisponible : l'état visuel reste */ }
  }, true);
}

function cardHTML(c) {
  const genres = c.genres.slice(0, 4).map((g) =>
    g.href ? '<a class="apl-genre-pill" href="' + escapeHtml(g.href) + '">' + escapeHtml(g.label) + "</a>"
      : '<span class="apl-genre-pill">' + escapeHtml(g.label) + "</span>").join("");
  const studios = c.studios.map((s) =>
    s.href ? '<a href="' + escapeHtml(s.href) + '">' + escapeHtml(s.label) + "</a>" : escapeHtml(s.label)).join(", ");
  let h = '<div class="apl-season-poster"><a href="' + escapeHtml(c.href) + '" tabindex="-1" aria-hidden="true">';
  if (c.img) h += '<img src="' + escapeHtml(c.img) + '" alt="" loading="lazy">';
  h += "</a></div>" + '<div class="apl-season-body">'
    + '<h3 class="apl-season-title"><a href="' + escapeHtml(c.href) + '">' + escapeHtml(c.title) + "</a></h3>"
    + '<div class="apl-season-meta"><span class="apl-score"><span class="apl-star" aria-hidden="true">★</span> '
    + "<b>" + escapeHtml(fmtScore(c.score)) + "</b></span>";
  if (c.members) h += '<span class="apl-muted">' + escapeHtml(c.members) + " membres</span>";
  if (c.airDate) h += '<span class="apl-muted">' + escapeHtml(c.airDate) + "</span>";
  h += "</div>";
  if (studios) h += '<p class="apl-season-studio">' + studios + "</p>";
  if (genres) h += '<div class="apl-season-genres">' + genres + "</div>";
  if (c.synopsis) h += '<p class="apl-season-syn">' + escapeHtml(c.synopsis) + "</p>";
  h += '<div class="apl-season-actions"></div></div>';
  return h;
}


/* ---------- sync visibilite (filtre/tri natif MAL en AJAX) ---------- */
// Le filtre/tri natif masque des cartes en async ; on reflete l'etat visible
// sans reconstruire (jamais de full re-render dans le callback).
let syncQueued = false;
function scheduleSync(view) {
  if (syncQueued) return;
  syncQueued = true;
  const run = () => {
    syncQueued = false;
    try { syncVisibility(view); } catch { /* best-effort */ }
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(run, 60));
  else setTimeout(run, 120);
}
function syncVisibility(view) {
  let visible = 0;
  view.querySelectorAll(".apl-season-card").forEach((card) => {
    const src = card._aplSrc;
    const hidden = !!src && (src.style.display === "none" || src.classList.contains("js-hidden"));
    card.hidden = hidden;
    if (!hidden) visible++;
  });
  view.querySelectorAll(".apl-season-sec").forEach((sec) => {
    const any = [...sec.querySelectorAll(".apl-season-card")].some((c) => !c.hidden);
    sec.hidden = !any;
  });
  const count = view.querySelector(".apl-season-count");
  if (count) count.textContent = visible + " affiches";
}

function buildSeasonView() {
  if (document.getElementById("myapple-season")) return;
  if (!isSeasonPath(root.location?.pathname || "")) return;
  const box = document.querySelector(".js-categories-seasonal");
  const content = document.querySelector("#content");
  if (!box || !content) return;
  let d;
  try { d = readSeason(document); } catch { return; }
  if (!d) return;
  try {
    const view = el("div", null, null);
    view.id = "myapple-season";
    renderHero(view, d);
    renderFilters(view);
    const count = el("p", "apl-season-count apl-muted", view, d.total + " affiches");
    count.setAttribute("aria-live", "polite");
    d.sections.forEach((sec) => {
      const s = el("section", "apl-season-sec", view);
      el("h2", "apl-season-sec-title", s, sec.label);
      const grid = el("div", "apl-season-grid", s);
      sec.cards.forEach((c) => {
        const card = el("article", "apl-season-card", grid);
        card._aplSrc = c.node;
        card.innerHTML = cardHTML(c);
        const slot = card.querySelector(".apl-season-actions");
        const btns = c.node.querySelector(".information-item.buttons");
        if (btns) claim(btns, slot);
        const bc = c.node.querySelector(".broadcast");
        if (bc) claim(bc, slot);
      });
    });
    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-season");
    // DOM MAL dynamique (filtre/tri AJAX) : observer debounced 150 ms,
    // cible sur le conteneur natif, jamais de layout forcé dans le callback.
    let t = null;
    const mo = new MutationObserver(() => {
      if (t) return;
      t = setTimeout(() => { t = null; scheduleSync(view); }, 150);
    });
    mo.observe(box, { childList: true, subtree: true });
    view._aplObserver = mo;
    scheduleSync(view);
  } catch {
    rollback();
    document.getElementById("myapple-season")?.remove();
    document.body.classList.remove("myapple-season");
  }
}

function destroySeasonView() {
  try { document.getElementById("myapple-season")?._aplObserver?.disconnect(); } catch { /* non bloquant */ }
  rollback();
  document.getElementById("myapple-season")?.remove();
  document.body.classList.remove("myapple-season");
}

root.__myappleSeason = {
  isSeasonPath, seasonFromPath, readSeason, parseCard,
  buildSeasonView, destroySeasonView,
};
})();
