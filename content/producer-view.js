// Vue Producer / Studio (/anime/producer/<id>/<nom> ou /anime/studio/<id>/<nom>) :
// EXTRACTION + RECONSTRUCTION. readProducer() lit le DOM MAL natif (h1.title-name,
// portrait/logo, .dark_text détails, tableau des anime associés) ; buildProducerView()
// reconstruit hero + KPIs + grille d'œuvres avec tri/filtre. Vue 100 % lecture :
// aucune écriture MAL, aucune requête réseau.
// Appel : window.__myappleProducer?.buildProducerView().
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const normTxt = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

/* ---------- detection ---------- */
function isProducerPath(path) {
  return /^\/anime\/(producer|studio)\/\d+/.test(path || "");
}

/* ---------- parsing (lecture seule, DOM intact) ---------- */
const fixImg = root.__myappleList?.fixImg
  || ((u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0]);
const PROD_ID = /^\/anime\/(producer|studio)\/(\d+)/;

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

/* ---------- lecture ---------- */
function readProducer(_scope) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || !doc.querySelector) return null;
  const content = doc.querySelector("#content");
  if (!content) return null;
  let d;
  try { d = collect(content, doc); } catch { d = null; }
  return d || {
    id: null, kind: null, url: null, name: null, portrait: null, details: [], works: null,
  };
}

function collect(content, doc) {
  const h1 = doc.querySelector("h1.title-name");
  const idm = (root.location?.pathname || "").match(PROD_ID);
  const kind = idm ? idm[1] : null;
  const id = idm ? parseInt(idm[2], 10) : null;
  const name = T(h1) || null;
  // Logo / portrait : première image dans td.borderClass en dehors du tableau des œuvres.
  const cands = [...content.querySelectorAll("td.borderClass img")];
  const portel = cands.find((im) => {
    const table = im.closest("table");
    return !table || !table.querySelector("a[href*='/anime/']");
  }) || null;
  const rows = detailRows(content);
  const map = new Map(rows);
  const PROMOTED = new Set([]);
  const details = rows.filter((r) => !PROMOTED.has(r[0]));
  if (!name && !portel) return null;
  // Œuvres associées : lignes du tableau MAL (chaque ligne = un anime).
  const works = [];
  content.querySelectorAll("tr").forEach((tr) => {
    const titleA = tr.querySelector("td a[href*='/anime/']");
    if (!titleA) return;
    const imgEl = tr.querySelector(".picSurround img") || tr.querySelector("td img");
    const metaEl = tr.querySelector(".anime-info-text, .info");
    const meta = metaEl ? normTxt(metaEl.textContent) : "";
    const w = {
      img: imgEl ? fixImg(IMG(imgEl)) : "",
      title: normTxt(titleA.textContent),
      url: titleA.getAttribute("href") || "",
      type: "",
      year: null,
      score: "",
      members: "",
    };
    if (meta) {
      const ym = meta.match(/\b(19|20)\d{2}\b/);
      if (ym) w.year = parseInt(ym[0], 10);
      const first = meta.split(",")[0].trim();
      if (first && !/\d{4}/.test(first)) w.type = first;
    }
    const scoreEl = tr.querySelector(".score-val");
    const membersEl = tr.querySelector(".series-total-members");
    w.score = scoreEl ? normTxt(scoreEl.textContent) : "";
    w.members = membersEl ? normTxt(membersEl.textContent) : "";
    works.push(w);
  });
  return {
    id, kind, url: root.location?.href || null, name,
    portrait: portel ? fixImg(IMG(portel)) : null,
    details,
    works: works.length ? works : null,
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
  return el("div", "apl-card-body", s);
}

const FMT = (n) => Number.isFinite(n) ? n.toLocaleString("fr-FR").replace(/,/g, " ") : "";

function kpi(parent, value, label) {
  const k = el("div", "apl-kpi", parent);
  el("b", "apl-kpi-num", k, value);
  el("span", "apl-kpi-label", k, label);
}

/* ---------- œuvres : tri / filtre ---------- */
const WORK_SORTS = [
  ["", "Tri : défaut"],
  ["year-desc", "Année ↓"],
  ["year-asc", "Année ↑"],
  ["title", "Titre A→Z"],
  ["score", "Note ↓"],
];
const WORKS_BAR_MIN = 5;

function workSort(a, b, mode) {
  switch (mode) {
    case "year-desc": return (b.year || 0) - (a.year || 0);
    case "year-asc": return (a.year || 0) - (b.year || 0);
    case "title": return (a.title || "").localeCompare(b.title || "", "fr");
    case "score": return (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0);
    default: return 0;
  }
}

function workMatches(w, q) {
  if (!q) return true;
  const hay = [w.title, w.type].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function workCard(parent, w) {
  const item = el("article", "apl-work", parent);
  const media = el("div", "apl-work-media", item);
  const link = el("a", "apl-work-thumb-link", media);
  link.href = w.url || "#";
  link.tabIndex = -1;
  link.setAttribute("aria-hidden", "true");
  if (w.img) { const im = el("img", "apl-work-thumb", link); im.src = w.img; im.alt = ""; im.loading = "lazy"; }
  const body = el("div", "apl-work-body", item);
  const head = el("div", "apl-work-head", body);
  const titleA = el("a", "apl-work-title", head, w.title);
  titleA.href = w.url || "#";
  const meta = el("div", "apl-work-meta", head);
  const bits = [w.type, w.year].filter(Boolean);
  if (bits.length) el("span", null, meta, bits.join(" · "));
  const tag = [w.score || "", w.members || ""].filter(Boolean).join(" · ");
  if (tag) el("span", "apl-work-tag", meta, tag);
  return item;
}

function renderWorks(body, items, title) {
  const grid = el("div", "apl-works", body);
  const empty = el("p", "apl-works-empty", body, "Aucune œuvre.");
  empty.hidden = true;
  const draw = (q, sortMode) => {
    const filtered = items.filter((w) => workMatches(w, q));
    const list = sortMode ? filtered.slice().sort((a, b) => workSort(a, b, sortMode)) : filtered.slice();
    const frag = document.createDocumentFragment();
    list.forEach((w) => workCard(frag, w));
    grid.textContent = "";
    grid.appendChild(frag);
    empty.hidden = list.length > 0;
  };
  if (items.length >= WORKS_BAR_MIN) {
    const bar = el("div", "apl-works-bar", body);
    const search = el("input", "apl-works-search", bar);
    search.type = "search";
    search.placeholder = "Filtrer…";
    search.setAttribute("aria-label", "Filtrer : " + title);
    const sort = el("select", "apl-works-sort", bar);
    sort.setAttribute("aria-label", "Trier : " + title);
    WORK_SORTS.forEach(([v, label]) => { const o = el("option", null, sort, label); o.value = v; });
    let timer = 0;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => draw(normTxt(search.value).toLowerCase(), sort.value), 120);
    });
    sort.addEventListener("change", () => draw(normTxt(search.value).toLowerCase(), sort.value));
    body.insertBefore(bar, grid);
  }
  draw("", "");
}

function buildProducerView() {
  if (document.getElementById("myapple-producer")) return;
  const path = root.location?.pathname || "";
  if (!isProducerPath(path)) return;
  const content = document.querySelector("#content");
  if (!content) return;

  let d;
  try { d = readProducer(content); } catch { return; }
  if (!d || (!d.name && !d.portrait && !d.works)) return;

  const view = document.createElement("div");
  view.id = "myapple-producer";

  try {
    // ---- Hero : logo + identité + KPIs ----
    const hero = el("section", "apl-hero", view);
    const heroMain = el("div", "apl-hero-main", hero);
    if (d.portrait) {
      const wrap = el("div", "apl-poster", heroMain);
      const im = el("img", null, wrap);
      im.src = d.portrait; im.alt = d.name || "Logo";
    }
    const who = el("div", "apl-who", heroMain);
    el("p", "apl-kind", who, d.kind === "studio" ? "Studio" : "Producteur");
    if (d.name) el("h1", null, who, d.name);
    const kpis = el("div", "apl-kpis", who);
    if (d.works) kpi(kpis, String(d.works.length), "Œuvres");

    // ---- Détails ----
    if (d.details.length) {
      const block = el("section", "apl-panel-block apl-sec-infos", who);
      block.id = "apl-producer-infos";
      el("h3", null, block, "Informations");
      const grid = el("dl", "apl-infos", block);
      d.details.forEach(([label, value]) => {
        el("dt", null, grid, label.replace(/:$/, ""));
        el("dd", null, grid, value || "—");
      });
    }

    // ---- Œuvres ----
    if (d.works?.length) {
      const body = card(view, "Œuvres", "apl-sec-works", "apl-producer-works");
      renderWorks(body, d.works, "Œuvres");
    }

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-producer");
  } catch {
    rollback();
    document.getElementById("myapple-producer")?.remove();
    document.body.classList.remove("myapple-producer");
    return;
  }
}

function destroyProducerView() {
  rollback();
  document.getElementById("myapple-producer")?.remove();
  document.body.classList.remove("myapple-producer");
}

root.__myappleProducer = {
  isProducerPath, readProducer, buildProducerView, destroyProducerView,
};
})();
