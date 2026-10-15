// Vue Anime/Manga Detail : EXTRACTION + RECONSTRUCTION (même niveau que profil/listes).
// readAnime() extrait les données du DOM MAL ; buildAnimeView() reconstruit :
// hero (bannière floue + affiche + titre + badges + genres + KPIs + actions MAL déplacées),
// colonne principale (synopsis, informations, personnages, staff, thèmes),
// colonne latérale (bande-annonce, œuvres liées, navigation).
// Les nœuds interactifs MAL (Add to My List, favoris, vidéo, thèmes) sont DÉPLACÉS, jamais dupliqués.
// Appel : window.__myappleAnime?.buildAnimeView() depuis content.js
(() => {
"use strict";

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

// Clés de la colonne gauche MAL (titres alternatifs : affichés sous le titre, pas dans la grille infos)
const ALT_KEYS = new Set(["Synonyms", "Japanese", "English", "French", "German", "Spanish"]);
// Clés affichées en chips dans le hero (exclues de la grille infos)
const CHIP_KEYS = new Set(["Genres", "Genre", "Themes", "Theme", "Demographic", "Demographics"]);

const KEY_FR = {
  Type: "Format", Episodes: "Épisodes", Status: "Statut", Aired: "Diffusion",
  Published: "Publication", Premiered: "Saison", Broadcast: "Horaire",
  Producers: "Producteurs", Licensors: "Licences", Studios: "Studio",
  Source: "Source", Rating: "Classification", Duration: "Durée",
  Chapters: "Chapitres", Volumes: "Tomes", Authors: "Auteurs",
  Serialization: "Magazine", Genres: "Genres", Genre: "Genres",
  Themes: "Thèmes", Theme: "Thèmes", Demographic: "Public", Demographics: "Public"
};

// Extraction de l'ID anime/manga depuis l'URL
function extractId(path) {
  const m = path.match(/^\/(anime|manga)\/(\d+)/);
  return m ? { kind: m[1], id: parseInt(m[2], 10) } : null;
}

// Lecture de l'état actuel de la liste depuis le DOM MAL
function readListStatus(content) {
  const statusBlock = content.querySelector("ul.user-status");
  if (!statusBlock) return null;

  const statusId = (() => {
    const active = statusBlock.querySelector("li.selected");
    if (!active) return null;
    const link = active.querySelector("a");
    if (!link) return null;
    const href = link.getAttribute("href") || "";
    const m = href.match(/status=(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  })();

  const scoreEl = content.querySelector("span#scoretext");
  const score = scoreEl ? parseFloat(scoreEl.textContent) || 0 : 0;

  const episodesEl = content.querySelector("span#curEps, span#cur_chaps");
  const episodes = episodesEl ? parseInt(episodesEl.textContent, 10) || 0 : 0;

  const volumesEl = content.querySelector("span#cur_vols");
  const volumes = volumesEl ? parseInt(volumesEl.textContent, 10) || 0 : 0;

  return { statusId, score, episodes, volumes };
}

const STATUS_FR = {
  "Finished Airing": "Terminé", "Currently Airing": "En cours", "Not yet aired": "Annoncé",
  Finished: "Terminée", Publishing: "En cours", "On Hiatus": "En pause", Discontinued: "Interrompue"
};
const STATUS_COLOR = { "Terminé": "#34c759", "Terminée": "#34c759", "En cours": "#0071e3", "Annoncé": "#af52de", "En pause": "#ff9500", "Interrompue": "#ff3b30" };
// Lignes de stats déjà visibles dans le hero (jamais dans la grille infos)
const STAT_KEYS = new Set(["Score", "Ranked", "Popularity", "Members", "Favorites"]);
// Grille infos : UNIQUEMENT les clés connues (lignes injectées par des extensions
// tierces ou futures clés MAL inconnues = exclues, nœuds originaux intacts).
const KNOWN_INFO = new Set([...Object.keys(KEY_FR)]);

// Libellés MAL secondaires → français (URLs d'origine conservées)
const NAV_FR = {
  Details: "Détails", "Characters & Staff": "Personnages & staff", Episodes: "Épisodes",
  Videos: "Vidéos", Stats: "Stats", Reviews: "Critiques", Recommendations: "Recos",
  "Interest Stacks": "Stacks", News: "Actus", Forum: "Forum", Pictures: "Images", More: "Plus"
};

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function card(parent, title, moreHref, id) {
  const s = el("section", "apl-card", parent);
  if (id) s.id = id;
  const h = el("header", null, s);
  el("h2", null, h, title);
  if (moreHref) { const a = el("a", "apl-card-link", h, "Tout voir ↗"); a.href = moreHref; }
  return el("div", "apl-card-body", s);
}

// Déplacements suivis : chaque nœud MAL garde (parent, suivant) pour restauration.
// Utilisé par rollback() en cas d'échec et par destroyAnimeView() à la désactivation.
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
    } catch { /* parent détaché : abandon, la page native reste lisible */ }
  }
}

// Trouve le h2 MAL qui CONTIENT `start` : le lien "More…" ("More characters"/"More staff")
// peut précéder le titre dans le textContent selon les pages (anime vs manga).
function findH2(root, start) {
  return [...root.querySelectorAll("h2")].find((h) => T(h).includes(start)) || null;
}

// La liste qui suit un h2 MAL : le h2 est dernier enfant de son wrapper
// (<div><div class="floatRightHeader">…</div><h2>…</h2></div>), la liste vient après.
// Fallback : première .detail-characters-list située après le h2 dans l'ordre document.
function listAfterH2(h2) {
  let n = h2?.parentElement?.nextElementSibling || null;
  while (n && !(n.classList?.contains("detail-characters-list"))) n = n.nextElementSibling;
  if (n) return n;
  if (!h2) return null;
  const doc = h2.ownerDocument;
  return [...doc.querySelectorAll(".detail-characters-list")]
    .find((l) => h2.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
}

// "scored by 2,347,877 users" — le chiffre existe en double dans le DOM (copie cachée),
// on déduplique (moitiés identiques) et on reformate en fr-FR.
function parseScoredBy(scope) {
  const m = (scope?.textContent || "").match(/([\d,]+)\s+users/i);
  if (!m) return "";
  let digits = m[1].replace(/,/g, "");
  while (digits.length > 1 && digits.length % 2 === 0 && digits.slice(0, digits.length / 2) === digits.slice(digits.length / 2)) {
    digits = digits.slice(0, digits.length / 2);
  }
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("fr-FR").replace(/,/g, " ") + " votes";
}

// Teinte d'accent de la fiche depuis l'affiche (moyenne 24px, décoratif).
// Échec silencieux (CORS CDN, canvas indisponible) : le CSS garde son fallback neutre.
function tintFromPoster(url, heroEl) {
  if (!url || !heroEl) return;
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = 24; c.height = 24;
      const x = c.getContext("2d", { willReadFrequently: true });
      if (!x) return;
      x.drawImage(im, 0, 0, 24, 24);
      const px = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 16) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum < 0.12 || lum > 0.9) return; // trop sombre/clair : garder le neutre
      heroEl.style.setProperty("--apl-hero-accent", `rgb(${r}, ${g}, ${b})`);
    } catch { /* canvas contaminé : fallback neutre */ }
  };
  im.onerror = () => {};
  im.src = url;
}

// Viewport mobile : MAL déclare initial-scale=1 SANS width=device-width, donc un
// vrai téléphone affiche la version ~980px dézoomée et nos règles ≤640px ne servent jamais.
// On bascule en width=device-width uniquement sur les fiches reconstruites
// (contenu natif masqué ici : aucun effet sur le reste du site), avec restauration.
function ensureViewport() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || meta.dataset.aplOrig !== undefined) return;
  meta.dataset.aplOrig = meta.getAttribute("content") || "";
  meta.setAttribute("content", "width=device-width, initial-scale=1");
}
function restoreViewport() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || meta.dataset.aplOrig === undefined) return;
  meta.setAttribute("content", meta.dataset.aplOrig);
  delete meta.dataset.aplOrig;
}

// Tables RACINES de la liste seulement : chaque personnage = 1 table externe qui imbrique
// la sous-table du doubleur. On ignore les tables MAL de mise en page (hors liste).
function topTables(list) {
  return [...list.querySelectorAll("table")].filter((t) => {
    let p = t.parentElement;
    while (p && p !== list) {
      if (p.tagName === "TABLE") return false;
      p = p.parentElement;
    }
    return true;
  });
}

// Extrait {img, name, href, sub} (+ va:{...} éventuel) d'un tableau MAL personnages/staff.
// Sans lien texte : personne identifiable uniquement via l'alt de l'image
// (carte texte simple, href vide) — jamais de nom inventé depuis une cellule
// (un rôle n'est pas un nom). Ligne réellement invalide (aucun nom) : null.
function parsePerson(table) {
  if (!table || typeof table.querySelectorAll !== "function") return null;
  const imgs = [...table.querySelectorAll("img")];
  const links = [...table.querySelectorAll("a[href]")].filter((a) => T(a));
  if (!links.length) {
    const altName = (imgs[0]?.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
    if (!altName) return null;
    const smalls = [...table.querySelectorAll("small")].map(T).filter(Boolean);
    return { img: IMG(imgs[0]), name: altName, href: "", sub: smalls[0] || "" };
  }
  const nameLink = links.find((a) => !a.querySelector("img")) || links[0];
  const pic = imgs[0] ? IMG(imgs[0]) : "";
  const smalls = [...table.querySelectorAll("small")].map(T).filter(Boolean);
  const out = { img: pic, name: T(nameLink), href: nameLink.getAttribute("href") || "", sub: smalls[0] || "" };
  // Ligne anime : 2e moitié = doubleur (dernière image + dernier lien non-image)
  if (imgs.length > 1 && links.length > 1) {
    const vaLink = [...links].reverse().find((a) => !a.querySelector("img"));
    if (vaLink && vaLink !== nameLink) {
      out.va = { img: IMG(imgs[imgs.length - 1]), name: T(vaLink), href: vaLink.getAttribute("href") || "", lang: smalls[1] || "" };
    }
  }
  return out;
}

function readAnime(content) {
  const path = location.pathname;
  const isManga = /^\/manga\/\d+/.test(path);
  const left = content.querySelector(".leftside");
  // Anime : h1.title-name ; manga : titre dans [itemprop=name] (h1.edit-info)
  const titleEl = document.querySelector("h1.title-name") || document.querySelector("[itemprop='name']");
  const posterIm = left?.querySelector("img[itemprop='image']") || left?.querySelector("img");
  if (!left || !titleEl || !posterIm) return null;

  // Lignes "Label: valeur" de la colonne gauche — LECTURE SEULE, aucun nœud modifié
  // (l'ancien lab.remove() altérait la page avant même de savoir si la vue se construirait).
  const rows = [...left.querySelectorAll(".spaceit_pad")].map((div) => {
    const lab = div.querySelector(".dark_text");
    const key = lab ? T(lab).replace(/:$/, "") : "";
    const links = [...div.querySelectorAll("a[href]")].map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label);
    const text = lab ? T(div).replace(T(lab), "").trim() : T(div);
    return { key, text, links };
  }).filter((r) => r.key || r.text);

  const alt = rows.filter((r) => ALT_KEYS.has(r.key));
  const info = rows.filter((r) => r.key && !ALT_KEYS.has(r.key));
  const chips = [];
  info.filter((r) => CHIP_KEYS.has(r.key)).forEach((r) => r.links.forEach((l) => chips.push(l)));

  // Score + stats (bloc de droite, sélecteurs défensifs)
  const scoreEl = content.querySelector(".score-label");
  const scoreScope = scoreEl?.closest("div.score, .stats-block") || scoreEl?.parentElement;
  const num = (sel) => content.querySelector(sel)?.textContent?.trim() || "";
  // Boutons MAL validés sémantiquement (jamais de faux bouton) :
  // - ajout : lien Lightbox ownlist/add (connecté, titre pas dans la liste) ;
  // - favoris : lien dont href ou libellé mentionne les favoris.
  // États connecté/déconnecté/déjà-dans-la-liste : action absente = action omise.
  const addRaw = content.querySelector(".profileRows a.btn-user-status-add-list");
  const addHref = addRaw?.getAttribute("href") || "";
  const addListNode = (addRaw && (/ownlist\/[^/]+\/add/i.test(addHref) || /user-status/i.test(addRaw.className))) ? addRaw : null;
  const favRaw = content.querySelector("#profileRows a");
  const favText = (favRaw?.getAttribute("href") || "") + "|" + T(favRaw);
  const favNode = (favRaw && favRaw !== addRaw && /favor/i.test(favText)) ? favRaw : null;

  // Bloc de gestion de liste existant (déjà dans la liste)
  // MAL affiche ul.user-status avec des boutons de statut et un sélecteur de score
  const listStatusBlock = content.querySelector("ul.user-status");
  const listStatusEdit = content.querySelector(".user-status-edit-block");
  const isInList = !!(listStatusBlock || listStatusEdit);
  const d = {
    isManga,
    title: T(titleEl),
    poster: IMG(posterIm),
    alt,
    info: info.filter((r) => !CHIP_KEYS.has(r.key) && !STAT_KEYS.has(r.key) && KNOWN_INFO.has(r.key)),
    chips,
    score: T(scoreEl),
    scoredBy: parseScoredBy(scoreScope),
    ranked: num("span.numbers.ranked strong"),
    popularity: num("span.numbers.popularity strong"),
    members: num("span.numbers.members strong"),
    synopsisNode: content.querySelector("p[itemprop='description'], span[itemprop='description']"),
    trailerLink: content.querySelector(".video-promotion a.iframe")?.getAttribute("href") || "",
    trailerNode: content.querySelector(".video-promotion"),
    themesNode: content.querySelector(".theme-songs"),
    addListNode,
    favNode,
    isInList,
    listStatusBlock,
    listStatusEdit,
    nav: [...content.querySelectorAll("#horiznav_nav a[href]")].map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label),
    chars: [], charsMore: "", staff: [], staffMore: "", related: []
  };

  // Personnages (top 8)
  const h2c = findH2(content, "Characters");
  const listC = listAfterH2(h2c);
  if (listC) {
    d.chars = topTables(listC).map(parsePerson).filter(Boolean).slice(0, 8);
    d.charsMore = h2c.parentElement?.querySelector("a[href]")?.getAttribute("href") || "";
  }

  // Staff (top 6)
  const h2s = findH2(content, "Staff");
  const listS = listAfterH2(h2s);
  if (listS) {
    d.staff = topTables(listS).map(parsePerson).filter(Boolean).slice(0, 6);
    d.staffMore = h2s.parentElement?.querySelector("a[href]")?.getAttribute("href") || "";
  }

  // Œuvres liées — nouveau markup .related-entries (fallback ancien tableau)
  const relBox = content.querySelector(".related-entries");
  if (relBox) {
    const groups = new Map();
    relBox.querySelectorAll(".entry").forEach((en) => {
      const type = T(en.querySelector(".relation")).replace(/:$/, "") || "Lié";
      const a = en.querySelector(".content a[href]") || en.querySelector("a[href]");
      const imgEl = en.querySelector(".image img");
      const label = T(a) || imgEl?.getAttribute("alt") || "";
      const item = a ? { label, href: a.getAttribute("href") || "", img: IMG(imgEl) } : null;
      if (!type || !item?.label) return;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(item);
    });
    d.related = [...groups].map(([type, items]) => ({ type, items }));
  } else {
    content.querySelectorAll("table[class*='_related_'] tr").forEach((tr) => {
      const cells = [...tr.querySelectorAll("td")];
      if (cells.length < 2) return;
      const type = T(cells[0]).replace(/:$/, "");
      const items = [...cells.slice(1).flatMap((c) => [...c.querySelectorAll("a[href]")])]
        .map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label);
      if (type && items.length) d.related.push({ type, items });
    });
  }

  return d;
}

function kpi(parent, value, label, sub) {
  const k = el("div", "apl-kpi", parent);
  el("b", null, k, value || "—");
  el("span", null, k, label);
  if (sub) el("i", null, k, sub);
  return k;
}

function personCard(parent, p, showVa) {
  const c = el("div", "apl-person", parent);
  // Sans href (personne identifiable mais sans lien MAL) : carte texte simple,
  // jamais de lien factice vers "#" (saut de page) ni de faux href.
  const a = p.href ? el("a", null, c) : el("span", "apl-static", c);
  if (p.href) a.href = p.href;
  if (p.img) { const im = el("img", null, a); im.src = p.img; im.alt = p.name; im.loading = "lazy"; }
  el("b", null, a, p.name);
  if (p.sub) el("span", "apl-muted", a, p.sub);
  if (showVa && p.va) {
    const v = p.va.href ? el("a", "apl-va", c) : el("span", "apl-va apl-static", c);
    if (p.va.href) v.href = p.va.href;
    if (p.va.img) { const im = el("img", null, v); im.src = p.va.img; im.alt = p.va.name; im.loading = "lazy"; }
    const tx = el("span", null, v);
    if (p.va.lang) el("i", "apl-muted", tx, p.va.lang);
    el("b", null, tx, p.va.name);
  }
  return c;
}

// Widget de gestion de liste interactif
function buildListWidget(parent, idInfo, listStatus, isManga, username) {
  const STATUS_OPTIONS = isManga
    ? [
        { id: 1, label: "En cours" },
        { id: 2, label: "Terminé" },
        { id: 3, label: "En pause" },
        { id: 4, label: "Abandonné" },
        { id: 6, label: "À lire" },
      ]
    : [
        { id: 1, label: "En cours" },
        { id: 2, label: "Terminé" },
        { id: 3, label: "En pause" },
        { id: 4, label: "Abandonné" },
        { id: 6, label: "À voir" },
      ];

  const scoreOptions = Array.from({ length: 11 }, (_, i) => ({ value: i, label: i === 0 ? "—" : String(i) }));

  // Statut
  const statusRow = el("div", "apl-list-widget-row", parent);
  el("label", "apl-list-widget-label", statusRow, "Statut");
  const statusSelect = el("select", "apl-list-widget-select", statusRow);
  STATUS_OPTIONS.forEach((s) => {
    const opt = el("option", null, statusSelect, s.label);
    opt.value = String(s.id);
    if (listStatus.statusId === s.id) opt.selected = true;
  });

  // Score
  const scoreRow = el("div", "apl-list-widget-row", parent);
  el("label", "apl-list-widget-label", scoreRow, "Note");
  const scoreSelect = el("select", "apl-list-widget-select", scoreRow);
  scoreOptions.forEach((s) => {
    const opt = el("option", null, scoreSelect, s.label);
    opt.value = String(s.value);
    if (listStatus.score === s.value) opt.selected = true;
  });

  // Progression
  const progRow = el("div", "apl-list-widget-row", parent);
  el("label", "apl-list-widget-label", progRow, isManga ? "Chapitres" : "Épisodes");
  const progWrap = el("div", "apl-list-widget-prog", progRow);
  const minusBtn = el("button", "apl-list-widget-btn", progWrap, "−");
  minusBtn.type = "button";
  minusBtn.setAttribute("aria-label", "Diminuer");
  const progInput = el("input", "apl-list-widget-input", progWrap);
  progInput.type = "number";
  progInput.min = "0";
  progInput.value = String(listStatus.episodes);
  const plusBtn = el("button", "apl-list-widget-btn", progWrap, "+");
  plusBtn.type = "button";
  plusBtn.setAttribute("aria-label", "Augmenter");

  // Volumes (manga uniquement)
  if (isManga) {
    const volRow = el("div", "apl-list-widget-row", parent);
    el("label", "apl-list-widget-label", volRow, "Tomes");
    const volWrap = el("div", "apl-list-widget-prog", volRow);
    const volMinus = el("button", "apl-list-widget-btn", volWrap, "−");
    volMinus.type = "button";
    const volInput = el("input", "apl-list-widget-input", volWrap);
    volInput.type = "number";
    volInput.min = "0";
    volInput.value = String(listStatus.volumes);
    const volPlus = el("button", "apl-list-widget-btn", volWrap, "+");
    volPlus.type = "button";
  }

  // Bouton Enregistrer
  const saveRow = el("div", "apl-list-widget-row", parent);
  const saveBtn = el("button", "apl-list-widget-save", saveRow, "Enregistrer");
  saveBtn.type = "button";

  // Événements
  let pending = false;

  saveBtn.addEventListener("click", async () => {
    if (pending) return;
    pending = true;
    saveBtn.textContent = "Enregistrement...";
    saveBtn.disabled = true;

    const status = parseInt(statusSelect.value, 10);
    const score = parseInt(scoreSelect.value, 10);
    const episodes = parseInt(progInput.value, 10) || 0;
    const volumes = isManga ? (parseInt(volInput?.value, 10) || 0) : 0;

    try {
      const L = root.__myappleList;
      if (!L) throw new Error("Couche données indisponible");

      const fields = isManga
        ? { status, score, chapters: episodes, volumes }
        : { status, score, episodes };

      await L.updateEntry({ kind: idInfo.kind, id: idInfo.id, fields });
      // Invalider le cache de la liste utilisateur après modification
      if (username) await L.dropCacheFor(idInfo.kind, username);

      saveBtn.textContent = "Enregistré ✓";
      setTimeout(() => {
        saveBtn.textContent = "Enregistrer";
        saveBtn.disabled = false;
        pending = false;
      }, 2000);
    } catch (e) {
      saveBtn.textContent = "Erreur";
      setTimeout(() => {
        saveBtn.textContent = "Enregistrer";
        saveBtn.disabled = false;
        pending = false;
      }, 2000);
    }
  });

  // Boutons +/-
  minusBtn.addEventListener("click", () => {
    const cur = parseInt(progInput.value, 10) || 0;
    progInput.value = String(Math.max(0, cur - 1));
  });

  plusBtn.addEventListener("click", () => {
    const cur = parseInt(progInput.value, 10) || 0;
    progInput.value = String(cur + 1);
  });

  if (isManga && volMinus && volPlus) {
    volMinus.addEventListener("click", () => {
      const cur = parseInt(volInput.value, 10) || 0;
      volInput.value = String(Math.max(0, cur - 1));
    });

    volPlus.addEventListener("click", () => {
      const cur = parseInt(volInput.value, 10) || 0;
      volInput.value = String(cur + 1);
    });
  }
}

function buildAnimeView() {
  if (document.getElementById("myapple-anime")) return;
  const path = location.pathname;
  if (!/^\/anime\/\d+/.test(path) && !/^\/manga\/\d+/.test(path)) return;
  const content = document.getElementById("content");
  const table = content?.querySelector(":scope > table");
  if (!content || !table) return;

  let d;
  try { d = readAnime(content); } catch { return; }
  // Données minimales : titre + affiche + synopsis, sinon on laisse le MAL natif
  if (!d || !d.title || !d.poster || !d.synopsisNode) return;

  // Extraction ID et état liste si déjà dans la liste
  const idInfo = extractId(path);
  const listStatus = d.isInList ? readListStatus(content) : null;

  // Extraction username pour le cache (profil dans header)
  const userEl = document.querySelector("#headerSmall .profile-link, #header-menu .profile-link");
  const username = userEl ? userEl.textContent.trim() : null;

  try {
    const view = el("div", null, null);
    view.id = "myapple-anime";

    // ---- Hero ----
    const hero = el("section", "apl-hero", view);
    el("div", "apl-banner", hero, null).setAttribute("aria-hidden", "true");
    if (d.poster) {
      const im = new Image();
      im.onload = () => { hero.querySelector(".apl-banner").style.backgroundImage = `url("${d.poster}")`; };
      im.src = d.poster;
    }
    const heroMain = el("div", "apl-hero-main", view.querySelector(".apl-hero"));
    const posterWrap = el("div", "apl-poster", heroMain);
    const poster = el("img", null, posterWrap);
    poster.src = d.poster; poster.alt = d.title;

    const who = el("div", "apl-who", heroMain);
    el("p", "apl-kind", who, d.isManga ? "Manga" : "Anime");
    el("h1", null, who, d.title);

    // Ligne méta compacte : format · année · nombre d'épisodes/chapitres
    const typeRow = d.info.find((r) => r.key === "Type");
    const dateRow = d.info.find((r) => r.key === (d.isManga ? "Published" : "Aired"));
    const year = dateRow?.text?.match(/\b(19|20)\d{2}\b/)?.[0] || "";
    const countRow = d.info.find((r) => r.key === (d.isManga ? "Chapters" : "Episodes"));
    const countTxt = (countRow?.text || "").trim();
    const metaBits = [typeRow?.text || "", year,
      (/^\d+/.test(countTxt) ? countTxt + (d.isManga ? " chapitres" : " épisodes") : "")].filter(Boolean);
    if (metaBits.length) el("p", "apl-metaline", who, metaBits.join(" · "));

    const altLine = d.alt.map((r) => r.text).filter(Boolean).slice(0, 3).join(" · ");
    if (altLine) el("p", "apl-alt", who, altLine);

    const studioRow = d.info.find((r) => r.key === (d.isManga ? "Authors" : "Studios")) || d.info.find((r) => r.key === "Authors");
    if (studioRow?.links?.length) {
      const line = el("p", "apl-studio-line", who);
      studioRow.links.forEach((l, i) => {
        if (i) line.appendChild(document.createTextNode(", "));
        const a = el("a", "apl-studio", line, l.label); a.href = l.href;
      });
    }

    const statusRow = d.info.find((r) => r.key === "Status");
    const stFR = STATUS_FR[statusRow?.text] || statusRow?.text || "";
    if (stFR) {
      const badges = el("div", "apl-badges", who);
      const b = el("span", "apl-badge", badges, stFR);
      b.style.setProperty("--apl-badge-dot", STATUS_COLOR[stFR] || "var(--apl-accent)");
    }

    if (d.chips.length) {
      const ch = el("div", "apl-chips", who);
      d.chips.slice(0, 8).forEach((c) => {
        const a = el("a", "apl-chip", ch, c.label);
        a.href = c.href;
      });
    }

    // Note dominante + stats secondaires (hiérarchie éditoriale, pas 4 KPIs égaux)
    if (d.score) {
      const sc = el("div", "apl-score", who);
      el("i", "apl-star", sc, "★");
      el("b", null, sc, d.score);
      el("span", null, sc, "Note" + (d.scoredBy ? " · " + d.scoredBy : ""));
    }
    const kpis = el("div", "apl-kpis", who);
    if (d.ranked) kpi(kpis, d.ranked, "Rang");
    if (d.popularity) kpi(kpis, d.popularity, "Popularité");
    if (d.members) kpi(kpis, d.members, "Membres");

    const act = el("div", "apl-actions", who);
    if (d.addListNode) { d.addListNode.classList.add("apl-pill-btn", "apl-primary"); moveInto(d.addListNode, act); }
    if (d.favNode) { d.favNode.classList.add("apl-pill-btn"); moveInto(d.favNode, act); }
    if (d.trailerLink) {
      const t = el("a", "apl-pill-btn", act, "▶ Bande-annonce");
      t.href = d.trailerLink; t.target = "_blank"; t.rel = "noopener";
    }

    // Teinte d'accent calculée depuis l'affiche (fallback neutre si CORS/canvas KO)
    try { tintFromPoster(d.poster, hero); } catch { /* décoratif seulement */ }

    // ---- Colonnes ----
    const cols = el("div", "apl-cols", view);
    const main = el("div", "apl-col-main", cols);
    const side = el("div", "apl-col-side", cols);

    const syn = card(main, "Synopsis", undefined, "apl-sec-synopsis");
    moveInto(d.synopsisNode, syn);

    if (d.info.length) {
      const body = card(main, "Informations", undefined, "apl-sec-infos");
      const grid = el("dl", "apl-infos", body);
      d.info.filter((r) => r.key !== "Type" && r.key !== "Status").forEach((r) => {
        el("dt", null, grid, KEY_FR[r.key] || r.key);
        const dd = el("dd", null, grid);
        if (r.links.length) {
          r.links.forEach((l, i) => {
            if (i) dd.appendChild(document.createTextNode(", "));
            const a = el("a", null, dd, l.label); a.href = l.href;
          });
          const rest = r.text;
          if (rest && !r.links.some((l) => rest.includes(l.label))) dd.appendChild(document.createTextNode(" " + rest));
        } else dd.textContent = r.text;
      });
    }

    if (d.chars.length) {
      const body = card(main, d.isManga ? "Personnages" : "Personnages & doubleurs", d.charsMore || undefined, "apl-sec-chars");
      const grid = el("div", "apl-persons", body);
      d.chars.forEach((p) => personCard(grid, p, !d.isManga));
    }

    if (d.staff.length) {
      const body = card(main, "Staff", d.staffMore || undefined, "apl-sec-staff");
      const grid = el("div", "apl-persons", body);
      d.staff.forEach((p) => personCard(grid, p, false));
    }

    if (d.themesNode) {
      const body = card(main, "Génériques");
      moveInto(d.themesNode, body);
    }

    // ---- Latéral ----
    // Widget de gestion de liste (si connecté et dans la liste)
    if (d.isInList && idInfo && listStatus && username) {
      const listWidget = card(side, "Ma liste");
      buildListWidget(listWidget, idInfo, listStatus, d.isManga, username);
    }

    if (d.trailerNode) {
      const body = card(side, "Vidéo");
      moveInto(d.trailerNode, body);
    }

    if (d.related.length) {
      const body = card(side, "Œuvres liées", undefined, "apl-sec-related");
      d.related.forEach((r) => {
        el("p", "apl-rel-type", body, r.type);
        const ul = el("ul", "apl-related", body);
        r.items.forEach((it) => {
          const li = el("li", null, ul);
          const a = el("a", null, li);
          a.href = it.href;
          if (it.img) { const im = el("img", null, a); im.src = it.img; im.alt = it.label; im.loading = "lazy"; }
          el("span", null, a, it.label);
        });
      });
    }

    if (d.nav.length > 1) {
      const body = card(side, "Explorer sur MAL");
      body.parentElement.classList.add("apl-card-soft");
      const ul = el("ul", "apl-navlist", body);
      d.nav.forEach((l) => {
        const li = el("li", null, ul);
        const a = el("a", null, li, NAV_FR[l.label] || l.label); a.href = l.href;
      });
    }

    // Sommaire par ancres (sections réellement présentes uniquement)
    const toc = el("nav", "apl-toc", null);
    toc.setAttribute("aria-label", "Sections de la fiche");
    const tocLink = (href, label) => { const a = el("a", null, toc, label); a.href = href; };
    tocLink("#apl-sec-synopsis", "Synopsis");
    if (d.info.length) tocLink("#apl-sec-infos", "Infos");
    if (d.chars.length) tocLink("#apl-sec-chars", "Personnages");
    if (d.staff.length) tocLink("#apl-sec-staff", "Staff");
    if (d.related.length) tocLink("#apl-sec-related", "Œuvres liées");
    if (toc.children.length > 1) hero.after(toc);

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-anime");
    ensureViewport();

    // État actif du sommaire (IntersectionObserver, pas de scroll listener).
    // Après insertion : observer des nœuds détachés ne déclencherait jamais.
    try {
      const links = [...toc.querySelectorAll("a")];
      const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
      if (links.length && secs.length && "IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
          });
        }, { rootMargin: "-30% 0px -60% 0px" });
        secs.forEach((s) => io.observe(s));
      }
    } catch { /* sommaire non interactif : les ancres restent cliquables */ }
  } catch {
    rollback();
    document.getElementById("myapple-anime")?.remove();
    document.body.classList.remove("myapple-anime");
  }
}

// Restauration complète de la page native (désactivation de l'extension).
function destroyAnimeView() {
  rollback();
  restoreViewport();
  document.getElementById("myapple-anime")?.remove();
  document.body.classList.remove("myapple-anime");
}

window.__myappleAnime = { readAnime, buildAnimeView, destroyAnimeView,
  // Crochets de test (lecture seule du parseur, aucun effet sur la vue).
  _parsePerson: parsePerson, _personCard: personCard };
})();
