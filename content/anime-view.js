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
// Miniatures CDN : même nettoyage que list-data (retire le préfixe /r/<w>x<h>/ et ?s=...).
const cleanThumb = (u) => String(u || "").replace(/\/r\/\d+x\d+\//, "/").split("?")[0];

// Clés de la colonne gauche MAL (titres alternatifs : affichés sous le titre, pas dans la grille infos)
const ALT_KEYS = new Set(["Synonyms", "Japanese", "English", "French", "German", "Spanish"]);
// Clés affichées en pills dans la colonne latérale Informations
// (jamais dans le hero : pas de redondance ; exclues de la grille infos)
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

// Valeurs bouche-trous MAL ("Licensors: None found, [add some→dbchanges.php]") :
// résidus bruts exclus de NOTRE grille (le DOM natif reste intact).
// Un lien dbchanges.php seul ne sauve jamais la ligne ; "Unknown" est conservé.
const JUNK_VALUE = /^(add some|none|none found(,? add some)?|n\/a|\?|-)$/i;
const isJunkRow = (r) => JUNK_VALUE.test(r.text)
  && r.links.every((l) => /dbchanges\.php/i.test(l.href));

// Extraction de l'ID anime/manga depuis l'URL
function extractId(path) {
  const m = path.match(/^\/(anime|manga)\/(\d+)/);
  return m ? { kind: m[1], id: parseInt(m[2], 10) } : null;
}

// Lecture de l'état actuel de la liste depuis le DOM MAL natif.
// Source primaire (vérifiée live) : div.user-status-block, rendu serveur avec
// l'option `selected` correcte — select#myinfo_status (1/2/3/4/6),
// select#myinfo_score (0..10), input#myinfo_watchedeps (anime),
// input#myinfo_chapters + input#myinfo_volumes (manga).
// L'ancien sélecteur ul.user-status n'existe sur aucune fiche (retournait
// toujours null → repli "Plan to Watch" systématique) : conservé en fallback.
function readListStatus(content) {
  const intVal = (root, sel) => {
    const n = parseInt(root.querySelector(sel)?.value, 10);
    return Number.isFinite(n) ? n : null;
  };
  const block = content.querySelector("div.user-status-block");
  if (block) {
    return {
      statusId: intVal(block, 'select#myinfo_status, select[name="myinfo_status"]'),
      score: intVal(block, 'select#myinfo_score, select[name="myinfo_score"]') ?? 0,
      episodes: intVal(block, "input#myinfo_watchedeps") ?? intVal(block, "input#myinfo_chapters") ?? 0,
      volumes: intVal(block, "input#myinfo_volumes") ?? 0,
    };
  }

  const legacy = content.querySelector("ul.user-status");
  if (!legacy) return null;
  const active = legacy.querySelector("li.selected a");
  const m = (active?.getAttribute("href") || "").match(/status=(\d+)/);
  const num = (sel) => parseInt(content.querySelector(sel)?.textContent, 10) || 0;
  return {
    statusId: m ? parseInt(m[1], 10) : null,
    score: num("span#scoretext"),
    episodes: num("span#curEps, span#cur_chaps"),
    volumes: num("span#cur_vols"),
  };
}

// ---------- Intégration MAL-Sync (streaming & liens externes) ----------
// MAL-Sync, SI installé, injecte de façon asynchrone sur les fiches (source :
// MALSync/MALSync src/myanimelist/myanimelistClass.ts) :
//  - malToKiss : h2.mal_links#<Nom>Links (favicon + .remove-mal-sync [x]) puis
//    div.mal_links > a (liens) puis br.mal_links, devant le h2 "Information" ;
//  - streamingUI : #mal-sync-stream-div (reprise + flèches) dans .breadcrumb ;
//  - pageRelation : <li><a title><img></a></li> (AniList…) dans #horiznav_nav.
// Nœuds DÉPLACÉS (jamais clonés : les handlers MAL-Sync suivent, dont le [x]
// qui recharge la page), jamais reconstruits. Absent → rien : aucune carte
// vide, aucune erreur. Les badges de statut que MAL-Sync ajoute dans les
// liens liés sont exclus de nos libellés (labelOf).
// Verrou strict anti-réinjection : tout nœud source déplacé ou écarté (doublon)
// reçoit data-apl-processed="true" (dataset.aplClaimed conservé pour compat).
// Le watcher ignore en outre tout nœud à l'intérieur du wrapper #myapple-anime.
function markProcessed(node) {
  if (!node || !node.setAttribute) return;
  try {
    node.setAttribute("data-apl-processed", "true");
    node.dataset.aplClaimed = "1";
  } catch { /* nœud détaché : marquage ignoré */ }
}
function isProcessed(node) {
  return !!(node?.dataset?.aplClaimed || node?.getAttribute?.("data-apl-processed") === "true");
}

// Identifiant fournisseur : id du h2 ("Voir-AnimeLinks" → "voiranime"),
// sinon ?domain= de la favicon, sinon hostname du 1er lien.
// Normalisé (minuscules, alphanum) : deux injections MAL-Sync du même
// service donnent la même clé → une seule carte conservée.
function providerKey(head, nodes) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const idKey = norm((head?.id || head?.getAttribute?.("id") || "").replace(/links?$/i, ""));
  if (idKey) return idKey;
  const fav = head?.querySelector?.("img")?.getAttribute?.("src") || "";
  const dm = fav.match(/[?&]domain=([^&]+)/i);
  if (dm) {
    try { return norm(decodeURIComponent(dm[1]).split(":")[0]); } catch { return norm(dm[1]); }
  }
  for (const n of nodes || []) {
    const a = n.querySelector?.("a[href]");
    const href = a?.getAttribute?.("href") || "";
    const host = href.match(/https?:\/\/([^/]+)/i);
    if (host) return norm(host[1].replace(/^www\./i, ""));
    if (href) return norm(href.slice(0, 48));
  }
  const label = norm(head?.textContent || "");
  return label || "";
}

function malsyncGroups(content) {
  const groups = [];
  const seen = new Set();
  content.querySelectorAll("h2.mal_links").forEach((h) => {
    // Ignorer tout nœud déjà à l'intérieur de notre wrapper (boucle de ré-injection)
    if (h.closest?.("#myapple-anime")) return;
    if (isProcessed(h)) return;
    const nodes = [];
    let n = h.nextElementSibling;
    while (n && !(n.tagName === "H2" && n.classList.contains("mal_links"))) {
      const cur = n;
      n = n.nextElementSibling;
      if (cur.matches?.("div.mal_links, br.mal_links")) {
        if (cur.closest?.("#myapple-anime")) continue;
        nodes.push(cur);
      }
    }
    const key = providerKey(h, nodes);
    if (key) {
      if (seen.has(key)) {
        // Doublon du même fournisseur dans le même balayage : verrouiller
        // la source pour ne jamais la réinjecter.
        markProcessed(h);
        nodes.forEach(markProcessed);
        return;
      }
      seen.add(key);
    }
    groups.push({ head: h, nodes, key });
  });
  return groups;
}

// Icônes de suivi : liens img-only avec title (natifs = texte, jamais d'image
// seule). Inclut la reprise MAL-Sync du fil d'Ariane (styles inline neutralisés
// en CSS, handlers inexistants : recréés à neuf, aucun risque).
// Déduplication par href (un seul lien par cible), verrou strict, wrapper ignoré.
function malsyncExtLinks(content) {
  const out = [];
  const seenHref = new Set();
  const push = (a, fallbackName) => {
    if (!a || isProcessed(a) || a.closest?.("#myapple-anime")) return;
    const href = a.getAttribute("href") || "";
    if (!href || seenHref.has(href)) return;
    const img = a.querySelector("img");
    const name = a.getAttribute("title") || fallbackName || "";
    if (!href || !name) return;
    seenHref.add(href);
    out.push({ src: a, name, href, icon: img?.getAttribute("src") || "" });
  };
  content.querySelectorAll("#horiznav_nav > ul > li > a[title]").forEach((a) => {
    if (T(a)) return;
    const img = a.querySelector("img");
    if (!img) return;
    push(a);
  });
  content.querySelectorAll("#mal-sync-stream-div a[href]").forEach((a) => push(a, "Reprendre"));
  return out.filter((l) => l.href && l.name);
}

// Libellé d'un lien lié : clone + retrait des enfants (badges de statut
// MAL-Sync), jamais le texte brut pollué. Repli : alt de la miniature.
function relatedLabel(a, imgEl) {
  if (a) {
    const c = a.cloneNode(true);
    c.querySelectorAll("span, img, i, em, strong").forEach((n) => n.remove());
    const t = T(c);
    if (t) return t;
  }
  return T(a) || imgEl?.getAttribute("alt") || "";
}

// Carte Streaming latérale (créée à la demande, après la carte Infos si présente).
// Retourne le body ou null. Marque les sources réclamées (pas de doublon au
// re-balayage de l'observer).
function renderStreamCard(side, groups) {
  if (!groups.length) return null;
  let sec = document.getElementById("apl-sec-stream");
  let body = sec?.querySelector(":scope > .apl-card-body") || null;
  if (!sec) {
    body = card(side, "Streaming", undefined, "apl-sec-stream");
    sec = body.parentElement;
    const infos = document.getElementById("apl-sec-infos");
    if (infos && infos.parentElement === side && infos.nextSibling) side.insertBefore(sec, infos.nextSibling);
  }
  // Fournisseurs déjà affichés : une seule carte par service, même si
  // MAL-Sync réinjecte le même h2 en async après notre premier rendu.
  const rendered = new Set();
  sec.querySelectorAll("h2.mal_links").forEach((h) => {
    const k = providerKey(h, []);
    if (k) rendered.add(k);
  });
  let added = 0;
  groups.forEach((g) => {
    const key = g.key || providerKey(g.head, g.nodes);
    if (key && rendered.has(key)) {
      // Réinjection async du même fournisseur : verrouiller la source,
      // ne rien afficher en double.
      markProcessed(g.head);
      g.nodes.forEach(markProcessed);
      return;
    }
    if (key) rendered.add(key);
    const box = el("div", "apl-ms-group", body);
    box.setAttribute("data-apl-provider", key || "");
    moveInto(g.head, box);
    markProcessed(g.head);
    const links = el("div", "apl-ms-links", box);
    g.nodes.forEach((n) => { moveInto(n, links); markProcessed(n); });
    added++;
  });
  if (!added) return body;
  return body;
}

// Rangée de liens externes 24px dans le hero (créée à la demande).
// Déduplication par href : un seul lien par cible, verrou strict.
function renderExtRow(who, links) {
  if (!links.length) return null;
  let row = who.querySelector(":scope > .apl-ext");
  if (!row) {
    row = el("div", "apl-ext", who);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Liens externes");
  }
  const existing = new Set([...row.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  links.forEach((l) => {
    if (existing.has(l.href)) { markProcessed(l.src); return; }
    existing.add(l.href);
    const a = el("a", null, row);
    a.href = l.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = l.name;
    if (l.icon) { const im = el("img", null, a); im.src = l.icon; im.alt = ""; im.loading = "lazy"; }
    else a.textContent = l.name.slice(0, 2);
    markProcessed(l.src);
  });
  return row;
}

// Observateur MAL-Sync : balayage ciblé + debouncé (150 ms), jamais de
// travail layout-forçant. Déconnecté à la destruction de la vue.
let msObserver = null;
let msTimer = 0;
function sweepMalSync(content, side, who) {
  if (!document.getElementById("myapple-anime")) return;
  try {
    const fresh = malsyncGroups(content).filter((g) => !isProcessed(g.head));
    if (fresh.length && side?.isConnected) renderStreamCard(side, fresh);
    if (who?.isConnected) {
      const ext = malsyncExtLinks(content).filter((l) => !isProcessed(l.src));
      if (ext.length) renderExtRow(who, ext);
    }
  } catch { /* intégration tierce non bloquante */ }
}
function watchMalSync(content, side, who) {
  if (msObserver) msObserver.disconnect();
  msObserver = new MutationObserver((mutations) => {
    // Verrou : ignorer nos propres déplacements — toute mutation dont la
    // cible ou les nœuds ajoutés vivent dans le wrapper MyAppleList.
    const ours = mutations.every((m) => {
      if (m.target?.closest?.("#myapple-anime")) return true;
      const added = [...(m.addedNodes || [])];
      if (added.length && added.every((n) => n.closest?.("#myapple-anime") || (n.parentNode?.closest?.("#myapple-anime")))) return true;
      return false;
    });
    if (ours) return;
    clearTimeout(msTimer);
    msTimer = setTimeout(() => sweepMalSync(content, side, who), 150);
  });
  msObserver.observe(content, { childList: true, subtree: true });
}
function unwatchMalSync() {
  if (msObserver) { msObserver.disconnect(); msObserver = null; }
  clearTimeout(msTimer);
}

// Totaux servis par le bloc natif (manga : span#totalChaps/#totalVols[data-num]).
// Anime : le bloc ne donne que le compteur courant → total via la grille infos.
function readBlockTotals(content) {
  const num = (sel) => {
    const e = content.querySelector(sel);
    const n = parseInt(e?.getAttribute("data-num") ?? e?.textContent, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return { chapters: num("span#totalChaps"), volumes: num("span#totalVols") };
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
  // Titre : sur les fiches manga, [itemprop=name] englobe aussi le sous-titre
  // anglais (<br> + .title-english) → on le retire sur un CLONE (DOM intact).
  const rawTitleEl = document.querySelector("h1.title-name") || document.querySelector("[itemprop='name']");
  const titleEl = (() => {
    if (!rawTitleEl) return null;
    const c = rawTitleEl.cloneNode(true);
    c.querySelectorAll("br, small, .title-english").forEach((n) => n.remove());
    return c;
  })();
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
  const info = rows.filter((r) => r.key && !ALT_KEYS.has(r.key) && !isJunkRow(r));
  // Groupes de tags pour la carte Infos latérale (Genres / Thèmes / Public),
  // fusionnés par libellé FR (Genre+Genres éventuellement doublés par MAL).
  const genreGroups = [];
  {
    const byType = new Map();
    info.filter((r) => CHIP_KEYS.has(r.key) && r.links.length).forEach((r) => {
      const type = KEY_FR[r.key] || r.key;
      if (!byType.has(type)) byType.set(type, []);
      const seen = new Set(byType.get(type).map((l) => l.label));
      r.links.forEach((l) => { if (l.label && !seen.has(l.label)) { seen.add(l.label); byType.get(type).push(l); } });
    });
    for (const [type, items] of byType) if (items.length) genreGroups.push({ type, items });
  }

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

  // Bloc de gestion de liste existant (déjà dans la liste) : le marqueur réel
  // est div.user-status-block (avec select#myinfo_status). Les anciens
  // sélecteurs ul.user-status / .user-status-edit-block n'existent pas (fallback).
  const listStatusBlock = content.querySelector("div.user-status-block, select#myinfo_status");
  const listStatusEdit = content.querySelector("ul.user-status, .user-status-edit-block");
  const isInList = !!(listStatusBlock || listStatusEdit);
  const d = {
    isManga,
    title: T(titleEl),
    poster: IMG(posterIm),
    alt,
    info: info.filter((r) => !CHIP_KEYS.has(r.key) && !STAT_KEYS.has(r.key) && KNOWN_INFO.has(r.key)),
    score: T(scoreEl),
    scoredBy: parseScoredBy(scoreScope),
    ranked: num("span.numbers.ranked strong"),
    popularity: num("span.numbers.popularity strong"),
    members: num("span.numbers.members strong"),
    synopsisNode: content.querySelector("p[itemprop='description'], span[itemprop='description']"),
    trailerLink: content.querySelector(".video-promotion a.iframe")?.getAttribute("href") || "",
    trailerNode: content.querySelector(".video-promotion"),
    // Génériques : un bloc .theme-songs par section, précédé d'un marqueur
    // "Edit Opening Theme" / "Edit Ending Theme" (vérifié live). Les nœuds
    // sont DÉPLACÉS entiers (préviews audio + popup MAL gardées fonctionnelles),
    // jamais reconstruits.
    themesBlocks: [...content.querySelectorAll(".theme-songs")].map((node) => {
      let marker = "", s = node.previousElementSibling, hops = 0;
      while (s && hops < 3 && !marker) {
        const t = T(s).slice(0, 120);
        if (/opening|ending/i.test(t)) marker = t;
        s = s.previousElementSibling;
        hops++;
      }
      return { node, kind: /ending/i.test(marker) ? "ed" : /opening/i.test(marker) ? "op" : "" };
    }),
    addListNode,
    favNode,
    isInList,
    listStatusBlock,
    listStatusEdit,
    nav: [...content.querySelectorAll("#horiznav_nav a[href]")].map((a) => ({ label: T(a), href: a.getAttribute("href") || "" })).filter((l) => l.label),
    chars: [], charsMore: "", staff: [], staffMore: "", related: [],
    genreGroups, recs: [], recsMore: ""
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

  // Œuvres liées — nouveau markup .related-entries (fallback ancien tableau).
  // .relation contient type + format : "Sequel (TV)". L'année n'est PAS dans
  // le DOM (jamais inventée) : on affiche type (badge) + format si présents.
  const parseRelation = (txt) => {
    const t = String(txt || "").replace(/:$/, "").trim();
    const fm = t.match(/\(([^)]+)\)\s*$/);
    return {
      type: (fm ? t.slice(0, fm.index) : t).trim() || "Lié",
      format: fm ? fm[1].trim() : "",
    };
  };
  const relBox = content.querySelector(".related-entries");
  if (relBox) {
    const groups = new Map();
    relBox.querySelectorAll(".entry").forEach((en) => {
      const { type, format } = parseRelation(T(en.querySelector(".relation")));
      const a = en.querySelector(".content a[href]") || en.querySelector("a[href]");
      const imgEl = en.querySelector(".image img");
      const label = relatedLabel(a, imgEl);
      const item = a ? { label, href: a.getAttribute("href") || "", img: cleanThumb(IMG(imgEl)), format } : null;
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

  // Recommandations — slider natif ul.anime-slide après le h2#recommendations.
  // Carte affichée seulement si ≥1 entrée (jamais de bloc vide).
  const h2r = findH2(content, "Recommendations");
  if (h2r) {
    const slideScope = h2r.parentElement?.nextElementSibling || null;
    const slide = slideScope?.querySelector?.("ul.anime-slide")
      || [...content.querySelectorAll("ul.anime-slide")]
        .find((l) => h2r.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)
      || null;
    if (slide) {
      d.recs = [...slide.querySelectorAll("li.btn-anime")].map((li) => {
        const a = li.querySelector("a[href]");
        const href = a?.getAttribute("href") || "";
        if (!href) return null;
        const title = li.getAttribute("title") || relatedLabel(a, null) || "";
        const img = cleanThumb(IMG(li.querySelector("img")));
        return title ? { title, href, img } : null;
      }).filter(Boolean).slice(0, 8);
    }
    d.recsMore = slideScope?.querySelector?.("a.btn-detail-recommendations-view-all")?.getAttribute("href")
      || content.querySelector('a[href*="userrecs"]')?.getAttribute("href") || "";
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
  const ptx = el("span", "apl-person-text", a);
  el("b", null, ptx, p.name);
  if (p.sub) el("span", "apl-muted", ptx, p.sub);
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

// Libellés de score imposés (spec) : 10 Masterpiece … 1 Appalling.
const SCORE_LABELS = {
  10: "Masterpiece", 9: "Great", 8: "Very Good", 7: "Good", 6: "Fine",
  5: "Average", 4: "Bad", 3: "Very Bad", 2: "Horrible", 1: "Appalling",
};

// Options de statut : libellés MAL anglais (spec). Manga : Reading / Plan to Read.
function statusOptions(isManga) {
  return isManga
    ? [
        { id: 1, label: "Reading" },
        { id: 2, label: "Completed" },
        { id: 3, label: "On-Hold" },
        { id: 4, label: "Dropped" },
        { id: 6, label: "Plan to Read" },
      ]
    : [
        { id: 1, label: "Watching" },
        { id: 2, label: "Completed" },
        { id: 3, label: "On-Hold" },
        { id: 4, label: "Dropped" },
        { id: 6, label: "Plan to Watch" },
      ];
}

// Totaux connus depuis la grille infos MAL (lecture seule) : "24" -> 24, "Unknown" -> null.
function parseTotalText(txt) {
  if (!txt) return null;
  const m = String(txt).match(/(\d[\d,]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getTotals(d) {
  const epRow = d.info.find((r) => r.key === "Episodes");
  const chRow = d.info.find((r) => r.key === "Chapters");
  const volRow = d.info.find((r) => r.key === "Volumes");
  return {
    eps: parseTotalText(epRow?.text),
    chapters: parseTotalText(chRow?.text),
    volumes: parseTotalText(volRow?.text),
  };
}

// Widget de gestion de liste interactif FORCÉ.
// Ne dépend jamais du bloc MAL natif pour le rendu (masqué par l'overlay) :
// on construit notre propre bloc connecté à POST /ownlist/{anime|manga}/edit.json
// via window.__myappleList.updateEntry (CSRF frais, jamais de retry auto).
// ctx : { idInfo, listStatus, isManga, totals, username, isInList }
function buildListWidget(parent, ctx) {
  const { idInfo, isManga, totals } = ctx;
  let { listStatus, username, isInList } = ctx;
  listStatus = listStatus || { statusId: 6, score: 0, episodes: 0, volumes: 0 };

  const progTotal = isManga ? totals.chapters : totals.eps;
  const progLabel = isManga ? "Chapters" : "Episodes";
  const progValue = listStatus.episodes || 0;
  const opts = statusOptions(isManga);
  const optLabel = (id) => opts.find((o) => o.id === id)?.label || "";

  // Invité : pas d'écriture possible → titre + CTA login, jamais de faux contrôle.
  if (!username) {
    el("p", "apl-manage-title", parent, "Ma liste");
    const guest = el("p", "apl-manage-guest", parent);
    guest.textContent = "Connecte-toi sur MAL pour gérer ta liste.";
    const a = el("a", "apl-manage-login", parent, "Se connecter");
    a.href = "https://myanimelist.net/login.php";
    return null;
  }

  // En-tête du panneau : titre + pastille de statut LIVE (tokens --apl-st-*,
  // classes qualifiées .apl-status-dot.st-N). La pastille reflète le <select>,
  // pas la valeur lue : jamais de divergence affichée.
  const head = el("div", "apl-manage-head", parent);
  el("p", "apl-manage-title", head, isInList ? "Ma liste" : "Ajouter à ma liste");
  const curWrap = el("p", "apl-manage-current", head);
  const dot = el("span", "apl-status-dot st-6", curWrap);
  dot.setAttribute("aria-hidden", "true");
  const curLabel = el("span", null, curWrap, "");
  const syncHead = () => {
    const id = parseInt(statusSelect.value, 10) || 6;
    dot.className = `apl-status-dot st-${id}`;
    curLabel.textContent = optLabel(id);
  };

  const api = () => window.__myappleList || null;

  const controls = el("div", "apl-manage-grid", parent);

  // 1. Sélecteur de statut
  const statusWrap = el("div", "apl-list-widget-row", controls);
  el("label", "apl-list-widget-label", statusWrap, "Status");
  const statusSelect = el("select", "apl-list-widget-select", statusWrap);
  statusSelect.setAttribute("aria-label", "Statut dans la liste");
  statusOptions(isManga).forEach((s) => {
    const opt = el("option", null, statusSelect, s.label);
    opt.value = String(s.id);
    if (listStatus.statusId === s.id) opt.selected = true;
  });
  // Statut inconnu côté serveur : repli sur Plan (6), jamais de select vide.
  if (!statusOptions(isManga).some((s) => s.id === listStatus.statusId)) statusSelect.value = "6";
  syncHead();
  statusSelect.addEventListener("change", syncHead);

  // 2. Sélecteur de score 1..10 + libellés imposés, 0 = non noté.
  const scoreWrap = el("div", "apl-list-widget-row", controls);
  el("label", "apl-list-widget-label", scoreWrap, "Score");
  const scoreSelect = el("select", "apl-list-widget-select", scoreWrap);
  scoreSelect.setAttribute("aria-label", "Note de 1 à 10");
  const noneOpt = el("option", null, scoreSelect, "— Select score");
  noneOpt.value = "0";
  if (!listStatus.score) noneOpt.selected = true;
  for (let v = 10; v >= 1; v--) {
    const opt = el("option", null, scoreSelect, `(${v}) ${SCORE_LABELS[v]}`);
    opt.value = String(v);
    if (listStatus.score === v) opt.selected = true;
  }

  // 3. Progression épisodes / chapitres : [actuel] / [total] + contrôles +1 / -1.
  const progWrap = el("div", "apl-list-widget-row", controls);
  el("label", "apl-list-widget-label", progWrap, progLabel);
  const progLine = el("div", "apl-list-widget-prog", progWrap);
  const minusBtn = el("button", "apl-list-widget-btn", progLine, "−");
  minusBtn.type = "button";
  minusBtn.setAttribute("aria-label", "Retirer un épisode");
  const progInput = el("input", "apl-list-widget-input", progLine);
  progInput.type = "number";
  progInput.min = "0";
  if (progTotal) progInput.max = String(progTotal);
  progInput.value = String(progValue);
  progInput.setAttribute("aria-label", `${progLabel} vus`);
  el("span", "apl-list-widget-total", progLine, `/ ${progTotal || "?"}`);
  const plusBtn = el("button", "apl-list-widget-btn", progLine, "+");
  plusBtn.type = "button";
  plusBtn.setAttribute("aria-label", "Ajouter un épisode");

  // Volumes (manga uniquement)
  let volInput = null;
  if (isManga) {
    const volRow = el("div", "apl-list-widget-row", controls);
    el("label", "apl-list-widget-label", volRow, "Tomes");
    const volLine = el("div", "apl-list-widget-prog", volRow);
    const volMinus = el("button", "apl-list-widget-btn", volLine, "−");
    volMinus.type = "button";
    volMinus.setAttribute("aria-label", "Retirer un tome");
    volInput = el("input", "apl-list-widget-input", volLine);
    volInput.type = "number";
    volInput.min = "0";
    if (totals.volumes) volInput.max = String(totals.volumes);
    volInput.value = String(listStatus.volumes || 0);
    volInput.setAttribute("aria-label", "Tomes lus");
    el("span", "apl-list-widget-total", volLine, `/ ${totals.volumes || "?"}`);
    const volPlus = el("button", "apl-list-widget-btn", volLine, "+");
    volPlus.type = "button";
    volPlus.setAttribute("aria-label", "Ajouter un tome");
    volMinus.addEventListener("click", () => {
      volInput.value = String(Math.max(0, (parseInt(volInput.value, 10) || 0) - 1));
      persist();
    });
    volPlus.addEventListener("click", () => {
      const cur = parseInt(volInput.value, 10) || 0;
      const max = totals.volumes || Infinity;
      volInput.value = String(Math.min(max, cur + 1));
      persist();
    });
  }

  // Enregistrement : un seul POST par action, jamais de retry auto (un retry = +1 en double).
  const saveRow = el("div", "apl-list-widget-row apl-list-widget-save-row", parent);
  const saveBtn = el("button", "apl-list-widget-save", saveRow, isInList ? "Enregistrer" : "Add to My List");
  saveBtn.type = "button";
  const hint = el("p", "apl-manage-hint", saveRow, "");
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-live", "polite");

  let pending = false;
  const setHint = (msg) => { hint.textContent = msg; };

  async function persist() {
    if (pending) return false;
    const L = api();
    if (!L?.updateEntry) { setHint("Couche données indisponible."); return false; }
    pending = true;
    saveBtn.disabled = true;
    const prevLabel = saveBtn.textContent;
    saveBtn.textContent = "Enregistrement…";
    const status = parseInt(statusSelect.value, 10);
    const score = parseInt(scoreSelect.value, 10);
    const prog = Math.max(0, parseInt(progInput.value, 10) || 0);
    const vols = isManga && volInput ? Math.max(0, parseInt(volInput.value, 10) || 0) : 0;
    // Total connu et atteint → bascule auto en Completed (2), comme MAL natif.
    let effStatus = status;
    if (progTotal && prog >= progTotal && (status === 1 || status === 6)) {
      effStatus = 2;
      statusSelect.value = "2";
    }
    const fields = isManga
      ? { status: effStatus, score, chapters: prog, volumes: vols }
      : { status: effStatus, score, episodes: prog };
    try {
      await L.updateEntry({ kind: idInfo.kind, id: idInfo.id, fields });
      if (username) await L.dropCacheFor(idInfo.kind, username);
      isInList = true;
      saveBtn.textContent = "Enregistré ✓";
      setHint("");
      pending = false;
      saveBtn.disabled = false;
      setTimeout(() => { if (saveBtn.textContent === "Enregistré ✓") saveBtn.textContent = "Enregistrer"; }, 2000);
      return true;
    } catch (e) {
      pending = false;
      saveBtn.disabled = false;
      saveBtn.textContent = prevLabel;
      setHint(e?.code === "csrf" ? "Session expirée : recharge la page."
        : e?.code === "auth" ? "Reconnecte-toi sur MAL pour enregistrer."
        : "Échec d'enregistrement.");
      return false;
    }
  }

  saveBtn.addEventListener("click", () => { persist(); });
  minusBtn.addEventListener("click", () => {
    progInput.value = String(Math.max(0, (parseInt(progInput.value, 10) || 0) - 1));
    persist();
  });
  plusBtn.addEventListener("click", () => {
    const cur = parseInt(progInput.value, 10) || 0;
    const max = progTotal || Infinity;
    progInput.value = String(Math.min(max, cur + 1));
    persist();
  });

  return { persist, statusSelect, scoreSelect, progInput };
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

  // Extraction ID + état liste. Le bloc MAL natif (ul.user-status) sert à la LECTURE
  // seule ; le RENDU est toujours notre widget forcé (hero), même hors-liste / invité.
  const idInfo = extractId(path);
  const rawStatus = readListStatus(content);
  const listStatus = rawStatus || { statusId: 6, score: 0, episodes: 0, volumes: 0 };

  // Extraction username (même source que content.js : header connecté = .header-profile-link).
  const userEl = document.querySelector(
    "#headerSmall .header-profile-link, #header-menu .header-profile-link, #headerSmall .profile-link, #header-menu .profile-link"
  );
  const username = userEl ? (userEl.textContent || "").trim().slice(0, 20) || null : null;

  try {
    const view = el("div", null, null);
    view.id = "myapple-anime";

    // ---- Hero (surface pleine, sans bannière floutée) ----
    const hero = el("section", "apl-hero", view);
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
    if (metaBits.length) el("p", "apl-metaline", who, metaBits.join(" • "));

    const altLine = d.alt.map((r) => r.text).filter(Boolean).slice(0, 3).join(" • ");
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

    // Genres/thèmes : affichés UNIQUEMENT dans la colonne latérale
    // (genreGroups → carte Informations), jamais en double dans le hero.

    // Note dominante + stats secondaires (hiérarchie éditoriale, pas 4 KPIs égaux)
    if (d.score) {
      const sc = el("div", "apl-score", who);
      el("i", "apl-star", sc, "★");
      el("b", null, sc, d.score);
      el("span", "apl-score-scale", sc, "/10");
      el("span", null, sc, (d.scoredBy ? " · " + d.scoredBy : ""));
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

    // Panneau de gestion intégré au hero (éditorial, pas un bloc rapporté) :
    // Statut, Score 1-10, Stepper épisodes/chapitres — toujours affiché sur
    // /anime/* et /manga/*, avec le VRAI statut lu du bloc natif MAL.
    // Totaux : bloc natif prioritaire (data-num), grille infos en repli.
    if (idInfo) {
      const manage = el("div", "apl-manage", who);
      manage.setAttribute("role", "group");
      manage.setAttribute("aria-label", "Gestion de ma liste");
      try {
        const infoTotals = getTotals(d);
        const blockTotals = readBlockTotals(content);
        buildListWidget(manage, {
          idInfo, listStatus, isManga: d.isManga,
          totals: {
            eps: infoTotals.eps,
            chapters: blockTotals.chapters || infoTotals.chapters,
            volumes: blockTotals.volumes || infoTotals.volumes,
          },
          username, isInList: d.isInList,
        });
      } catch { /* widget non bloquant : le hero reste lisible */ }
    }

    // ---- Colonnes ----
    const cols = el("div", "apl-cols", view);
    const main = el("div", "apl-col-main", cols);
    const side = el("div", "apl-col-side", cols);

    // ---- Colonne principale : Synopsis → Personnages/Staff → Recommandations ----
    const syn = card(main, "Synopsis", undefined, "apl-sec-synopsis");
    moveInto(d.synopsisNode, syn);
    // Mention "[Written by MAL Rewrite" : nœud texte natif en fin de synopsis.
    // Masquage discret via habillage <span class="apl-credit"> (CSS seule) :
    // à la restauration, le span reste visible comme simple texte natif.
    try {
      const walker = document.createTreeWalker(syn, NodeFilter.SHOW_TEXT);
      let tn = walker.nextNode(), target = null;
      while (tn) { if (/\[Written by MAL Rewrite\]/.test(tn.nodeValue || "")) target = tn; tn = walker.nextNode(); }
      if (target) {
        const idx = target.nodeValue.indexOf("[Written by MAL Rewrite]");
        const before = target.nodeValue.slice(0, idx).replace(/[\s<br>]*$/, "");
        const credit = target.nodeValue.slice(idx).trim();
        target.nodeValue = before;
        if (credit) {
          const sp = document.createElement("span");
          sp.className = "apl-credit";
          sp.textContent = (before ? " " : "") + credit;
          target.parentNode.insertBefore(sp, target.nextSibling);
        }
      }
    } catch { /* crédit conservé tel quel si l'habillage échoue */ }

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

    if (d.recs.length) {
      const body = card(main, "Recommandations", d.recsMore || undefined, "apl-sec-recs");
      const row = el("div", "apl-recs", body);
      d.recs.forEach((rc) => {
        const a = el("a", "apl-rec", row);
        a.href = rc.href;
        a.title = rc.title;
        if (rc.img) { const im = el("img", null, a); im.src = rc.img; im.alt = ""; im.loading = "lazy"; }
        el("span", null, a, rc.title);
      });
    }

    // ---- Colonne latérale : Informations (tags) → Vidéo → Génériques → Liés ----
    if (d.info.length || d.genreGroups.length) {
      const body = card(side, "Informations", undefined, "apl-sec-infos");
      if (d.info.length) {
        const grid = el("dl", "apl-infos", body);
        d.info.filter((r) => !CHIP_KEYS.has(r.key) && !STAT_KEYS.has(r.key) && KNOWN_INFO.has(r.key)).forEach((r) => {
          el("dt", null, grid, KEY_FR[r.key] || r.key);
          const dd = el("dd", null, grid);
          // Statut de diffusion/publication traduit (badge du hero exclu de la grille)
          const shown = r.key === "Status" ? (STATUS_FR[r.text] || r.text) : r.text;
          if (r.links.length) {
            r.links.forEach((l, i) => {
              if (i) dd.appendChild(document.createTextNode(", "));
              const a = el("a", null, dd, l.label); a.href = l.href;
            });
            const rest = shown;
            if (rest && !r.links.some((l) => rest.includes(l.label))) dd.appendChild(document.createTextNode(" " + rest));
          } else dd.textContent = shown;
        });
      }
      d.genreGroups.forEach((g) => {
        el("p", "apl-genre-type", body, g.type);
        const pills = el("div", "apl-genre-pills", body);
        g.items.forEach((l) => {
          const a = el("a", "apl-genre-pill", pills, l.label);
          a.href = l.href;
        });
      });
    }
    if (d.trailerNode) {
      const body = card(side, "Vidéo");
      moveInto(d.trailerNode, body);
    }

    if (d.themesBlocks.length) {
      const body = card(side, "Génériques");
      d.themesBlocks.forEach((b) => {
        if (b.kind) el("p", "apl-op-type", body, b.kind === "op" ? "Opening Themes" : "Ending Themes");
        moveInto(b.node, body);
      });
    }

    if (d.related.length) {
      const body = card(side, "Œuvres liées", undefined, "apl-sec-related");
      const list = el("div", "apl-rel-cards", body);
      d.related.forEach((g) => g.items.forEach((it) => {
        const a = el("a", "apl-rel-card", list);
        a.href = it.href;
        a.title = it.label;
        if (it.img) { const im = el("img", null, a); im.src = it.img; im.alt = ""; im.loading = "lazy"; }
        const tx = el("span", "apl-rel-text", a);
        el("b", null, tx, it.label);
        if (it.format) el("i", null, tx, it.format);
        el("span", "apl-rel-badge", a, g.type);
      }));
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

    // Intégration MAL-Sync : l'observer prend le relais pour les injections
    // asynchrones (voir balayage initial ci-dessous, après insertion).

    // Sommaire par ancres (sections réellement présentes uniquement)
    const toc = el("nav", "apl-toc", null);
    toc.setAttribute("aria-label", "Sections de la fiche");
    const tocLink = (href, label) => { const a = el("a", null, toc, label); a.href = href; };
    tocLink("#apl-sec-synopsis", "Synopsis");
    if (d.chars.length) tocLink("#apl-sec-chars", "Personnages");
    if (d.staff.length) tocLink("#apl-sec-staff", "Staff");
    if (d.recs.length) tocLink("#apl-sec-recs", "Recos");
    if (d.info.length || d.genreGroups.length) tocLink("#apl-sec-infos", "Infos");
    if (d.related.length) tocLink("#apl-sec-related", "Œuvres liées");
    if (toc.children.length > 1) hero.after(toc);

    content.insertBefore(view, content.firstChild);
    document.body.classList.add("myapple-anime");
    ensureViewport();
    sweepMalSync(content, side, who);
    watchMalSync(content, side, who);

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
    unwatchMalSync();
    rollback();
    document.getElementById("myapple-anime")?.remove();
    document.body.classList.remove("myapple-anime");
  }
}

// Restauration complète de la page native (désactivation de l'extension).
function destroyAnimeView() {
  unwatchMalSync();
  rollback();
  restoreViewport();
  document.getElementById("myapple-anime")?.remove();
  document.body.classList.remove("myapple-anime");
}

window.__myappleAnime = { readAnime, buildAnimeView, destroyAnimeView,
  // Crochets de test (lecture seule du parseur, aucun effet sur la vue).
  _parsePerson: parsePerson, _personCard: personCard,
  _readListStatus: readListStatus, _readBlockTotals: readBlockTotals,
  _statusOptions: statusOptions, _getTotals: getTotals,
  _malsyncGroups: malsyncGroups, _malsyncExt: malsyncExtLinks,
  _renderStream: renderStreamCard, _renderExt: renderExtRow,
  _relatedLabel: relatedLabel, _providerKey: providerKey,
  _isProcessed: isProcessed, _markProcessed: markProcessed };
})();
