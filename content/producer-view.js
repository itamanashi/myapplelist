// Vue Producer / Studio (/anime/producer/<id>/<nom> ou /anime/studio/<id>/<nom>) :
// EXTRACTION + RECONSTRUCTION. readProducer() lit le DOM MAL natif (h1.title-name,
// logo .content-left .logo, .dark_text détails, bio, site officiel, tuiles
// `.seasonal-anime` des œuvres, `.news-unit`) ; buildProducerView() reconstruit
// hero + KPIs + répartition par type + filtres + grille/tableau + actualités.
// Vue 100 % lecture : aucune écriture MAL, aucune requête réseau.
// Appel : window.__myappleProducer?.buildProducerView().
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
// Normaliseur STRING (T prend un élément DOM ; sur un texte brut il renverrait "").
const normTxt = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

/* ---------- detection ---------- */
function isProducerPath(path) {
  return /^\/anime\/(producer|studio)\/\d+/.test(path || "");
}

/* ---------- types MAL (js-anime-type-N) ---------- */
// 1 TV, 2 OVA, 3 Film, 4 Spécial, 5 ONA, 6 Musique, 9 TV Special.
// `group` = axe de filtre : les types rares sont regroupés dans « Autres ».
const TYPES = {
  1: { label: "TV", group: "tv" },
  2: { label: "OVA", group: "ova" },
  3: { label: "Film", group: "movie" },
  4: { label: "Spécial", group: "other" },
  5: { label: "ONA", group: "ona" },
  6: { label: "Musique", group: "other" },
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

/* ---------- helpers ---------- */
const fixImg = root.__myappleList?.fixImg
  || ((u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0]);
const PROD_ID = /^\/anime\/(producer|studio)\/(\d+)/;
const FMT = (n) => Number.isFinite(n) ? n.toLocaleString("fr-FR") : "";
const COMPACT = typeof Intl !== "undefined"
  ? new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 })
  : { format: (n) => String(n) };
const firstNum = (s) => {
  const m = normTxt(s).match(/\d+(?:[.,]\d+)?/);
  return m ? m[0] : "";
};

/* ---------- parsing détails (lecture seule, DOM intact) ---------- */
// Même gabarit que people : `<span.dark_text>Label:</span>` + valeur, en div
// (`div.spaceit_pad`) ou noyée en frères directs.
function detailValue(span) {
  const label = normTxt(span?.textContent).replace(/:$/, "").trim();
  if (!label) return "";
  const pn = span.parentElement;
  const inDiv = pn?.tagName === "DIV"
    && ![...pn.querySelectorAll("span.dark_text")].some((s) => s !== span);
  if (inDiv) {
    const full = T(pn);
    const prefix = label + ":";
    return full === prefix ? "" : normTxt(full.slice(prefix.length));
  }
  const parts = [];
  let n = span.nextSibling;
  while (n) {
    if (n.nodeType === 3) parts.push(n.nodeValue || "");
    else if (n.querySelectorAll && [...n.querySelectorAll("span.dark_text")].length) break;
    else if (n.tagName === "DIV") break;
    else parts.push(T(n));
    n = n.nextSibling;
  }
  return normTxt(parts.join(" "));
}

function detailRows(scope) {
  return [...scope.querySelectorAll("span.dark_text")].map((span) => {
    const label = normTxt(span?.textContent).replace(/:$/, "").trim();
    return [label, detailValue(span)];
  }).filter((row) => row[0] && row[1] !== undefined);
}

/* ---------- parsing tuile œuvre ---------- */
function parseTile(tile) {
  if (!tile?.querySelector) return null;
  const titleA = tile.querySelector(".title a") || tile.querySelector("a[href*='/anime/']");
  const title = normTxt(titleA?.textContent);
  if (!title) return null;
  const url = titleA.getAttribute("href") || "";
  const idm = url.match(/\/anime\/(\d+)/);
  const imgEl = tile.querySelector(".image img, .picSurround img");
  const typeCode = parseInt((String(tile.className || "").match(/js-anime-type-(\d+)\b/) || [])[1], 10);
  const type = TYPES[typeCode] || { label: "", group: "other" };
  const scoreRaw = firstNum(tile.querySelector(".js-score")?.textContent
    || tile.querySelector(".stars")?.textContent);
  const membersRaw = (tile.querySelector(".js-members")?.textContent
    || tile.querySelector(".users")?.textContent || "").replace(/[^\d]/g, "");
  const dateRaw = normTxt(tile.querySelector(".js-start_date")?.textContent);
  const score = scoreRaw ? parseFloat(scoreRaw.replace(",", ".")) : null;
  const members = membersRaw ? parseInt(membersRaw, 10) : null;
  const editA = tile.querySelector("a.Lightbox_AddEdit, a.addtolist");
  const code = editA ? parseInt(editA.getAttribute("data-status") || "", 10) : NaN;
  const status = Number.isFinite(code) && ST_FR[code] ? { code, label: ST_FR[code] } : null;
  return {
    id: idm ? parseInt(idm[1], 10) : null,
    img: imgEl ? fixImg(IMG(imgEl)) : "",
    title,
    url,
    type: type.label,
    group: type.group,
    relation: normTxt(tile.querySelector(".category")?.textContent),
    year: /^\d{8}$/.test(dateRaw) ? parseInt(dateRaw.slice(0, 4), 10) : null,
    score: Number.isFinite(score) ? score : null,
    members: Number.isFinite(members) ? members : null,
    status,
  };
}

/* ---------- parsing actualité ---------- */
function parseNews(unit) {
  if (!unit?.querySelector) return null;
  const a = unit.querySelector(".title a") || unit.querySelector("a.image-link");
  const title = normTxt(a?.textContent);
  if (!title) return null;
  const img = unit.querySelector(".image-link img, img.image");
  const info = normTxt(unit.querySelector(".information .info")?.textContent);
  const date = info.replace(/\s+by\s+.*$/i, "").replace(/\s*\d+\s*Comments?$/i, "").trim();
  return {
    title,
    url: a.getAttribute("href") || a.href || "",
    img: img ? fixImg(IMG(img)) : "",
    text: normTxt(unit.querySelector(".text")?.textContent),
    date,
    author: normTxt(unit.querySelector(".information .info a[href*='/profile/']")?.textContent),
    comments: normTxt(unit.querySelector(".comment")?.textContent),
    tags: [...unit.querySelectorAll(".information .tags a")].map((t) => normTxt(t.textContent)).filter(Boolean).slice(0, 3),
  };
}

/* ---------- lecture ---------- */
function readProducer(_scope) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || !doc.querySelector) return null;
  const content = doc.querySelector("#content");
  if (!content) return null;
  let d;
  try { d = collect(content, doc); } catch { d = null; }
  return d || {
    id: null, kind: null, url: null, name: null, portrait: null, japanese: null,
    established: null, founded: null, favorites: null, website: null,
    details: [], bioText: null, bioNode: null, works: [], news: [],
  };
}

function collect(content, doc) {
  const left = content.querySelector(".content-left") || content;
  const h1 = doc.querySelector("h1.title-name");
  const idm = (root.location?.pathname || "").match(PROD_ID);
  const kind = idm ? idm[1] : null;
  const id = idm ? parseInt(idm[2], 10) : null;
  const name = T(h1) || null;
  // Logo : image `.logo` de la colonne native (jamais une vignette d'œuvre).
  const logoEl = left.querySelector(".logo img");
  const rows = detailRows(left);
  const map = new Map(rows);
  // Champs promus dans le hero : on ne les répète pas dans « Informations ».
  const PROMOTED = new Set(["Japanese", "Established", "Member Favorites"]);
  const details = rows.filter((r) => !PROMOTED.has(r[0]));
  // Bio : `div.spaceit_pad` sans `span.dark_text`, texte long (span direct).
  const bioEl = [...left.querySelectorAll(".spaceit_pad > span")]
    .find((s) => !s.classList.contains("dark_text") && normTxt(s.textContent).length > 40) || null;
  const siteA = left.querySelector(".user-profile-sns a[href^='http']");
  const favRaw = map.get("Member Favorites") || "";
  const founded = (map.get("Established") || "").match(/\b(19|20)\d{2}\b/);
  const works = [...content.querySelectorAll(".seasonal-anime.js-seasonal-anime")]
    .map(parseTile).filter(Boolean);
  const news = [...content.querySelectorAll(".news-unit")].map(parseNews).filter(Boolean).slice(0, 8);
  if (!name && !logoEl && !works.length) return null;
  return {
    id, kind, url: root.location?.href || null, name,
    portrait: logoEl ? fixImg(IMG(logoEl)) : null,
    japanese: normTxt(map.get("Japanese") || "") || null,
    established: normTxt(map.get("Established") || "") || null,
    founded: founded ? parseInt(founded[0], 10) : null,
    favorites: favRaw ? (parseInt(favRaw.replace(/[^\d]/g, ""), 10) || null) : null,
    website: siteA ? { href: siteA.getAttribute("href") || siteA.href, label: normTxt(siteA.textContent) || "Site officiel" } : null,
    details,
    bioText: bioEl ? T(bioEl) : null,
    bioNode: bioEl || null,
    works, news,
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

// Déplacements suivis (bio MAL déplacée dans notre card) → rollback/restore.
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

// Observeur du sommaire (état actif) : déconnecté au destroy pour ne rien fuir.
let tocObserver = null;

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
    seg.title = `${counts[key]}`;
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
  const hay = [w.title, w.type, w.relation, w.year].filter(Boolean).join(" ").toLowerCase();
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
  if (w.status) {
    el("span", "apl-work-status st-" + w.status.code, media, w.status.label);
  }
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
  const meta = el("div", "apl-work-meta", body);
  const bits = [w.type, w.year].filter(Boolean).join(" · ");
  if (bits) el("span", "apl-work-sub", meta, bits);
  if (w.relation) el("span", "apl-work-rel", meta, w.relation);
  if (w.members !== null) {
    el("div", "apl-work-foot", body, FMT(w.members) + " membres");
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
  el("span", "apl-row-title", a, w.title);
  el("td", "apl-col-type", tr, w.type || "—");
  el("td", "apl-col-rel", tr, w.relation || "—");
  el("td", "apl-col-score", tr, w.score !== null ? w.score.toFixed(2) : "—");
  el("td", "apl-col-members", tr, w.members !== null ? FMT(w.members) : "—");
  el("td", "apl-col-year", tr, w.year ? String(w.year) : "—");
  const tdStatus = el("td", "apl-col-status", tr);
  if (w.status) el("span", "apl-status-badge st-" + w.status.code, tdStatus, w.status.label);
  else el("span", "apl-dash", tdStatus, "—");
  return tr;
}

function buildWorks(body, header, works) {
  const countEl = el("span", "apl-card-count", header);
  const tools = el("div", "apl-works-tools", body);
  const chips = el("div", "apl-type-chips", tools);
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Filtrer les œuvres par type");
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
  search.placeholder = "Filtrer par titre, type, année…";
  search.setAttribute("aria-label", "Filtrer les œuvres du studio");
  const sort = el("select", "apl-works-sort", bar);
  sort.setAttribute("aria-label", "Trier les œuvres");
  WORK_SORTS.forEach(([v, label]) => {
    const o = el("option", null, sort, label);
    o.value = v;
  });
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
  el("caption", "apl-sr-only", table, "Œuvres du studio");
  const thead = el("thead", null, table);
  const hrow = el("tr", null, thead);
  [["#", "apl-col-idx"], ["Titre", "apl-col-title"], ["Type", "apl-col-type"],
    ["Relation", "apl-col-rel"], ["Note", "apl-col-score"], ["Membres", "apl-col-members"],
    ["Année", "apl-col-year"], ["Ma liste", "apl-col-status"]]
    .forEach(([label, cls]) => {
      const th = el("th", cls, hrow, label);
      th.scope = "col";
    });
  const tbody = el("tbody", null, table);
  const empty = el("p", "apl-works-empty", body, "Aucune œuvre ne correspond à ce filtre.");
  empty.hidden = true;

  const state = { q: "", sort: "members", type: "all", view: "grid" };
  const draw = () => {
    const list = works
      .filter((w) => (state.type === "all" || w.group === state.type) && workMatches(w, state.q))
      .slice()
      .sort((a, b) => workSort(a, b, state.sort));
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
      ? `${works.length} œuvre${works.length > 1 ? "s" : ""}`
      : `${list.length} / ${works.length} œuvres`;
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

/* ---------- actualités ---------- */
function buildNews(body, news) {
  const list = el("ul", "apl-news", body);
  news.forEach((n) => {
    const li = el("li", "apl-news-item", list);
    if (n.img) {
      const thumb = el("a", "apl-news-thumb", li);
      thumb.href = n.url || "#";
      thumb.tabIndex = -1;
      thumb.setAttribute("aria-hidden", "true");
      const im = el("img", null, thumb);
      im.src = n.img; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
    }
    const main = el("div", "apl-news-main", li);
    const h3 = el("h3", "apl-news-title", main);
    const a = el("a", null, h3, n.title);
    a.href = n.url || "#";
    if (n.text) el("p", "apl-news-text", main, n.text);
    const meta = el("div", "apl-news-meta", main);
    if (n.date) el("span", null, meta, n.date);
    if (n.author) el("span", "apl-news-author", meta, "par " + n.author);
    if (n.comments) el("span", "apl-news-comments", meta, n.comments);
    if (n.tags.length) {
      const tags = el("div", "apl-news-tags", meta);
      n.tags.forEach((t) => el("span", "apl-news-tag", tags, t));
    }
  });
}

/* ---------- build ---------- */
function buildProducerView() {
  if (document.getElementById("myapple-producer")) return;
  const path = root.location?.pathname || "";
  if (!isProducerPath(path)) return;
  const content = document.querySelector("#content");
  if (!content) return;

  let d;
  try { d = readProducer(content); } catch { return; }
  // Gate de données : rien de significatif → MAL natif.
  if (!d || (!d.name && !d.portrait && !d.works.length && !d.news.length)) return;

  const view = document.createElement("div");
  view.id = "myapple-producer";

  try {
    // ---- Hero : logo + identité + KPIs + répartition ----
    const hero = el("section", "apl-hero", view);
    const heroMain = el("div", "apl-hero-main", hero);
    if (d.portrait) {
      const wrap = el("div", "apl-poster", heroMain);
      const im = el("img", null, wrap);
      im.src = d.portrait; im.alt = d.name || "Logo";
    }
    const who = el("div", "apl-who", heroMain);
    el("p", "apl-kind", who, d.kind === "studio" ? "Studio d'animation" : "Producteur");
    if (d.name) el("h1", null, who, d.name);
    if (d.japanese) el("p", "apl-alt", who, d.japanese);

    if (d.website) {
      const meta = el("div", "apl-meta", who);
      const a = el("a", "apl-meta-chip apl-meta-link", meta, d.website.label + " ↗");
      a.href = d.website.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", "Site officiel : " + d.website.label + " (nouvel onglet)");
    }

    const kpis = el("div", "apl-kpis", who);
    if (d.works.length) kpi(kpis, String(d.works.length), "Œuvres");
    const scored = d.works.filter((w) => w.score !== null);
    if (scored.length) {
      const avg = scored.reduce((s, w) => s + w.score, 0) / scored.length;
      kpi(kpis, avg.toFixed(2), "Note moyenne");
    }
    if (d.favorites !== null) kpi(kpis, FMT(d.favorites), "Favoris");
    if (d.founded) kpi(kpis, String(d.founded), "Fondation");

    if (d.works.length) buildTypeBar(who, countGroups(d.works));

    // ---- Panneau : bio + informations, sous les KPIs ----
    const hasBio = !!(d.bioNode || d.bioText);
    if (hasBio || d.details.length) {
      const panel = el("div", "apl-hero-panel", who);
      if (hasBio) {
        const block = el("section", "apl-panel-block apl-sec-bio", panel);
        block.id = "apl-producer-bio";
        el("h3", null, block, "À propos");
        const body = el("div", "apl-panel-body", block);
        if (d.bioNode) moveInto(d.bioNode, body);
        else body.textContent = d.bioText || "";
      }
      if (d.details.length) {
        const block = el("section", "apl-panel-block apl-sec-infos", panel);
        block.id = "apl-producer-infos";
        el("h3", null, block, "Informations");
        const grid = el("dl", "apl-infos", block);
        d.details.forEach(([label, value]) => {
          el("dt", null, grid, label);
          el("dd", null, grid, value || "—");
        });
      }
    }

    // ---- Œuvres : pleine largeur sous le hero ----
    const sections = [];
    if (d.works.length) {
      const c = card(view, "Anime", "apl-sec-works", "apl-producer-works");
      buildWorks(c.body, c.header, d.works);
      sections.push(["apl-producer-works", `Anime (${d.works.length})`]);
    }

    // ---- Actualités ----
    if (d.news.length) {
      const c = card(view, "Actualités", "apl-sec-news", "apl-producer-news");
      el("span", "apl-card-count", c.header, String(d.news.length));
      buildNews(c.body, d.news);
      sections.push(["apl-producer-news", "Actualités"]);
    }

    // ---- Sommaire sticky (plusieurs sections seulement) ----
    const toc = el("nav", "apl-toc", null);
    toc.setAttribute("aria-label", "Sections de la fiche");
    sections.forEach(([id, label]) => {
      const a = el("a", null, toc, label);
      a.href = "#" + id;
    });
    if (sections.length > 1) hero.after(toc);

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-producer");

    // État actif du sommaire (IntersectionObserver, pas de scroll listener).
    try {
      const links = [...toc.querySelectorAll("a")];
      const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
      if (sections.length > 1 && links.length && secs.length && "IntersectionObserver" in window) {
        tocObserver?.disconnect();
        tocObserver = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
          });
        }, { rootMargin: "-30% 0px -60% 0px" });
        secs.forEach((s) => tocObserver.observe(s));
      }
    } catch { /* sommaire non interactif : les ancres restent cliquables */ }
  } catch {
    tocObserver?.disconnect(); tocObserver = null;
    rollback();
    document.getElementById("myapple-producer")?.remove();
    document.body.classList.remove("myapple-producer");
    return;
  }
}

function destroyProducerView() {
  tocObserver?.disconnect(); tocObserver = null;
  rollback();
  document.getElementById("myapple-producer")?.remove();
  document.body.classList.remove("myapple-producer");
}

root.__myappleProducer = {
  isProducerPath, readProducer, parseTile, parseNews, buildProducerView, destroyProducerView,
};
})();
