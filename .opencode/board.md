# Board — MyAppleList (agent Kanban)

Règles : 1 owner par carte, 1 writer par fichier, merge gate = `node --check` + reload + refresh.

## Merged (2026-10-14)

- [x] **topbar-mal-menu** — Menu Anime/Manga/Community/Industry/Watch/Read/Help + dropdowns hover.
  Owner: opencode. Files: `content/content.js`, `content/overlay.css`. Gate: passé.
- [x] **profile-pill** — Pseudo + photo (`detectProfile` header-only, `enhanceAvatar` data-src, cache v3).
  Owner: opencode. Gate: passé (vérifié vs compte itaminashi réel).
- [x] **panel-title** — `h1.h1` 20px + bandeau plein-bleed, collapse slots `.ad-sas`.
  Owner: opencode. Gate: syntaxe OK, à valider visuellement.
- [x] **dev-profile** — `tools/dev-chrome.ps1` + `tools/qa-mal.mjs`, `.chrome-profile/` gitignoré.
  Owner: opencode. Gate: passé (55 cookies, consent OK, login OK).

## Review (à valider visuellement par l'opérateur)

- [ ] **panel-visual** — Vérifier sur `panel.php` connecté : pastille = vraie photo (pas logo),
  "My Panel" en bandeau large, "My Statistics" remonté (pas de trou).
  Merge gate: screenshot opérateur OK.
- [ ] **profile-refonte** — Vérifier sur `/profile/itaminashi` : hero (avatar 96 + nom + pastille
  En ligne + meta + pills), bio, stats, updates latérales FR, favoris, navigation.
  Ancien conteneur masqué, bandeau h1 masqué. Mémoires : `mem_20261014_7df6c2...`, `mem_20261014_15e1136...`.
  Merge gate: screenshot opérateur OK.

## Backlog (prochaines cartes)

- [ ] **notes-ux** — Panel Notes : retouche UX (état vide, autosave ?). Scope: `content/content.js` (panel), CSS panel.
- [x] **responsive-bar** — Topbar repliée en burger ☰ sous 980px, menus en panneau
  vertical, recherche à largeur fixe (plus de décalage au focus).
  Owner: opencode. Gate: syntaxe OK, à valider visuellement.
- [x] **audit-fixes-20261014** — Icônes 1×1 remplacées, dark `false` partout +
  `onInstalled` non destructif, fond `--apl-bg`, pile police Windows
  (system-ui/Segoe UI), dark complet (bordures/ombres/boutons/FAB), `:focus-visible`,
  panneau `inert` + Échap + focus géré, topbar en `transform`, aspect 16/9 épisodes,
  badge En ligne AA, popup suit le thème + switches iOS + apply immédiat.
  Owner: opencode. Gate: `node --check` OK, à valider visuellement.
- [ ] **touch-menus** — Dropdowns au tap (mobile) en plus du hover. Scope: `content/content.js` + CSS.
- [ ] **jikan-panel** — Top airing via API Jikan dans le panneau. Scope: nouveau module, voir README.
- [ ] **memory-review** — Relire/promouvoir les 4 mémoires `team` (statut `unreviewed`).

## Mémoire

- Vault: `ecc memory search "<sujet>"` avant d'écrire. Scopes actifs: project (local), team (versionné).
- IDs 2026-10-14 : `mem_20261014_7e85178c26f04bd6a4e0` (header), `mem_20261014_ff55564f982140efa002` (avatar),
  `mem_20261014_530be8ea752a4058a419` (ads), `mem_20261014_4a1323de67864d0fbf9c` (tooling).
