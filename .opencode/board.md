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

- [ ] **notes-remove-20261015** — ANNULÉ (revert le 15/10 : suppression non QA, panel Notes
  conservé pour cohérence topbar/FAB/popup/docs ; voir notes-ux).
  Owner: opencode. Gate: `build-css.mjs --check` OK, `node --check` OK.
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
- [x] **list-data-v1-20261015** — Couche données listes : `content/list-data.js`
  (schéma v1, cache 10 min, pagination load.json). Intégré au manifeste avant
  `profile.js`. Tests simulés `tools/test-list-data.mjs`. Validation live à
  relire (`tools/qa-list-data-live.mjs`). Owner: cursor.
- [x] **list-view-grille** — Vue animelist et mangalist (reconstruction Apple
  style Profile). Consomme `__myappleList.loadList` + `readInitial` instantané.
  Hero (bannière floue, bascule Anime/Manga, KPIs), barre de contrôles flottante
  (onglets de statuts dynamiques, recherche live, filtre type, tri avec direction,
  bascule grille/tableau), affiches 2:3 avec note, pastille statut et barre de
  progression, tableau compact, modal de détail Apple et dark mode complet.
  Owner: opencode. Script : `tools/qa-list-view.mjs`. Captures : `list-anime-*.png`, `list-manga-*.png`.
  Gate: `node --check` OK (4 scripts), `test-list-data.mjs` OK, captures relues OK.
- [x] **css-split-20261015** — `overlay.css` (3323 lignes) découpé en `content/css/`
  8 modules (00-tokens → 70-anime-detail) + `tools/build-css.mjs` qui régénère
  le bundle (manifest + QA inchangés). Supprimé : bloc mort §8 `#myapple-anime`
  (815 lignes, 2 passes dupliquées de la reconstruction abandonnée pour CSS-first)
  + `overlay.css.tmp` orphelin. Diff bundle = 9 ajouts (headers) / 0 règle modifiée.
  Owner: opencode. Gate: `build-css.mjs --check` OK, `node --check` OK (5 scripts), `test-list-data.mjs` OK.
- [x] **anime-detail-v1-20261015** — Pages anime/manga reconstruites comme profil/listes :
  `content/anime-view.js` (readAnime + hero bannière floue/affiche/badges/chips/KPIs,
  synopsis + infos FR déplacés/reconstruits, personnages + doubleurs, staff, thèmes,
  vidéo, œuvres liées avec vignettes, navigation). `70-anime-detail.css` réécrit pour
  `#myapple-anime` (grilles, dark, responsive, reduced-motion). Script rejouable :
  `tools/qa-anime-view.mjs` (FMAB + Berserk, clair/sombre). Bugs trouvés et corrigés :
  titre/synopsis manga (`[itemprop=name]`, `span[itemprop=description]`), h2 avec lien
  "More…" en tête (match `includes`), sous-tables doubleurs filtrées, compteur de votes
  dédupliqué. Owner: opencode.
  Gate: `node --check` OK, `build-css.mjs --check` OK, captures relues OK.
- [x] **anime-detail-v2-20261015** — Plan d'audit appliqué (P1+P2+QA) :
  extraction non destructive + rollback + `destroyAnimeView` (désactivation réversible
  prouvée live), boutons validés sémantiquement, hero éditorial (méta compacte, note
  dominante teintée de l'affiche, titre `clamp()`, voile cinématographique, sommaire
  sticky), infos/typo responsive (1100/980/640), fix bouton primaire en dark.
  QA v2 : Bebop + FMAB + Berserk, mobile 390, 38 assertions TOUT-VERT (dont guest
  sans faux boutons, 0 erreur JS). Owner: opencode.
- [x] **anime-fiche-v3-20261015** — 2e passe audit (lisibilité/largeur) :
  P0 : fiche déjà à 1200px (cible 1160-1240, +1240px ≥1600) — les 820px venaient de
  la colonne, pas de la fiche. P1 : titre `clamp(34→48)`, hero réordonné (méta, titre,
  studio, statut+genres, note, stats, actions), note en encre/blanc + étoile accent,
  infos filtrées par allowlist (stats/Chips/inconnus exclus, parasites impossibles),
  tuile vidéo 16/9 (fini le rectangle blanc en dark). P2 : nav « Explorer sur MAL » FR,
  sommaire actif (IntersectionObserver), responsive 1100/980/640 + gouttières mobiles
  (258→362px via viewport device-width réversible + padding 10-base), synopsis 1.75/75ch.
  QA : 56 assertions TOUT-VERT (Bebop/FMAB/Berserk, mobile 390, guest, disable+viewport).
  Owner: opencode.
- [ ] **touch-menus** — Dropdowns au tap (mobile) en plus du hover. Scope: `content/content.js` + CSS.
- [ ] **jikan-panel** — Top airing via API Jikan (ex-panneau Notes supprimé : re-scoper l'affichage). Scope: nouveau module, voir README.
- [ ] **memory-review** — Relire/promouvoir les 4 mémoires `team` (statut `unreviewed`).

## Mémoire

- Vault: `ecc memory search "<sujet>"` avant d'écrire. Scopes actifs: project (local), team (versionné).
- IDs 2026-10-14 : `mem_20261014_7e85178c26f04bd6a4e0` (header), `mem_20261014_ff55564f982140efa002` (avatar),
  `mem_20261014_530be8ea752a4058a419` (ads), `mem_20261014_4a1323de67864d0fbf9c` (tooling).
