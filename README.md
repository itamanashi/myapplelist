# MyAppleList — extension Chrome (MV3)

On ne récupère PAS le visuel MAL pour le copier.
On pose **notre** visuel par-dessus `myanimelist.net` via content-script.

## Ce que fait l'extension
- Injecte une topbar `myapplelist` (recherche, dark mode, notes) sur toutes les pages MAL
- Ajoute un panneau latéral Notes perso stocké en `chrome.storage.local`, par URL
- Bouton FAB  en bas à droite
- Popup pour activer/couper, dark/light
- `overlay.css` restyle en grille moderne façon Apple (re-style du CSS MAL,
  masquage du chrome header/footer/pubs, conteneurs racine jamais masqués).
- **Vues reconstruites** (le DOM MAL sert de source, jamais dupliqué) :
  - listes anime/manga (hero, KPIs, grille/tableau, modal de détail, actions rapides) ;
  - profil (hero, KPIs, favoris, timeline) ;
  - fiches anime/manga (hero, KPIs, infos, personnages, staff, œuvres liées) ;
  - saisons `/anime/season` (filtres, grille) ;
  - people `/people/<id>` (bio déplacée, rôles voix, staff) ;
  - producteurs/studios `/anime/producer`, `/studio` (œuvres, actualités) ;
  - genres `/anime/genre/<id>` (répartition, filtres, pagination).
  Pages non couvertes (Top Anime, recherche, forums, news…) : topbar + restyle de base.

## Installer en dev
1. `chrome://extensions` → Mode développeur ON
2. Charger l'extension non empaquetée → dossier `myapplelist/` (celui avec `manifest.json`)
3. Aller sur https://myanimelist.net/ → tu dois voir la topbar
4. Clic icône extension → popup pour toggle

## Fichiers
- `manifest.json` : MV3, matches `https://myanimelist.net/*`
- `content/content.js` : topbar, panneau notes, délégation des vues
- `content/*-view.js` + `content/profile.js` : une vue par type de page
- `content/css/*.css` : modules 00→92, concaténés dans `overlay.css` par `tools/build-css.mjs`
- `tools/` : parse-tests Playwright + scripts QA live

## Méthode "récupérer le visuel toi-même"
Je ne scrape pas le CSS MAL pour le cloner. Je :
1. `fetch` la structure (titres, listes, URLs) pour savoir quoi overlay
2. J'injecte notre design system (tokens, blur, radius 18px, SF/Inter)
3. Je laisse le DOM MAL intact dessous : je re-stylise et je déplace des nœuds
   existants (profil) sans les dupliquer. Les sélecteurs pointent des IDs/classes
   MAL : si MAL renomme, la mise en page se dégrade gracieusement (page native intacte).

Prochaines étapes : pages Top Anime / recherche, préférences de vue persistées
pour toutes les grilles, extraction du CSS commun aux vues « œuvres ».
