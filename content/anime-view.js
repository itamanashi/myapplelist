// Vue Anime/Manga Detail : EXTRACTION + RECONSTRUCTION (Apple Style).
// Extrait les données de la page détail MAL et reconstruit une mise en page premium.
// Appel : window.__myappleAnime?.buildAnimeView() depuis content.js
(() => {
"use strict";

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const N = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

function readAnimeDetail() {
  // Extraction depuis la page détail anime/manga MAL
  const path = location.pathname;
  const isAnime = /^\/anime\/\d+/.test(path);
  const isManga = /^\/manga\/\d+/.test(path);
  if (!isAnime && !isManga) return null;

  // Titre principal
  const titleBlock = document.querySelector("div[data-id='info2']") || document.querySelector(".title-name");
  const title = T(titleBlock) || document.querySelector("h1.title-name")?.textContent || "Titre inconnu";

  // Image principale (affiche)
  const mainPic = document.querySelector(".leftside a[rel='nofollow'] img") || 
                  document.querySelector(".left-side-recomm a img") ||
                  document.querySelector(".anime-detail-header .image img");
  const image = IMG(mainPic);

  // Métadonnées principales
  const meta = {};
  const infoBlock = document.querySelector(".space-top_pad") || document.querySelector(".anime-info");
  
  // Score et ranks
  const scoreEl = document.querySelector(".score-label") || document.querySelector('[itemprop="ratingValue"]');
  const score = N(scoreEl?.textContent);
  
  const rankEl = document.querySelector(".ranked strong") || document.querySelector('[itemprop="ratingCount"]');
  const rank = N(rankEl?.textContent?.replace("#", ""));
  
  const popularityEl = document.querySelector(".popularity strong");
  const popularity = N(popularityEl?.textContent?.replace("#", ""));

  // Synopsis
  const synopsisEl = document.querySelector(".anime-detail-header + p") || 
                     document.querySelector(".space-top_pad p") ||
                     document.querySelector("td[valign='top']:not(.space-top) p");
  let synopsis = T(synopsisEl) || "";
  // Nettoyer "No synopsis currently available."
  if (/no synopsis/i.test(synopsis)) synopsis = "";
  const hasLongSynopsis = synopsis.length > 400;

  // Informations tabulaires (table MAL)
  const infoTable = document.querySelector(".space-top_pad table") || document.querySelector(".anime-info table");
  const details = [];
  if (infoTable) {
    infoTable.querySelectorAll("tr").forEach((tr) => {
      const label = T(tr.querySelector("td:first-child"));
      const value = T(tr.querySelector("td:last-child"));
      if (label && value) {
        details.push({ label: label.replace(/:$/, ""), value });
      }
    });
  }

  // Studios / Publishers
  const studios = [];
  document.querySelectorAll('.studio a[href*="/producer"], .publisher a[href*="/publisher"]').forEach((a) => {
    studios.push({ name: T(a), href: a.href });
  });

  // Genres
  const genres = [];
  document.querySelectorAll('.keyword a[href*="/genre"], .genre a[href*="/genre"]').forEach((a) => {
    genres.push({ name: T(a), href: a.href });
  });

  // Source (pour anime)
  const source = details.find((d) => /source/i.test(d.label))?.value || "";

  // Statut (En cours / Terminé)
  const status = details.find((d) => /status/i.test(d.label))?.value || "";
  
  // Dates
  const airedFrom = details.find((d) => /aired.*from/i.test(d.label))?.value || "";
  const airedTo = details.find((d) => /aired.*to/i.test(d.label))?.value || "";
  const duration = details.find((d) => /duration/i.test(d.label))?.value || "";
  const episodes = details.find((d) => /episodes/i.test(d.label))?.value || "";
  const chapters = details.find((d) => /chapters/i.test(d.label))?.value || "";
  const volumes = details.find((d) => /volumes/i.test(d.label))?.value || "";

  // Rating / Classification
  const rating = details.find((d) => /rating/i.test(d.label))?.value || "";

  // Personnages
  const characters = [];
  document.querySelectorAll(".anime-character-container .character-river .fleft").forEach((ch) => {
    const img = IMG(ch.querySelector("img"));
    const name = T(ch.querySelector(".name a") || ch.querySelector(".name"));
    const role = T(ch.querySelector(".role") || ch.querySelector(".fn-grey2"));
    const href = ch.querySelector("a")?.href || "";
    if (name && img) {
      characters.push({ name, role, img, href });
    }
  });

  // Staff
  const staff = [];
  document.querySelectorAll(".anime-detail-headerstaff .staff-holder .detail-1-list2, .anime-staff-table .staff-row").forEach((row) => {
    const name = T(row.querySelector(".name a") || row.querySelector(".name"));
    const role = T(row.querySelector(".role") || row.querySelector(".position"));
    if (name && role) {
      staff.push({ name, role });
    }
  });

  // Recommandations similaires
  const recommendations = [];
  document.querySelectorAll(".anime-slide-block a[href*='/anime/'], .recommendations-page a[href*='/anime/']").forEach((a) => {
    const img = IMG(a.querySelector("img"));
    const title = T(a.querySelector("img")?.title || a.textContent);
    const href = a.href;
    if (img && title && !recommendations.find((r) => r.title === title)) {
      recommendations.push({ title, img, href });
    }
  });

  // Opening/Ending themes
  const themes = { openings: [], endings: [] };
  document.querySelectorAll(".theme-song .theme-list .theme-item").forEach((item, i) => {
    const song = T(item);
    if (song) themes.openings.push(song);
  });

  // Related anime/manga
  const related = [];
  document.querySelectorAll(".anime-detail-related td").forEach((td) => {
    const link = td.querySelector("a");
    const type = T(td.querySelector(".relation"));
    if (link) {
      related.push({ title: T(link), href: link.href, type: type || "" });
    }
  });

  return {
    kind: isAnime ? "anime" : "manga",
    title,
    image,
    score,
    rank,
    popularity,
    synopsis,
    hasLongSynopsis,
    details,
    studios,
    genres,
    source,
    status,
    airedFrom,
    airedTo,
    duration,
    episodes,
    chapters,
    volumes,
    rating,
    characters: characters.slice(0, 12),
    staff: staff.slice(0, 6),
    recommendations: recommendations.slice(0, 12),
    themes,
    related,
  };
}

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function frDate(dateStr) {
  if (!dateStr || dateStr === "Not available") return "";
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return dateStr;
  try { 
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(t); 
  } catch { 
    return dateStr; 
  }
}

function buildAnimeView() {
  if (document.getElementById("myapple-anime")) return;
  
  const d = readAnimeDetail();
  if (!d) return;

  const view = el("div", null, null);
  view.id = "myapple-anime";
  document.body.classList.add("myapple-anime");

  // ==================== HERO ====================
  const hero = el("section", "apl-anime-hero", view);
  
  // Bannière avec image de fond
  const banner = el("div", "apl-anime-banner", hero);
  if (d.image) {
    const im = new Image();
    im.onload = () => { banner.style.backgroundImage = `url("${d.image}")`; };
    im.src = d.image;
  }

  // Contenu hero
  const heroContent = el("div", "apl-anime-hero-content", hero);

  // Affiche
  const posterWrap = el("div", "apl-anime-poster", heroContent);
  const poster = el("img", null, posterWrap);
  poster.src = d.image;
  poster.alt = d.title;
  poster.loading = "lazy";

  // Infos principales
  const info = el("div", "apl-anime-info", heroContent);
  
  // Titre
  el("h1", "apl-anime-title", info, d.title);

  // Métadonnées en chips
  const metaRow = el("div", "apl-anime-meta", info);
  if (d.status) {
    const chip = el("span", "apl-anime-chip", metaRow);
    el("span", null, chip, d.status);
  }
  if (d.episodes) {
    const chip = el("span", "apl-anime-chip", metaRow);
    el("span", null, chip, `${d.episodes} épisodes`);
  } else if (d.chapters) {
    const chip = el("span", "apl-anime-chip", metaRow);
    el("span", null, chip, `${d.chapters} chapitres`);
  }
  if (d.duration) {
    const chip = el("span", "apl-anime-chip", metaRow);
    el("span", null, chip, d.duration);
  }

  // Genres
  if (d.genres.length) {
    const genresRow = el("div", "apl-anime-genres", info);
    d.genres.forEach((g) => {
      const a = el("a", "apl-anime-genre", genresRow, g.name);
      a.href = g.href;
    });
  }

  // Studios
  if (d.studios.length) {
    const studiosRow = el("div", "apl-anime-studios", info);
    d.studios.forEach((s, i) => {
      if (i > 0) el("span", null, studiosRow, " · ");
      const a = el("a", null, studiosRow, s.name);
      a.href = s.href;
    });
  }

  // KPIs (score, rank, popularity)
  const kpis = el("div", "apl-anime-kpis", heroContent);
  
  if (d.score) {
    const kpi = el("div", "apl-anime-kpi", kpis);
    el("span", "apl-kpi-value", kpi, d.score.toFixed(1));
    el("span", "apl-kpi-label", kpi, "Score");
    el("span", "apl-kpi-star", kpi, "★");
  }
  if (d.rank) {
    const kpi = el("div", "apl-anime-kpi", kpis);
    el("span", "apl-kpi-value", kpi, "#" + d.rank);
    el("span", "apl-kpi-label", kpi, "Ranked");
  }
  if (d.popularity) {
    const kpi = el("div", "apl-anime-kpi", kpis);
    el("span", "apl-kpi-value", kpi, "#" + d.popularity);
    el("span", "apl-kpi-label", kpi, "Popularity");
  }

  // ==================== MAIN CONTENT ====================
  const main = el("div", "apl-anime-main", view);

  // Synopsis
  if (d.synopsis) {
    const synopsisCard = el("section", "apl-anime-card", main);
    el("h2", null, synopsisCard, "Synopsis");
    const synopsisBody = el("div", "apl-anime-synopsis", synopsisCard);
    if (d.hasLongSynopsis) {
      synopsisBody.innerHTML = escapeHtml(d.synopsis.slice(0, 400)) + "…";
      const moreBtn = el("button", "apl-anime-more", synopsisBody, "Lire la suite");
      moreBtn.type = "button";
      moreBtn.addEventListener("click", () => {
        synopsisBody.innerHTML = escapeHtml(d.synopsis);
        moreBtn.remove();
      });
    } else {
      synopsisBody.textContent = d.synopsis;
    }
  }

  // Détails tabulaires
  if (d.details.length) {
    const detailsCard = el("section", "apl-anime-card", main);
    el("h2", null, detailsCard, "Informations");
    const detailsBody = el("dl", "apl-anime-details", detailsCard);
    d.details.forEach((detail) => {
      // Filtrer les infos déjà affichées dans le hero
      if (/^(score|ranked|popularity|episodes|chapters|duration|status|genre|studio|publisher)$/i.test(detail.label)) return;
      el("dt", null, detailsBody, detail.label);
      el("dd", null, detailsBody, detail.value);
    });
  }

  // Personnages
  if (d.characters.length) {
    const charsCard = el("section", "apl-anime-card", main);
    el("h2", null, charsCard, "Personnages");
    const charsGrid = el("div", "apl-anime-chars", charsCard);
    d.characters.forEach((ch) => {
      const card = el("a", "apl-anime-char", charsGrid);
      card.href = ch.href;
      const thumb = el("div", "apl-anime-char-thumb", card);
      const img = el("img", null, thumb);
      img.src = ch.img;
      img.alt = ch.name;
      img.loading = "lazy";
      const info = el("div", "apl-anime-char-info", card);
      el("span", "apl-anime-char-name", info, ch.name);
      el("span", "apl-anime-char-role", info, ch.role);
    });
  }

  // Staff
  if (d.staff.length) {
    const staffCard = el("section", "apl-anime-card", main);
    el("h2", null, staffCard, "Équipe");
    const staffList = el("ul", "apl-anime-staff", staffCard);
    d.staff.forEach((s) => {
      const li = el("li", null, staffList);
      const name = el("span", "apl-anime-staff-name", li, s.name);
      name.style.fontWeight = "600";
      el("span", "apl-anime-staff-role", li, s.role);
    });
  }

  // Related
  if (d.related.length) {
    const relatedCard = el("section", "apl-anime-card", main);
    el("h2", null, relatedCard, "Œuvres liées");
    const relatedList = el("ul", "apl-anime-related", relatedCard);
    d.related.forEach((r) => {
      const li = el("li", null, relatedList);
      const a = el("a", null, li, r.title);
      a.href = r.href;
      el("span", null, li, ` (${r.type})`);
    });
  }

  // Recommandations similaires
  if (d.recommendations.length) {
    const recCard = el("section", "apl-anime-card", main);
    el("h2", null, recCard, "Recommandations");
    const recGrid = el("div", "apl-anime-recs", recCard);
    d.recommendations.forEach((r) => {
      const a = el("a", "apl-anime-rec", recGrid);
      a.href = r.href;
      const thumb = el("div", "apl-anime-rec-thumb", a);
      const img = el("img", null, thumb);
      img.src = r.img;
      img.alt = r.title;
      img.loading = "lazy";
      el("span", "apl-anime-rec-title", a, r.title);
    });
  }

  // Insérer dans le DOM
  const content = document.getElementById("content") || document.querySelector(".content-container");
  if (content?.parentNode) {
    content.parentNode.insertBefore(view, content);
  } else {
    document.body.insertBefore(view, document.body.firstChild);
  }
}

// Export pour content.js
window.__myappleAnime = { readAnimeDetail, buildAnimeView };
})();