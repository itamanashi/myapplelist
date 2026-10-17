// Adaptateur MAL-Sync : toute la logique d'interception, de normalisation,
// de filtrage et de rendu des nœuds tiers injectés par l'extension MAL-Sync.
// Script classique (même pattern que list-data.js) : exposé via
// window.__myappleMalSync, consommé par content/anime-view.js qui fournit
// ses helpers de construction (card/el/moveInto) aux fonctions de rendu.
// Aucune dépendance vers anime-view.js (sens unique : vue → adaptateur).
(() => {
"use strict";
const root = typeof window !== "undefined" ? window : globalThis;

const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

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
// liens liés sont exclus de nos libellés (relatedLabel).
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
    if (txt(a)) return;
    const img = a.querySelector("img");
    if (!img) return;
    push(a);
  });
  content.querySelectorAll("#mal-sync-stream-div a[href]").forEach((a) => push(a, "Reprendre"));
  return out.filter((l) => l.href && l.name);
}

// AniList : pas d'icône dans le hero — le lien est consommé par la vue pour
// rendre le titre principal cliquable. Partitionne + verrouille les sources
// AniList, retourne le reste à afficher en rangée.
function isAniListLink(l) {
  return /anilist\.co/i.test(l?.href || "") || /^anilist$/i.test((l?.name || "").trim());
}
function partitionExtLinks(links) {
  const anilist = [], rest = [];
  (links || []).forEach((l) => {
    if (isProcessed(l.src)) return;
    if (isAniListLink(l)) {
      markProcessed(l.src);
      anilist.push(l);
    } else rest.push(l);
  });
  return { anilist, rest };
}

// Libellé d'un lien lié : clone + retrait des enfants (badges de statut
// MAL-Sync), jamais le texte brut pollué. Repli : alt de la miniature.
function relatedLabel(a, imgEl) {
  if (a) {
    const c = a.cloneNode(true);
    c.querySelectorAll("span, img, i, em, strong").forEach((n) => n.remove());
    const t = txt(c);
    if (t) return t;
  }
  return txt(a) || imgEl?.getAttribute("alt") || "";
}

// Carte Streaming latérale (créée à la demande, après la carte Infos).
// Retourne le body ou null. Marque les sources réclamées (pas de doublon au
// re-balayage de l'observer). helpers : { card, el, moveInto } fournis par la vue.
function renderStreamCard(side, groups, h) {
  if (!groups.length) return null;
  const { card, el, moveInto } = h || {};
  if (typeof card !== "function" || typeof el !== "function" || typeof moveInto !== "function") return null;
  let sec = document.getElementById("apl-sec-stream");
  let body = sec?.querySelector(":scope > .apl-card-body") || null;
  if (!sec) {
    body = card(side, "Streaming", undefined, "apl-sec-stream");
    sec = body.parentElement;
    // Carte Streaming immédiatement APRÈS Informations (jamais devant) :
    // Informations reste le premier bloc de la sidebar. Recherche scopée à
    // `side` (document.getElementById ignore la vue tant qu'elle est détachée).
    // Sans carte Infos (cas limite), repli en tête de colonne.
    const infos = side.querySelector(":scope > #apl-sec-infos");
    if (infos) infos.insertAdjacentElement("afterend", sec);
    else if (side.firstChild && side.firstChild !== sec) side.insertBefore(sec, side.firstChild);
  }
  // Fournisseurs déjà affichés : une seule carte par service, même si
  // MAL-Sync réinjecte le même h2 en async après notre premier rendu.
  const rendered = new Set();
  sec.querySelectorAll("h2.mal_links").forEach((x) => {
    const k = providerKey(x, []);
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
function renderExtRow(who, links, el) {
  if (!links.length) return null;
  if (typeof el !== "function") return null;
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

// ---------- Cycle de vie : observateur des injections async ----------
// Balayage ciblée + debouncé (150 ms), jamais de travail layout-forçant.
// watch() déconnecte toute instance précédente ; unwatch() DOIT être appelé
// au démontage de la vue (destroy / échec de build) : sans ça l'observer
// retiendrait la vue détachée (fuite mémoire) et balayerait en arrière-plan.
let msObserver = null;
let msTimer = 0;
function watch(content, onSweep) {
  unwatch();
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
    msTimer = setTimeout(() => { try { onSweep(); } catch { /* intégration tierce non bloquante */ } }, 150);
  });
  msObserver.observe(content, { childList: true, subtree: true });
}
function unwatch() {
  if (msObserver) { msObserver.disconnect(); msObserver = null; }
  clearTimeout(msTimer);
  msTimer = 0;
}
function isWatching() {
  return !!msObserver;
}

root.__myappleMalSync = {
  markProcessed, isProcessed, providerKey, isAniListLink,
  malsyncGroups, malsyncExtLinks, partitionExtLinks, relatedLabel,
  renderStreamCard, renderExtRow,
  watch, unwatch, isWatching,
};
})();
