// Vue Anime/Manga Detail : STYLISATION DIRECTE (Apple Style).
// Applique un redesign Apple directement sur les éléments MAL existants.
// Appel : window.__myappleAnime?.buildAnimeView() depuis content.js
(() => {
"use strict";

function buildAnimeView() {
  // Détecte si on est sur une page anime/manga
  const path = location.pathname;
  const isAnime = /^\/anime\/\d+/.test(path);
  const isManga = /^\/manga\/\d+/.test(path);
  if (!isAnime && !isManga) return;

  // Marqueur pour le CSS
  document.body.classList.add("myapple-anime-detail");
  
  console.log("[myapplelist] Anime/Manga detail view stylisée");
}

// Export pour content.js
window.__myappleAnime = { buildAnimeView };
})();
