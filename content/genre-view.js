// Vue Genre (/anime/genre/<id>/<nom>) : EXTRACTION + RECONSTRUCTION.
// readGenre() lit le DOM MAL natif (h1.h1, count « Action Anime (5,043) »,
// description .genre-description, tuiles .seasonal-anime, pagination, statuts
// de suivi et note personnelle) ; buildGenreView() reconstruit hero + KPIs +
// répartition par type + filtres + grille/tableau + pagination. La description
// native est DÉPLACÉE (jamais dupliquée) et restaurée au destroy.
// Vue 100 % lecture : aucune écriture MAL, aucune requête réseau.
// Appel : window.__myappleGenre?.buildGenreView().
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
// Normaliseur STRING (T prend un élément DOM ; sur un texte brut il renverrait "").
const normTxt = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";
const fixImg = root.__myappleList?.fixImg
  || ((u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0]);

/* ---------- detection ---------- */
// Périmètre volontairement limité aux genres ANIME : le gabarit manga diverge.
function isGenrePath(path) {
  return /^\/anime\/genre\/\d+/.test(path || "");
}

/* ---------- types MAL (js-anime-type-N) ---------- */
const TYPES = {
  1: { label: "TV", group: "tv" },
  2: { label: "OVA", group: "ova" },
  3: { label: "Film", group: "movie" },
  4: { label: "Spécial", group: "other" },
  5: { label: "ONA", group: "ona" },
  6: { label: "Musique", group: "other" },
  7: { label: "CM", group: "other" },
  8: { label: "PV", group: "other" },
  9: { label: "TV Special", group: "other" },
};
const TYPE_FILTERS = [
  ["all", "Tout"],
  ["tv", "TV"],
  ["movie", "Films"],
  ["ova", "OVA"],
  ["ona", "ONA"],
  ["other", "Autres"],
];
const ST_FR = { 1: "En cours", 2: "Terminé", 3: "En pause", 4: "Abandonné", 6: "À voir" };

const FMT = (n) => Number.isFinite(n) ? n.toLocaleString("fr-FR") : "";
const COMPACT = typeof Intl !== "undefined"
  ? new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 })
  : { format: (n) => String(n) };

// « 4.4M » / « 417,895 » / « 1.2K » → nombre (tri + cumuls).
function parseCount(s) {
  const t = normTxt(s).replace(/\s/g, "");
  const m = t.match(/([\d.,]+)([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(n * mult);
}

/* ---------- parsing ---------- */
function parseCard(node) {
  if (!node || !node.querySelector) return null;
  const titleA = node.querySelector("h2.h2_anime_title a.link-title") || node.querySelector("h2 a[href]");
  const title = T(titleA);
  const href = titleA?.getAttribute("href") || "";
  if (!title || !href) return null;
  const idm = href.match(/\/anime\/(\d+)/);
  const imgEl = node.querySelector(".image img");
  const typeCode = parseInt((String(node.className || "").match(/js-anime-type-(\d+)\b/) || [])[1], 10);
  const type = TYPES[typeCode] || { label: "", group: "other" };
  const infoItems = [...node.querySelectorAll(".prodsrc .info > .item")].map(T).filter(Boolean);
  const air = infoItems[0] || "";
  const yearM = air.match(/\b(19|20)\d{2}\b/);
  const scoreTxt = T(node.querySelector(".scormem-item.score"));
  const scoreM = scoreTxt.match(/\d+(?:\.\d+)?/);
  const score = scoreM ? parseFloat(scoreM[0]) : null;
  const members = parseCount(T(node.querySelector(".scormem-item.member")));
  const statusA = node.querySelector("a.js-anime-watch-status, a.Lightbox_AddEdit");
  const statusRaw = statusA?.querySelector("[data-status]")?.getAttribute("data-status")
    || statusA?.getAttribute("data-status") || "";
  const statusCode = parseInt(statusRaw, 10);
  const status = Number.isFinite(statusCode) && ST_FR[statusCode]
    ? { code: statusCode, label: ST_FR[statusCode] } : null;
  const ownRaw = T(node.querySelector(".information-item.buttons .bubble.anime.score .bubble-item.content"));
  const ownM = ownRaw.match(/\d+(?:\.\d+)?/);
  const ownScore = ownM ? parseFloat(ownM[0]) : null;
  // Propriétés : studio / genres / thèmes / démographie (noms + liens).
  const props = [...node.querySelectorAll(".synopsis .properties .property")].map((p) => {
    const key = T(p.querySelector(".caption"));
    const links = [...p.querySelectorAll(".item a")]
      .map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label);
    const itemEl = p.querySelector(".item");
    return { key, text: itemEl ? T(itemEl) : "", links };
  }).filter((p) => p.key);
  const studioProp = props.find((p) => /^studios?$/i.test(p.key));
  const studioLinks = studioProp ? (studioProp.links.length ? studioProp.links : [{ label: studioProp.text, href: "" }]) : [];
  const genres = props.filter((p) => /^(genres?|themes?|theme|demographics?|demographic)$/i.test(p.key))
    .flatMap((p) => (p.links.length ? p.links : [{ label: p.text, href: "" }]))
    .map((g) => g.label).filter(Boolean);
  return {
    id: idm ? parseInt(idm[1], 10) : null,
    title,
    subtitle: T(node.querySelector(".h3_anime_subtitle")),
    url: href,
    img: imgEl ? fixImg(IMG(imgEl)) : "",
    type: type.label,
    group: type.group,
    year: yearM ? parseInt(yearM[0], 10) : null,
    air,
    airStatus: infoItems[1] || "",
    episodes: infoItems[2] || "",
    score: Number.isFinite(score) ? score : null,
    members,
    studio: studioLinks[0] || null,
    genres,
    status,
    ownScore: Number.isFinite(ownScore) ? ownScore : null,
  };
}

function parsePager(data) {
  const scope = data || document;
  const box = scope.querySelector("#content .pagination");
  if (!box) return [];
  return [...box.querySelectorAll("a")].map((a) => ({
    label: T(a),
    href: a.getAttribute("href") || "",
    current: a.classList.contains("current"),
  })).filter((l) => l.label && l.href);
}

function rangeFromPager(pager) {
  const cur = pager.find((l) => l.current);
  const m = cur ? cur.label.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/) : null;
  if (!m) return null;
  return {
    start: parseInt(m[1].replace(/,/g, ""), 10),
    end: parseInt(m[2].replace(/,/g, ""), 10),
  };
}

function readGenre(_scope) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || !doc.querySelector) return null;
  const content = doc.querySelector("#content");
  if (!content) return null;
  let d;
  try { d = collect(content, doc); } catch { d = null; }
  return d || {
    id: null, name: null, total: null, range: null, description: null,
    descriptionNode: null, works: [], pager: [],
  };
}

function collect(content, doc) {
  const idm = (root.location?.pathname || "").match(/^\/anime\/genre\/(\d+)/);
  const id = idm ? parseInt(idm[1], 10) : null;
  const h1 = doc.querySelector("h1.h1");
  const rawName = T(h1);
  const name = rawName ? rawName.replace(/\s+anime$/i, "").trim() : null;
  const countText = [...content.querySelectorAll(".normal_header span.di-ib, .normal_header .fw-n")]
    .map(T).find((t) => /\(\s*[\d,]+\s*\)/.test(t)) || "";
  const countM = countText.match(/\(\s*([\d,]+)\s*\)/);
  const total = countM ? parseInt(countM[1].replace(/,/g, ""), 10) : null;
  const descriptionNode = content.querySelector(".genre-description");
  const works = [...content.querySelectorAll(".js-categories-seasonal .seasonal-anime.js-seasonal-anime")]
    .map(parseCard).filter(Boolean);
  const pager = parsePager(doc);
  if (!name && !works.length) return null;
  return {
    id, name, url: root.location?.href || null,
    total: Number.isFinite(total) ? total : null,
    range: rangeFromPager(pager),
    description: descriptionNode ? T(descriptionNode) : null,
    descriptionNode: descriptionNode || null,
    works, pager,
  };
}

/* ---------- construction ---------- */
function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

// Déplacements suivis (description MAL déplacée dans notre hero) → rollback.
const moved = [];
function moveInto(node, dest) {
  if (!node || !dest) return false;
  moved.push({ node, parent: node.parentNode, next: node.nextSibling });
  dest.appendChild(node);
  return true;
}
function rollback() {
  for (const { node, parent, next } of moved.splice(0)) {
    try {
      if (!parent) continue;
      if (next && next.parentNode === parent) parent.insertBefore(node, next);
      else parent.appendChild(node);
    } catch { /* parent détaché : abandon */ }
  }
}

function card(main, title, cls, id) {
  const s = el("section", "apl-card " + (cls || ""), main);
  if (id) s.id = id;
  const h = el("header", null, s);
  el("h2", null, h, title);
  return { section: s, header: h, body: el("div", "apl-card-body", s) };
}

function kpi(parent, value, label) {
  const k = el("div", "apl-kpi", parent);
  el("b", null, k, value);
  el("span", null, k, label);
}

/* ---------- répartition par type ---------- */
const SEG_CLASS = { tv: "seg-tv", movie: "seg-movie", ova: "seg-ova", ona: "seg-ona", other: "seg-other" };

function countGroups(works) {
  const counts = { tv: 0, movie: 0, ova: 0, ona: 0, other: 0 };
  works.forEach((w) => { if (counts[w.group] !== undefined) counts[w.group] += 1; });
  return counts;
}

function buildTypeBar(parent, counts) {
  const items = TYPE_FILTERS.slice(1).filter(([key]) => counts[key] > 0);
  if (!items.length) return;
  const bar = el("div", "apl-typebar", parent);
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", "Répartition par type : " + items
    .map(([key, label]) => `${label} ${counts[key]}`).join(", "));
  items.forEach(([key]) => {
    const seg = el("span", "apl-typebar-seg " + SEG_CLASS[key], bar);
    seg.style.flexGrow = String(counts[key]);
    seg.style.flexBasis = "0";
    seg.title = String(counts[key]);
  });
  const legend = el("div", "apl-typebar-legend", parent);
  items.forEach(([key, label]) => {
    const item = el("span", "apl-legend-item", legend);
    el("i", "apl-legend-dot " + SEG_CLASS[key], item);
    el("span", "apl-legend-label", item, label);
    el("b", "apl-legend-num", item, String(counts[key]));
  });
}

/* ---------- œuvres : tri / filtre / rendu ---------- */
const WORK_SORTS = [
  ["members", "Membres ↓"],
  ["score", "Note ↓"],
  ["date", "Plus récent"],
  ["date-asc", "Plus ancien"],
  ["title", "Titre A→Z"],
];

function workSort(a, b, mode) {
  switch (mode) {
    case "score": return (b.score || 0) - (a.score || 0);
    case "date": return (b.year || 0) - (a.year || 0);
    case "date-asc": return (a.year || 9999) - (b.year || 9999);
    case "title": return (a.title || "").localeCompare(b.title || "", "fr");
    case "members":
    default: return (b.members || 0) - (a.members || 0);
  }
}

function workMatches(w, q) {
  if (!q) return true;
  const hay = [w.title, w.subtitle, w.type, w.year, w.studio?.label, w.genres.join(" ")]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function workCard(parent, w) {
  const item = el("article", "apl-work", parent);
  const media = el("div", "apl-work-media", item);
  const link = el("a", "apl-work-thumb-link", media);
  link.href = w.url || "#";
  link.tabIndex = -1;
  link.setAttribute("aria-hidden", "true");
  if (w.img) {
    const im = el("img", "apl-work-thumb", link);
    im.src = w.img; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
  }
  if (w.status) el("span", "apl-work-status st-" + w.status.code, media, w.status.label);
  if (w.score !== null) {
    const badge = el("span", "apl-work-score", media);
    badge.setAttribute("aria-label", "Note " + w.score.toFixed(2) + " sur 10");
    const star = el("i", "apl-work-star", badge);
    star.setAttribute("aria-hidden", "true");
    star.textContent = "★";
    el("b", null, badge, w.score.toFixed(2));
  }
  const body = el("div", "apl-work-body", item);
  const titleA = el("a", "apl-work-title", body, w.title);
  titleA.href = w.url || "#";
  if (w.subtitle) el("p", "apl-work-subtitle", body, w.subtitle);
  const meta = el("div", "apl-work-meta", body);
  const bits = [w.type, w.year].filter(Boolean).join(" · ");
  if (bits) el("span", "apl-work-sub", meta, bits);
  const studio = w.studio?.label || "";
  if (studio) {
    if (w.studio.href) {
      const a = el("a", "apl-work-studio", meta, studio);
      a.href = w.studio.href;
    } else el("span", "apl-work-studio", meta, studio);
  }
  const foot = el("div", "apl-work-foot", body);
  if (w.members !== null) el("span", null, foot, FMT(w.members) + " membres");
  if (w.ownScore !== null) {
    const own = el("span", "apl-work-own", foot);
    own.setAttribute("title", "Votre note");
    own.setAttribute("aria-label", "Votre note : " + w.ownScore);
    const star = el("i", null, own, "★");
    star.setAttribute("aria-hidden", "true");
    el("b", null, own, String(w.ownScore));
  }
  return item;
}

function workRow(parent, w, index) {
  const tr = el("tr", null, parent);
  el("td", "apl-col-idx", tr, String(index + 1));
  const tdTitle = el("td", "apl-col-title", tr);
  const a = el("a", "apl-row-link", tdTitle);
  a.href = w.url || "#";
  if (w.img) {
    const im = el("img", "apl-row-thumb", a);
    im.src = w.img; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
  }
  const titles = el("span", "apl-row-titles", a);
  el("span", "apl-row-title", titles, w.title);
  if (w.subtitle) el("span", "apl-row-subtitle", titles, w.subtitle);
  el("td", "apl-col-type", tr, w.type || "—");
  const tdStudio = el("td", "apl-col-studio", tr);
  if (w.studio?.label) {
    if (w.studio.href) {
      const s = el("a", null, tdStudio, w.studio.label);
      s.href = w.studio.href;
    } else tdStudio.textContent = w.studio.label;
  } else tdStudio.textContent = "—";
  el("td", "apl-col-score", tr, w.score !== null ? w.score.toFixed(2) : "—");
  el("td", "apl-col-members", tr, w.members !== null ? FMT(w.members) : "—");
  el("td", "apl-col-year", tr, w.year ? String(w.year) : "—");
  const tdStatus = el("td", "apl-col-status", tr);
  if (w.status) el("span", "apl-status-badge st-" + w.status.code, tdStatus, w.status.label);
  else el("span", "apl-dash", tdStatus, "—");
  return tr;
}

function buildWorks(body, header, works, mineCount) {
  const countEl = el("span", "apl-card-count", header);
  const tools = el("div", "apl-works-tools", body);
  const chips = el("div", "apl-type-chips", tools);
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Filtrer les titres par type");
  const counts = countGroups(works);
  TYPE_FILTERS.forEach(([key, label]) => {
    const n = key === "all" ? works.length : (counts[key] || 0);
    if (key !== "all" && !n) return;
    const b = el("button", "apl-chip", chips);
    b.type = "button";
    b.dataset.type = key;
    b.setAttribute("aria-pressed", String(key === "all"));
    b.appendChild(document.createTextNode(label));
    if (n) el("b", null, b, String(n));
  });

  const bar = el("div", "apl-works-bar", tools);
  const search = el("input", "apl-works-search", bar);
  search.type = "search";
  search.placeholder = "Filtrer par titre, studio, genre…";
  search.setAttribute("aria-label", "Filtrer les titres du genre");
  const sort = el("select", "apl-works-sort", bar);
  sort.setAttribute("aria-label", "Trier les titres");
  WORK_SORTS.forEach(([v, label]) => {
    const o = el("option", null, sort, label);
    o.value = v;
  });
  let mineBtn = null;
  if (mineCount > 0) {
    mineBtn = el("button", "apl-mine-btn", bar);
    mineBtn.type = "button";
    mineBtn.setAttribute("aria-pressed", "false");
    mineBtn.appendChild(document.createTextNode("Ma liste"));
    el("b", null, mineBtn, String(mineCount));
  }
  const toggle = el("div", "apl-view-toggle", bar);
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-label", "Mode d'affichage");
  const gridBtn = el("button", "apl-view-btn", toggle, "Grille");
  gridBtn.type = "button";
  gridBtn.dataset.view = "grid";
  gridBtn.setAttribute("aria-pressed", "true");
  const tableBtn = el("button", "apl-view-btn", toggle, "Tableau");
  tableBtn.type = "button";
  tableBtn.dataset.view = "table";
  tableBtn.setAttribute("aria-pressed", "false");

  const grid = el("div", "apl-works", body);
  const tableWrap = el("div", "apl-table-wrap", body);
  tableWrap.hidden = true;
  const table = el("table", "apl-works-table", tableWrap);
  el("caption", "apl-sr-only", table, "Titres du genre");
  const thead = el("thead", null, table);
  const hrow = el("tr", null, thead);
  [["#", "apl-col-idx"], ["Titre", "apl-col-title"], ["Type", "apl-col-type"],
    ["Studio", "apl-col-studio"], ["Note", "apl-col-score"], ["Membres", "apl-col-members"],
    ["Année", "apl-col-year"], ["Ma liste", "apl-col-status"]]
    .forEach(([label, cls]) => {
      const th = el("th", cls, hrow, label);
      th.scope = "col";
    });
  const tbody = el("tbody", null, table);
  const empty = el("p", "apl-works-empty", body, "Aucun titre ne correspond à ce filtre.");
  empty.hidden = true;

  const state = { q: "", sort: "members", type: "all", view: "grid", mine: false };
  const visible = () => works.filter((w) => {
    if (state.mine && !w.status) return false;
    if (state.type !== "all" && w.group !== state.type) return false;
    return workMatches(w, state.q);
  });
  const draw = () => {
    const list = visible().slice().sort((a, b) => workSort(a, b, state.sort));
    grid.textContent = "";
    tbody.textContent = "";
    if (state.view === "grid") {
      const frag = document.createDocumentFragment();
      list.forEach((w) => workCard(frag, w));
      grid.appendChild(frag);
    } else {
      const frag = document.createDocumentFragment();
      list.forEach((w, i) => workRow(frag, w, i));
      tbody.appendChild(frag);
    }
    grid.hidden = state.view !== "grid";
    tableWrap.hidden = state.view !== "table";
    countEl.textContent = list.length === works.length
      ? `${works.length} titre${works.length > 1 ? "s" : ""}`
      : `${list.length} / ${works.length} titres`;
    empty.hidden = list.length > 0;
  };

  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button.apl-chip");
    if (!b || !chips.contains(b)) return;
    state.type = b.dataset.type || "all";
    [...chips.querySelectorAll("button.apl-chip")]
      .forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    draw();
  });
  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = normTxt(search.value).toLowerCase(); draw(); }, 120);
  });
  sort.addEventListener("change", () => { state.sort = sort.value; draw(); });
  if (mineBtn) {
    mineBtn.addEventListener("click", () => {
      state.mine = !state.mine;
      mineBtn.setAttribute("aria-pressed", String(state.mine));
      draw();
    });
  }
  const setView = (v) => {
    state.view = v === "table" ? "table" : "grid";
    gridBtn.setAttribute("aria-pressed", String(state.view === "grid"));
    tableBtn.setAttribute("aria-pressed", String(state.view === "table"));
    draw();
  };
  gridBtn.addEventListener("click", () => setView("grid"));
  tableBtn.addEventListener("click", () => setView("table"));
  draw();
}

/* ---------- pagination ---------- */
function buildPager(parent, pager) {
  if (!pager.length) return;
  const nav = el("nav", "apl-pager", parent);
  nav.setAttribute("aria-label", "Pagination du genre");
  el("span", "apl-pager-label", nav, "Pages");
  pager.forEach((l) => {
    const a = el("a", "apl-pager-link", nav, l.label);
    a.href = l.href;
    if (l.current) a.setAttribute("aria-current", "page");
  });
}

/* ---------- build ---------- */
function buildGenreView() {
  if (document.getElementById("myapple-genre")) return;
  const path = root.location?.pathname || "";
  if (!isGenrePath(path)) return;
  const content = document.querySelector("#content");
  if (!content) return;

  let d;
  try { d = readGenre(content); } catch { return; }
  // Gate de données : rien de significatif → MAL natif.
  if (!d || (!d.name && !d.works.length)) return;

  const view = document.createElement("div");
  view.id = "myapple-genre";

  try {
    // ---- Hero : identité + KPIs + répartition + description ----
    const hero = el("section", "apl-hero", view);
    const heroMain = el("div", "apl-hero-main", hero);
    const who = el("div", "apl-who", heroMain);
    el("p", "apl-kind", who, "Genre anime");
    if (d.name) el("h1", null, who, d.name);
    const sub = ["Anime"];
    if (d.total !== null) sub.push(`${FMT(d.total)} titres`);
    if (d.range) sub.push(`${FMT(d.range.start)}–${FMT(d.range.end)}`);
    el("p", "apl-alt", who, sub.join(" · "));

    const kpis = el("div", "apl-kpis", who);
    if (d.total !== null) kpi(kpis, FMT(d.total), "Titres");
    const scored = d.works.filter((w) => w.score !== null);
    if (scored.length) {
      const avg = scored.reduce((s, w) => s + w.score, 0) / scored.length;
      kpi(kpis, avg.toFixed(2), "Note moyenne");
    }
    const mineCount = d.works.filter((w) => w.status).length;
    if (mineCount) kpi(kpis, String(mineCount), "Dans ma liste");
    const membersSum = d.works.reduce((s, w) => s + (w.members || 0), 0);
    if (membersSum) kpi(kpis, COMPACT.format(membersSum), "Membres");

    if (d.works.length) buildTypeBar(who, countGroups(d.works));

    if (d.descriptionNode || d.description) {
      const panel = el("div", "apl-hero-panel", who);
      const block = el("section", "apl-panel-block apl-sec-desc", panel);
      block.id = "apl-genre-desc";
      el("h3", null, block, "À propos");
      const body = el("div", "apl-panel-body", block);
      if (d.descriptionNode) moveInto(d.descriptionNode, body);
      else body.textContent = d.description || "";
    }

    // ---- Titres ----
    const c = card(view, "Titres", "apl-sec-works", "apl-genre-works");
    buildWorks(c.body, c.header, d.works, mineCount);

    // ---- Pagination native reconstruite ----
    buildPager(view, d.pager);

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-genre");
  } catch {
    rollback();
    document.getElementById("myapple-genre")?.remove();
    document.body.classList.remove("myapple-genre");
    return;
  }
}

function destroyGenreView() {
  rollback();
  document.getElementById("myapple-genre")?.remove();
  document.body.classList.remove("myapple-genre");
}

root.__myappleGenre = {
  isGenrePath, readGenre, parseCard, parsePager, rangeFromPager, buildGenreView, destroyGenreView,
};
})();
