// Vue People (/people/<id>/<nom>) : EXTRACTION + RECONSTRUCTION.
// readPeople() lit le DOM MAL natif (portrait, .dark_text details,
// .people-informantion-more, zones .normal_header Voice Acting Roles /
// Anime Staff Positions / Published Works, table.js-table-people-staff) ;
// buildPeopleView() reconstruit hero + KPIs + cards ; le nœud bio est
// DÉPLACÉ (jamais dupliqué) et restauré au destroy. Vue 100 % lecture :
// aucune écriture MAL, aucune requête réseau.
// Appel : window.__myapplePeople?.buildPeopleView().
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
// Normaliseur STRING (T prend un élément DOM ; sur un texte brut il renverrait "").
const normTxt = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

/* ---------- detection ---------- */
function isPeoplePath(path) {
  return /^\/people\/\d+/.test(path || "");
}

/* ---------- parsing (lecture seule, DOM intact) ---------- */
const fixImg = root.__myappleList?.fixImg
  || ((u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0]);
const PERSON_ID = /^\/people\/(\d+)/;

// Rows de détails MAL : `<span.dark_text>Label:</span>` + valeur, sous deux
// formes (dans un div.spaceit_pad, ou noyées en frères directs du td). On lit
// la chaîne de valeurs SUIVANTE jusqu'au prochain label/nœud de bio.
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
    else if (n.classList?.contains("people-informantion-more")) break;
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

/* ---------- zones d'oeuvres (Voice Acting Roles / Staff / Published) ---------- */
const WORK_SECTIONS = [
  { key: "voices", re: /^voice acting roles$/i },
  { key: "staff", re: /^anime staff positions?$/i },
  { key: "published", re: /^published\b/i },
];

function headerLabel(hdr) {
  const h2 = hdr.querySelector("h2");
  if (h2) return normTxt(h2.textContent);
  const clone = hdr.cloneNode(true);
  clone.querySelector(".floatRightHeader")?.remove();
  return normTxt(clone.textContent);
}

// Une ligne de travail MAL, sous deux gabarits proches :
//  - staff/published : td pic | td title+`small` positions+.anime-info-text | td score/members
//  - voices          : + td character (nom/rôle/favorites) + td pic character
function parseWorkRow(tr) {
  if (!tr || !tr.querySelector) return null;
  const titleA = tr.querySelector("a.js-people-title")
    || tr.querySelector("td a[href*='/anime/'], td a[href*='/manga/']");
  if (!titleA) return null;
  const imgEl = tr.querySelector(".picSurround img");
  // Lien personnage : on préfère le lien PORTEUR DE TEXTE (MAL place parfois
  // l'ancre de la vignette — vide — avant celle du nom).
  const charA = [...tr.querySelectorAll("a[href*='/character/']")].find((a) => normTxt(a.textContent))
    || tr.querySelector("a[href*='/character/']");
  const charImgEl = charA?.closest("td")?.querySelector(".picSurround img")
    || tr.querySelectorAll(".picSurround img")[1] || null;
  const metaEl = tr.querySelector(".anime-info-text");
  const meta = metaEl ? normTxt(metaEl.textContent) : "";
  const w = {
    img: imgEl ? fixImg(IMG(imgEl)) : "",
    title: normTxt(titleA.textContent),
    url: titleA.getAttribute("href") || "",
    sub: normTxt(T(tr.querySelector("small:not([style*='hidden'], .entry-date, .js-people-favorites, .total-score)")
      || tr.querySelector("td small"))),
    meta,
    score: "",
    members: "",
    year: null,
    format: "",
  };
  // meta typique : "TV, Spring 1998" → format (1er segment) + année extraite.
  if (meta) {
    const ym = meta.match(/\b(19|20)\d{2}\b/);
    if (ym) w.year = parseInt(ym[0], 10);
    const first = meta.split(",")[0].trim();
    if (first && !/\d{4}/.test(first)) w.format = first;
  }
  const scoreEl = tr.querySelector(".score-val, small.total-score");
  const membersEl = tr.querySelector(".series-total-members, .character-total-favorites");
  w.score = scoreEl ? normTxt(scoreEl.textContent) : "";
  w.members = membersEl ? normTxt(membersEl.textContent) : "";
  // Ligne VOIX : le personnage garde son URL et son rôle (navigable/filtrable).
  if (charA) {
    const ct = charA.closest("td");
    const roleDiv = [...(ct?.querySelectorAll("div.spaceit_pad") || [])]
      .map((el) => normTxt(el.textContent)).filter((t) => t)[1]; // div 2 = rôle ("Supporting")
    w.char = {
      name: normTxt(charA.textContent),
      img: charImgEl ? fixImg(IMG(charImgEl)) : "",
      url: charA.getAttribute("href") || "",
      role: roleDiv || "",
    };
  }
  const st = workRowStatus(tr);
  if (st) w.status = st;
  return w;
}

// Statut de liste de l'œuvre (SEULEMENT lecture : plus d'écriture ici).
// Seuls les VRAIS statuts de suivi comptent : « dans ma liste » n'est PAS un
// statut (une œuvre ajoutée sans suivi n'affiche aucun badge).
// In-list : a.Lightbox_AddEdit (classe statut + data-status) ; hors-liste : a.addtolist.
const ST_FR = (isManga) => ({
  1: isManga ? "En lecture" : "En cours",
  2: "Terminé",
  3: "En pause",
  4: "Abandonné",
  6: isManga ? "À lire" : "À voir",
});
function workRowStatus(tr) {
  if (!tr?.className) return null;
  const editA = tr.querySelector("a.Lightbox_AddEdit.button_edit");
  const isManga = Boolean(tr.querySelector("a[href*='/manga/']"));
  const code = editA ? parseInt(editA.getAttribute("data-status") || "", 10) : NaN;
  if (Number.isFinite(code) && ST_FR(isManga)[code]) return { code, label: ST_FR(isManga)[code] };
  const kw = tr.className.match(/-(plantowatch|plantoread|watching|reading|completed|onhold|dropped)\b/);
  if (kw) {
    // fallback : mots-clés sans data-status
    const KEY = { watching: 1, reading: 1, completed: 2, onhold: 3, dropped: 4, plantowatch: 6, plantoread: 6 };
    const c = KEY[kw[1]];
    if (ST_FR(isManga)[c]) return { code: c, label: ST_FR(isManga)[c] };
  }
  return null;
}

const EMPTY_ZONE = /have been added|no (voice|published)/i;

// Parcourt les zones `div.normal_header` et extrait les Work[] par clé de section.
function collectWorks(content) {
  const heads = [...content.querySelectorAll("div.normal_header")];
  const out = { voices: null, staff: null, published: null };
  heads.forEach((hdr, i) => {
    const label = headerLabel(hdr);
    const sec = WORK_SECTIONS.find((s) => s.re.test(label));
    if (!sec || out[sec.key]) return;
    const nextHead = heads[i + 1];
    const rows = [];
    let zone = hdr.nextElementSibling;
    while (zone && zone !== nextHead) {
      [...zone.querySelectorAll("tr")].forEach((tr) => {
        const w = parseWorkRow(tr);
        if (w) rows.push(w);
      });
      zone = zone.nextElementSibling;
    }
    const zonified = EMPTY_ZONE.test(T(hdr.parentElement) ) && !rows.length;
    if (zonified || !rows.length) return; // section vide → null (R3.3 card absente)
    out[sec.key] = rows;
  });
  return out;
}

function readPeople(_scope) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || !doc.querySelector) return null;
  const content = doc.querySelector("#content");
  if (!content) return null;
  let d;
  try { d = collect(content, doc); } catch { d = null; }
  return d || {
    id: null, url: null, name: null, nameJp: null, portrait: null,
    details: [], favorites: null,
    bioText: null, bioNode: null,
    voices: null, staff: null, published: null,
  };
}

function collect(content, doc) {
  const h1 = doc.querySelector("h1.title-name");
  const cand = [...content.querySelectorAll("td.borderClass img")];
  const portel = cand.find((im) => !im.closest(".js-table-people-staff")) || null;
  const rows = detailRows(content);
  const map = new Map(rows);
  const given = normTxt(map.get("Given name") || "");
  const family = normTxt(map.get("Family name") || "");
  const idm = (root.location?.pathname || "").match(PERSON_ID);
  const name = T(h1) || normTxt(map.get("Alternate names") || "") || null;
  const nameJp = [family, given].filter(Boolean).join(" ") || null;
  const favRaw = map.get("Member Favorites") || "";
  const favNum = parseInt(normTxt(favRaw).replace(/[^\d]/g, ""), 10);
  const bioEl = content.querySelector(".people-informantion-more");
  const works = collectWorks(content);
  // Les paires « technique » nourrissent le hero/color ; on ne garde dans
  // details QUE ce qui n'est pas déjà promu en champ dédié.
  const PROMOTED = new Set(["Given name", "Family name", "Member Favorites", "More"]);
  const details = rows.filter((r) => !PROMOTED.has(r[0]));
  if (!name && !portel && !bioEl) return null;
  return {
    id: idm ? parseInt(idm[1], 10) : null,
    url: root.location?.href || null,
    name,
    nameJp,
    portrait: portel ? fixImg(IMG(portel)) : null,
    details,
    favorites: Number.isFinite(favNum) ? favNum : null,
    bioText: bioEl ? T(bioEl) : null,
    bioNode: bioEl || null,
    voices: works.voices, staff: works.staff, published: works.published,
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

// Observeur du sommaire (état actif) : déconnecté au destroy pour ne rien fuir.
let tocObserver = null;

// Déplacements suivis (bio MAL déplacé dans notre card) → rollback/restore.
const moved = [];
function moveInto(node, dest) {
  if (!node || !dest) return false;
  moved.push({ node, parent: node.parentNode, next: node.nextSibling });
  if (node instanceof Text && node.nodeValue) {
    const p = el("span", null, null);
    p.appendChild(document.createTextNode(node.nodeValue));
    node.nodeValue = "";
    dest.appendChild(p);
    return true;
  }
  dest.appendChild(node);
  return true;
}
function rollback() {
  for (const { node, parent, next } of moved.splice(0)) {
    try {
      if (!parent) continue;
      if (node instanceof Text || node.nodeType === 3) {
        // textes natifs jamais déplacés ici : no-op de sécurité
      }
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

/* ---------- œuvres : rendu + tri/filtre (interne à notre DOM) ---------- */
const WORK_SORTS = [
  ["", "Tri : défaut"],
  ["year-desc", "Année ↓"],
  ["year-asc", "Année ↑"],
  ["title", "Titre A→Z"],
  ["score", "Note ↓"],
];
// Seuil au-delà duquel la barre filtre/tri apporte de la valeur (sinon bruit).
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
  const hay = [w.title, w.sub, w.char?.name, w.char?.role, w.format]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

// Regroupe des lignes d'œuvres (une par personnage/poste) par ANIMÉ/MANGA :
// une carte = une œuvre, ses rôles listés dessous. Le 1er statut/note non nul gagne.
function groupWorks(items) {
  const map = new Map();
  const order = [];
  items.forEach((w) => {
    const key = w.url || w.title;
    let g = map.get(key);
    if (!g) {
      g = {
        img: w.img, title: w.title, url: w.url, meta: w.meta,
        score: "", members: "", year: w.year, format: w.format, status: null, roles: [],
      };
      map.set(key, g); order.push(g);
    }
    g.roles.push({
      name: w.char?.name || "", url: w.char?.url || "",
      kind: w.char?.role || "", sub: w.sub || "",
    });
    if (!g.status && w.status) g.status = w.status;
    if (!g.score && w.score) g.score = w.score;
    if (!g.members && w.members) g.members = w.members;
  });
  return order;
}

// Carte-affiche (une œuvre) : vignette en haut (badge statut), nom, puis liste des
// rôles. Seuls les 2 premiers rôles sont visibles ; le reste se déploie au survol
// / au focus, AU-DESSUS des cartes du dessous (liste absolue). Le reste des infos
// (année/format, note, membres) apparaît au survol de la vignette.
function workCard(parent, g) {
  const item = el("article", "apl-work", parent);
  const media = el("div", "apl-work-media", item);
  const mediaLink = el("a", "apl-work-thumb-link", media);
  mediaLink.href = g.url || "#";
  mediaLink.tabIndex = -1;
  mediaLink.setAttribute("aria-hidden", "true");
  if (g.img) { const im = el("img", "apl-work-thumb", mediaLink); im.src = g.img; im.alt = ""; im.loading = "lazy"; }
  // Statut de liste → badge coloré (libellé seul, sans pastille) coin de la vignette.
  if (g.status) el("span", "apl-work-status st-" + (g.status.code || 0), media, g.status.label);
  // Reste des infos (survol vignette) : méta + note/membres.
  const more = el("div", "apl-work-more", media);
  if (g.meta) el("i", "apl-work-meta", more, g.meta);
  const tag = [g.score || "", g.members || ""].filter(Boolean).join(" · ");
  if (tag) el("span", "apl-work-tag", more, tag);
  // Corps : titre, puis liste de rôles (2 lignes, déploiement au survol).
  const body = el("div", "apl-work-body", item);
  const head = el("div", "apl-work-head", body);
  const titleA = el("a", "apl-work-title", head, g.title);
  titleA.href = g.url || "#";
  const roles = el("div", "apl-work-roles", head);
  g.roles.forEach((r) => {
    const line = el("span", "apl-work-role-item", roles);
    const label = r.name || r.sub || "";
    if (r.url) { const a = el("a", "apl-char-link", line, label); a.href = r.url; }
    else el("span", "apl-role-text", line, label);
    const kind = r.name ? r.kind : "";
    if (kind) el("i", "apl-role-kind", line, kind);
  });
  return item;
}

// Barre (recherche + tri) + grille. Redessine UNIQUEMENT la grille (jamais la vue).
// Carte personnage (doublage) : 1 carte = 1 personnage. Vignette + nom du perso
// par defaut ; au survol/focus la vignette et le titre basculent vers l'anime
// (swap 100 % CSS via .is-char / .is-anime). Liens separes, jamais d'ancres imbriquees.
function voiceCard(parent, w) {
  const item = el("article", "apl-work apl-voice", parent);
  const media = el("div", "apl-work-media", item);
  const faceC = el("a", "apl-work-thumb-link is-char", media);
  faceC.href = w.char?.url || "#";
  faceC.tabIndex = -1;
  faceC.setAttribute("aria-hidden", "true");
  const charRaw = fixImg(w.char?.img); const noCharImg = !charRaw || /questionmark/i.test(charRaw); const charSrc = noCharImg ? fixImg(w.img) : charRaw; if (noCharImg) item.classList.add("no-char-img"); if (charSrc) { const im = el("img", "apl-work-thumb", faceC); im.src = charSrc; im.alt = ""; im.loading = "lazy"; }
  const faceA = el("a", "apl-work-thumb-link is-anime", media);
  faceA.href = w.url || "#";
  faceA.tabIndex = -1;
  faceA.setAttribute("aria-hidden", "true");
  if (w.img) { const im2 = el("img", "apl-work-thumb", faceA); im2.src = w.img; im2.alt = ""; im2.loading = "lazy"; }
  if (w.status) el("span", "apl-work-status st-" + (w.status.code || 0), media, w.status.label);
  const body = el("div", "apl-work-body", item);
  const head = el("div", "apl-work-head", body);
  const cName = el("a", "apl-work-title is-char", head, w.char?.name || w.title);
  if (w.char?.url) cName.href = w.char.url;
  const aName = el("a", "apl-work-title is-anime", head, w.title);
  aName.href = w.url || "#";
  const sub = el("div", "apl-work-roles", head);
  if (w.char?.role) el("span", "apl-work-role-item", sub, w.char.role);
  else if (w.sub) el("span", "apl-work-role-item", sub, w.sub);
  return item;
}

function renderWorks(body, items, title, kind) {
  const grid = el("div", "apl-works", body);
  if (kind === "voices") grid.classList.add("apl-works-voices");
  const empty = el("p", "apl-works-empty", body, "Aucun résultat.");
  empty.hidden = true;
  const draw = (q, sortMode) => {
    const isVoices = kind === "voices";
    const filtered = items.filter((w) => workMatches(w, q));
    const list = isVoices ? filtered.slice() : groupWorks(filtered);
    if (sortMode) list.sort((a, b) => workSort(a, b, sortMode));
    const frag = document.createDocumentFragment();
    if (isVoices) list.forEach((w) => voiceCard(frag, w));
    else list.forEach((g) => workCard(frag, g));
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
    // La barre doit précéder la grille dans l'ordre : insérée avant elle.
    body.insertBefore(bar, grid);
  }
  draw("", "");
}

function buildPeopleView() {
  if (document.getElementById("myapple-people")) return;
  const path = root.location?.pathname || "";
  if (!isPeoplePath(path)) return;
  const content = document.querySelector("#content");
  if (!content) return;

  let d;
  try { d = readPeople(content); } catch { return; }
  // Gate de données (R1.4) : rien de significatif à afficher → MAL natif.
  if (!d || (!d.name && !d.portrait && !d.bioText && !d.voices && !d.staff && !d.published)) return;

  const view = document.createElement("div");
  view.id = "myapple-people";

  try {
    // ---- Hero : portrait + identité + KPIs ----
    const hero = el("section", "apl-hero", view);
    const heroMain = el("div", "apl-hero-main", hero);
    if (d.portrait) {
      const wrap = el("div", "apl-poster", heroMain);
      const im = el("img", null, wrap);
      im.src = d.portrait; im.alt = d.name || "Portrait";
    }
    const who = el("div", "apl-who", heroMain);
    el("p", "apl-kind", who, "People");
    if (d.name) el("h1", null, who, d.name);
    const bits = [d.nameJp || ""].filter(Boolean);
    if (bits.length) el("p", "apl-alt", who, bits.join(" • "));
    const kpis = el("div", "apl-kpis", who);
    const nf = d.favorites !== null ? FMT(d.favorites) : "0";
    kpi(kpis, nf, "Favoris");
    if (d.voices) kpi(kpis, String(d.voices.length), "Rôles voix");
    if (d.staff) kpi(kpis, String(d.staff.length), "Staff anime");
    if (d.published) kpi(kpis, String(d.published.length), "Œuvres publiées");

    // ---- Panneau : Bio + Informations, sous les KPIs, dans la colonne identité
    // (à droite de l'image, jamais sous le poster) — zone scrollable.
    const hasBio = !!(d.bioNode || d.bioText);
    if (hasBio || d.details.length) {
      const panel = el("div", "apl-hero-panel", who);
      if (hasBio) {
        const block = el("section", "apl-panel-block apl-sec-bio", panel);
        block.id = "apl-people-bio";
        el("h3", null, block, "Bio");
        const body = el("div", "apl-panel-body", block);
        if (d.bioNode) moveInto(d.bioNode, body); // nœud natif DÉPLACÉ, jamais dupliqué
        else body.textContent = d.bioText || "";
      }
      if (d.details.length) {
        const block = el("section", "apl-panel-block apl-sec-infos", panel);
        block.id = "apl-people-infos";
        el("h3", null, block, "Informations");
        const grid = el("dl", "apl-infos", block);
        d.details.forEach(([label, value]) => {
          el("dt", null, grid, label.replace(/:$/, ""));
          el("dd", null, grid, value || "—");
        });
      }
    }

    // ---- Œuvres : sections pleine largeur sous le hero ----
    const worksCards = [];
    if (d.voices?.length) {
      const body = card(view, "Rôles de doublage", "apl-sec-voices", "apl-people-voices");
      renderWorks(body, d.voices, "Rôles de doublage", "voices");
      worksCards.push(["apl-people-voices", `Rôles (${d.voices.length})`]);
    }
    if (d.staff?.length) {
      const body = card(view, "Staff anime", "apl-sec-staff", "apl-people-staff");
      renderWorks(body, d.staff, "Staff anime");
      worksCards.push(["apl-people-staff", `Staff (${d.staff.length})`]);
    }
    if (d.published?.length) {
      const body = card(view, "Œuvres publiées", "apl-sec-published", "apl-people-published");
      renderWorks(body, d.published, "Œuvres publiées");
      worksCards.push(["apl-people-published", `Publié (${d.published.length})`]);
    }

    // ---- Sommaire sticky : navigation entre les sections d'œuvres ----
    const toc = el("nav", "apl-toc", null);
    toc.setAttribute("aria-label", "Sections de la fiche");
    const tocLink = (id, label) => { const a = el("a", null, toc, label); a.href = "#" + id; };
    worksCards.forEach(([id, label]) => tocLink(id, label));
    if (toc.children.length > 1) hero.after(toc);

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-people");

    // État actif du sommaire (IntersectionObserver, pas de scroll listener).
    // Après insertion : observer des nœuds détachés ne déclencherait jamais.
    try {
      const links = [...toc.querySelectorAll("a")];
      const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
      if (toc.children.length > 1 && links.length && secs.length && "IntersectionObserver" in window) {
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
    document.getElementById("myapple-people")?.remove();
    document.body.classList.remove("myapple-people");
    return;
  }
}

// Restauration complète de la page native (R1.5) : rollback du bio déplacé,
// retrait du DOM our propre et de la classe body ; idempotente.
function destroyPeopleView() {
  tocObserver?.disconnect(); tocObserver = null;
  rollback();
  document.getElementById("myapple-people")?.remove();
  document.body.classList.remove("myapple-people");
}

root.__myapplePeople = {
  isPeoplePath, readPeople, buildPeopleView, destroyPeopleView,
};
})();
