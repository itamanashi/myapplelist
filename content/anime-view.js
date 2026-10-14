// Vue Anime/Manga Detail : EXTRACTION + RECONSTRUCTION (Apple Style).
// Extrait les données de la page détail MAL et reconstruit une mise en page premium.
// Appel : window.__myappleAnime?.buildAnimeView() depuis content.js
(() => {
"use strict";

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const N = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

function extractTableData() {
  // Extrait les données d'une table MAL key: value
  const result = {};
  document.querySelectorAll("table tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) {
      const key = T(cells[0]).replace(/:$/, "").toLowerCase();
      const value = T(cells[1]);
      if (key && value) result[key] = value;
    }
  });
  return result;
}

function readAnimeDetail() {
  // Extraction depuis la page détail anime/manga MAL
  const path = location.pathname;
  const isAnime = /^\/anime\/\d+/.test(path);
  const isManga = /^\/manga\/\d+/.test(path);
  if (!isAnime && !isManga) return null;

  // Titre : chercher dans les headings
  let title = "";
  const h1 = document.querySelector("h1");
  if (h1) title = T(h1);
  if (!title) {
    const titleDiv = document.evaluate(
      "//div[contains(@class, 'title')]",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    if (titleDiv) title = T(titleDiv);
  }
  if (!title) title = document.title.split(" - ")[0];

  // Image : chercher les img dans la zone left (affiche)
  let image = "";
  const leftSide = document.querySelector(".leftside, .left, .anime-detail");
  if (leftSide) {
    const img = leftSide.querySelector("img[src*='cdn'], img[src*='image'], img[alt]");
    if (img) image = IMG(img);
  }
  if (!image) {
    const allImgs = document.querySelectorAll("img[src*='cdn']");
    if (allImgs.length) image = IMG(allImgs[0]);
  }

  // Statistics : chercher Score, Rank, Popularity
  let score = 0, rank = 0, popularity = 0;
  const statsText = document.body.textContent;
  
  // Chercher "Score: X.XXX"
  let scoreMatch = statsText.match(/Score:\s*([\d.]+)/i);
  if (scoreMatch) score = parseFloat(scoreMatch[1]);
  
  // Chercher "Ranked: #XXXX"
  let rankMatch = statsText.match(/Ranked:\s*#?([\d,]+)/i);
  if (rankMatch) rank = N(rankMatch[1]);
  
  // Chercher "Popularity: #XXXX"
  let popMatch = statsText.match(/Popularity:\s*#?([\d,]+)/i);
  if (popMatch) popularity = N(popMatch[1]);

  // Synopsis : long paragraphe texte (pas dans une table)
  let synopsis = "";
  const ps = document.querySelectorAll("p");
  ps.forEach((p) => {
    const text = T(p);
    if (text.length > 200 && !synopsis) {
      if (!/^(Tank|Seatbelts|Review|Poll|Episode|Discussion)/i.test(text)) {
        synopsis = text;
      }
    }
  });
  const hasLongSynopsis = synopsis.length > 400;

  // Table data
  const tableData = extractTableData();

  // Extraire des clés common
  const status = tableData.status || "";
  const episodes = tableData.episodes || "";
  const chapters = tableData.chapters || "";
  const volumes = tableData.volumes || "";
  const duration = tableData.duration || "";
  const rating = tableData.rating || "";
  const source = tableData.source || "";
  const aired = tableData.aired || "";
  const published = tableData.published || "";

  // Genres : chercher les liens avec "genre"
  const genres = [];
  document.querySelectorAll('a[href*="/genre/"]').forEach((a) => {
    const name = T(a);
    if (name && !genres.find((g) => g.name === name)) {
      genres.push({ name, href: a.href });
    }
  });

  // Studios / Publishers
  const studios = [];
  document.querySelectorAll('a[href*="/producer/"], a[href*="/publisher/"]').forEach((a) => {
    const name = T(a);
    if (name && !studios.find((s) => s.name === name)) {
      studios.push({ name, href: a.href });
    }
  });

  // Personnages : chercher la section "Characters & Staff"
  const characters = [];
  document.querySelectorAll(".character-img-container").forEach((cont) => {
    const img = IMG(cont.querySelector("img"));
    const nameLink = cont.querySelector("a");
    const name = T(nameLink);
    const roleEl = cont.parentElement?.querySelector(".role");
    const role = T(roleEl) || "Character";
    const href = nameLink?.href || "";
    if (name && img && !characters.find((c) => c.name === name)) {
      characters.push({ name, role, img, href });
    }
  });

  // Staff : chercher les staff roles
  const staff = [];
  document.querySelectorAll(".staff-name-role").forEach((cont) => {
    const nameLink = cont.querySelector("a");
    const name = T(nameLink);
    const roleEl = cont.querySelector(".role");
    const role = T(roleEl) || "";
    if (name && role) {
      staff.push({ name, role });
    }
  });

  // Recommendations
  const recommendations = [];
  document.querySelectorAll(".recommendations-section .recommendation-card").forEach((card) => {
    const img = IMG(card.querySelector("img"));
    const titleEl = card.querySelector("a");
    const title = T(titleEl);
    const href = titleEl?.href || "";
    if (title && img && !recommendations.find((r) => r.title === title)) {
      recommendations.push({ title, img, href });
    }
  });

  // Related
  const related = [];
  document.querySelectorAll(".anime-detail-related-list a").forEach((a) => {
    const title = T(a);
    const href = a.href;
    if (title && !related.find((r) => r.title === title)) {
      related.push({ title, href, type: "" });
    }
  });

  return {
    kind: isAnime ? "anime" : "manga",
    title: title || "Titre inconnu",
    image,
    score,
    rank,
    popularity,
    synopsis,
    hasLongSynopsis,
    status,
    episodes,
    chapters,
    volumes,
    duration,
    rating,
    source,
    aired,
    published,
    studios,
    genres,
    characters: characters.slice(0, 12),
    staff: staff.slice(0, 8),
    recommendations: recommendations.slice(0, 12),
    related: related.slice(0, 8),
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
  if (!d || !d.title) return;

  const view = el("div", null, null);
  view.id = "myapple-anime";
  document.body.classList.add("myapple-anime");

  // ==================== HERO ====================
  const hero = el("section", "apl-anime-hero", view);
  
  // Bannière avec image de fond floue
  const banner = el("div", "apl-anime-banner", hero);
  if (d.image) {
    banner.style.backgroundImage = `url("${d.image}")`;
  }

  // Contenu hero
  const heroInner = el("div", "apl-anime-hero-inner", hero);

  // Affiche
  const posterWrap = el("div", "apl-anime-poster", heroInner);
  const poster = el("img", null, posterWrap);
  poster.src = d.image || "";
  poster.alt = d.title;
  poster.loading = "lazy";

  // Infos principales
  const infoCol = el("div", "apl-anime-info-col", heroInner);
  
  // Titre
  el("h1", "apl-anime-title", infoCol, d.title);

  // Badges status + meta
  const badges = el("div", "apl-anime-badges", infoCol);
  if (d.status) {
    const badge = el("span", "apl-badge", badges, d.status);
    badge.className = "apl-badge apl-badge-" + (d.status.includes("Airing") ? "airing" : "finished");
  }
  if (d.episodes) {
    el("span", "apl-badge", badges, `${d.episodes} épisodes`);
  } else if (d.chapters) {
    el("span", "apl-badge", badges, `${d.chapters} chapitres`);
  }
  if (d.duration) {
    el("span", "apl-badge", badges, d.duration);
  }

  // Genres tag cloud
  if (d.genres.length) {
    const genreWrap = el("div", "apl-anime-genres", infoCol);
    d.genres.slice(0, 6).forEach((g) => {
      const tag = el("a", "apl-genre-tag", genreWrap, g.name);
      tag.href = g.href;
    });
  }

  // Studios
  if (d.studios.length) {
    const studioLine = el("div", "apl-anime-studio-line", infoCol);
    el("span", "apl-label", studioLine, "Produit par ");
    d.studios.slice(0, 2).forEach((s, i) => {
      if (i > 0) el("span", null, studioLine, ", ");
      const a = el("a", null, studioLine, s.name);
      a.href = s.href;
    });
  }

  // KPIs card
  if (d.score || d.rank || d.popularity) {
    const kpis = el("div", "apl-anime-stats", heroInner);
    
    if (d.score) {
      const kpi = el("div", "apl-anime-stat", kpis);
      el("div", "apl-stat-value", kpi, d.score.toFixed(2));
      el("div", "apl-stat-label", kpi, "Score");
      el("div", "apl-stat-icon", kpi, "★");
    }
    if (d.rank) {
      const kpi = el("div", "apl-anime-stat", kpis);
      el("div", "apl-stat-value", kpi, "#" + d.rank);
      el("div", "apl-stat-label", kpi, "Ranked");
    }
    if (d.popularity) {
      const kpi = el("div", "apl-anime-stat", kpis);
      el("div", "apl-stat-value", kpi, "#" + d.popularity);
      el("div", "apl-stat-label", kpi, "Popular");
    }
  }

  // ==================== MAIN CONTENT ====================
  const main = el("div", "apl-anime-main", view);

  // Synopsis card
  if (d.synopsis) {
    const synCard = el("section", "apl-anime-card", main);
    el("h2", "apl-card-title", synCard, "Synopsis");
    const synBody = el("div", "apl-anime-synopsis", synCard);
    
    if (d.hasLongSynopsis) {
      synBody.textContent = d.synopsis.slice(0, 320) + "…";
      const readMore = el("button", "apl-read-more-btn", synBody);
      readMore.type = "button";
      readMore.textContent = "Lire la suite";
      readMore.onclick = () => {
        synBody.innerHTML = escapeHtml(d.synopsis);
        readMore.remove();
      };
    } else {
      synBody.textContent = d.synopsis;
    }
  }

  // Infos détaillées
  const infoCard = el("section", "apl-anime-card", main);
  el("h2", "apl-card-title", infoCard, "Informations");
  const infoGrid = el("div", "apl-anime-info-grid", infoCard);
  
  const infoItems = [
    { label: "Type", value: d.kind === "anime" ? "Anime" : "Manga" },
    { label: "Épisodes", value: d.episodes || (d.chapters ? d.chapters + " chapitres" : "—") },
    { label: "Durée", value: d.duration || "—" },
    { label: "Statut", value: d.status || "—" },
    { label: "Diffusion", value: d.aired || d.published || "—" },
    { label: "Classification", value: d.rating || "—" },
    { label: "Source", value: d.source || "—" }
  ];
  
  infoItems.forEach((item) => {
    if (item.value && item.value !== "—") {
      const row = el("div", "apl-info-item", infoGrid);
      el("span", "apl-info-label", row, item.label);
      el("span", "apl-info-value", row, item.value);
    }
  });

  // Personnages
  if (d.characters.length) {
    const charCard = el("section", "apl-anime-card", main);
    el("h2", "apl-card-title", charCard, `Personnages (${d.characters.length})`);
    const charGrid = el("div", "apl-anime-char-grid", charCard);
    
    d.characters.forEach((ch) => {
      const item = el("a", "apl-char-item", charGrid);
      item.href = ch.href;
      
      const imgWrap = el("div", "apl-char-img", item);
      const img = el("img", null, imgWrap);
      img.src = ch.img;
      img.alt = ch.name;
      img.loading = "lazy";
      
      const txt = el("div", "apl-char-text", item);
      el("div", "apl-char-name", txt, ch.name);
      el("div", "apl-char-role", txt, ch.role);
    });
  }

  // Staff
  if (d.staff.length) {
    const staffCard = el("section", "apl-anime-card", main);
    el("h2", "apl-card-title", staffCard, "Équipe de production");
    const staffList = el("ul", "apl-anime-staff-list", staffCard);
    
    d.staff.forEach((s) => {
      const li = el("li", "apl-staff-item", staffList);
      el("span", "apl-staff-name", li, s.name);
      el("span", "apl-staff-role", li, s.role);
    });
  }

  // Recommandations
  if (d.recommendations.length) {
    const recCard = el("section", "apl-anime-card", main);
    el("h2", "apl-card-title", recCard, "Recommandations similaires");
    const recGrid = el("div", "apl-anime-rec-grid", recCard);
    
    d.recommendations.forEach((rec) => {
      const item = el("a", "apl-rec-item", recGrid);
      item.href = rec.href;
      
      const imgWrap = el("div", "apl-rec-img", item);
      const img = el("img", null, imgWrap);
      img.src = rec.img;
      img.alt = rec.title;
      img.loading = "lazy";
      
      el("div", "apl-rec-title", item, rec.title);
    });
  }

  // Related
  if (d.related.length) {
    const relCard = el("section", "apl-anime-card", main);
    el("h2", "apl-card-title", relCard, "Œuvres liées");
    const relList = el("ul", "apl-anime-related-list", relCard);
    
    d.related.forEach((rel) => {
      const li = el("li", null, relList);
      const a = el("a", null, li, rel.title);
      a.href = rel.href;
    });
  }

  // Insérer dans le DOM avant le contenu MAL
  const malContent = document.querySelector("#content, .content-container");
  if (malContent) {
    malContent.parentNode.insertBefore(view, malContent);
  } else {
    document.body.insertBefore(view, document.body.firstChild);
  }
}

// Export pour content.js
window.__myappleAnime = { readAnimeDetail, buildAnimeView };
})();