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

## Merged (2026-10-14)

- [x] **panel-visual** — Vérifié en local (Playwright + profil loggé `itaminashi`) :
  pastille = vraie photo CDN (pas logo), bandeau "My Panel" sous la pilule,
  stats lisibles clair/sombre. Captures : `%TEMP%/opencode/shots/logged-home-*.png`.
- [x] **profile-refonte** — Vérifié en local : hero (avatar 96 + nom + pastille
  En ligne + meta triée + pills), bio « À propos », stats, updates FR latérales,
  Navigation (liens + compteurs). Ancien conteneur masqué. Fix au passage :
  h2 du profil perso forcés `--apl-ink` (MAL les peint en blanc).
  Captures : `%TEMP%/opencode/shots/logged-profile-*.png`.

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
  Owner: opencode. Gate: `node --check` OK, captures relues OK.
- [x] **qa-visual-20261014** — Captures locales via Playwright (vrais content.js+CSS
  dans le vrai DOM MAL) : accueil clair/sombre, panel + Échap, profil clair/sombre,
  burger 820px. Trouvé et corrigé : collision d'id `myapple-profile` (vue custom
  jamais construite), fonds blancs en dark, h1 sous la pilule, nav mobile en vrac,
  stats collées. Captures : `%TEMP%/opencode/shots/`.
  Owner: opencode. Gate: `node --check` OK, captures relues OK.
- [x] **qa-connected-20261015** — Session loggée `itaminashi`, vrais content.js+CSS :
  trouvé et corrigé — texte MAL peint en clair illisible en mode jour (titres +
  corps + liens `#abc4ed` fantômes → encre/accent AA), carte Navigation sortie
  du hero (étirrement + vide), footer `.btn-settings` (fond bouton sombre).
  Script rejouable : `tools/qa-final-logged.mjs`. Captures :
  `%TEMP%/opencode/shots/final-logged-*.png` + `chip-settings.png`.
  Owner: opencode. Gate: `node --check` OK, captures relues OK.
- [x] **profile-refonte-20261015** — Le bon de l'audit profil : fini le déplacement
  de nœuds MAL, `content/profile.js` extrait (readProfile) et reconstruit —
  hero bannière floue + h1 + KPIs (1 643 / 150,3 j / 6,67 / 17 %), stats FR avec
  barrettes, favoris en grille d'affiches (36), timeline d'activité, Navigation
  sans doublons, date FR. Bugs audit corrigés : débordement, carte-dans-carte,
  h1 manquant. Script : `tools/qa-refonte.mjs`. Captures : `refonte-profile-*.png`.
  Owner: opencode. Gate: `node --check` OK (content.js + profile.js), captures relues OK.
- [ ] **touch-menus** — Dropdowns au tap (mobile) en plus du hover. Scope: `content/content.js` + CSS.
- [ ] **jikan-panel** — Top airing via API Jikan dans le panneau. Scope: nouveau module, voir README.
- [ ] **memory-review** — Relire/promouvoir les 4 mémoires `team` (statut `unreviewed`).

## Mémoire

- Vault: `ecc memory search "<sujet>"` avant d'écrire. Scopes actifs: project (local), team (versionné).
- IDs 2026-10-14 : `mem_20261014_7e85178c26f04bd6a4e0` (header), `mem_20261014_ff55564f982140efa002` (avatar),
  `mem_20261014_530be8ea752a4058a419` (ads), `mem_20261014_4a1323de67864d0fbf9c` (tooling).
