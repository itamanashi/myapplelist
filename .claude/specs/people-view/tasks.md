# Implementation Plan

## Task Overview
Approche incrémentale en 3 couches à la season-view : (A) squelette du module
et parsing (`readPeople`), (B) rendu Apple (`buildPeopleView` + sections), (C)
câblage/couture (content.js, manifest.json, CSS 90-people.css, tests). Chaque
tâche est vérifiable isolément via `node --check` et navigateur.

## Steering Document Compliance
- AGENTS.md (steering de fait) : un owner par fichier ; pas de logs de secrets ;
  tokens `--apl-*` uniquement pour les couleurs/statuts ; préfixe
  `html.mal-custom` ou classes `apl-*`/`#myapple-*` ; animations
  transform/opacity ; nœuds natifs déplacés jamais dupliqués ; pas
  d'head/tail/sed sous PowerShell (node -e).
- Tools : `node tools/build-css.mjs` (+ `--check`) après tout CSS ;
  `node --check` après tout JS.

## Atomic Task Requirements
- File Scope ≤ 3 fichiers ; 15-30 min ; un seul objectif testable ; fichiers
  explicites ; agent-friendly (input/output nets).

## Tasks

- [x] 1. Squelette du module content/people-view.js
  - File: content/people-view.js (nouveau)
  - IIFE strict ; isPeoplePath() regex `/^\/people\/\d+/` ; helpers locaux
    `readPeople` (retourne PersonData nul), `buildPeopleView`,
    `destroyPeopleView` ; expose `window.__myapplePeople = {...}`.
  - Purpose: base testable + garde de route, aucune écriture DOM.
  - _Leverage: content/season-view.js (gabarit IIFE + expose)._
  - _Requirements: 1.1, 1.3_

- [x] 2. readPeople : lecture identité (nom, nom JP alternate, portrait)
  - File: content/people-view.js (suite tâche 1)
  - `h1.title-name` (strong) + nom JP/alternate depuis les details dark_text ;
    portrait `img.lazyload[data-src]` de la colonne gauche ; nettoyage via
    `__myappleList?.fixImg` fallback local.
  - Purpose: identité = base du gate d'activation.
  - _Leverage: content/anime-view.js readAnime (selectors title), content/list-data.js fixImg._
  - _Requirements: 2.1, 2.2_

- [x] 3. readPeople : paires de détails + Member Favorites
  - File: content/people-view.js (suite)
  - Itération les rows `.spaceit_pad`/`> .dark_text` du bloc détails →
    `details: [[label, value]]` ; "Member Favorites: 15,961" → 15961 (int) ;
    les autres paires sont exposées pour le dl Informations.
  - Purpose: données de la colonne Informations + KPI favorites correct.
  - _Leverage: content/anime-view.js parseScoredBy (pattern parse nombre)._
  - _Requirements: 2.3, 2.4_

- [x] 4. readPeople : bio textuelle + préservation du nœud natif
  - File: content/people-view.js (suite)
  - `div.people-informantion-more.js-people-informantion-more` → bioText
    (textContent normalisé) + bioNode (référence pour moveInto) ; handle "More:"
    annexe.
  - Purpose: R2.5 move-not-duplicate.
  - _Leverage: content/anime-view.js moveInto/moved[]._
  - _Requirements: 2.5_

- [x] 5. readPeople : parser générique de zone d'œuvres (works)
  - File: content/people-view.js (suite)
  - `collectWorks(h2Label) : Work[] | null` — repère `div.normal_header` avec
    le label (Voice Acting Roles / Anime Staff Positions / Published Works),
    zone suivante jusqu'au prochain normal_header ; parser ligne :
    `.picSurround img` (fixImg), `a.js-people-title` (title/url,
    fallback premier a), small `<small>` (sub = role/positions) ; voices :
    colonne caractère… ; meta `.anime-info-text` ; score `.score-val` :
    members `.series-total-members`/`small.js-people-favorites` ; section
    absente ou "No voice acting roles..."  → null.
  - Purpose: source de données unique des 3 blocs.
  - _Leverage: content/anime-view.js findH2/listAfterH2/_parsePerson (gabarit)._
  - _Requirements: 2.6, 2.7_

- [x] 6. readPeople : orchestration des sections + gate de données
  - File: content/people-view.js (suite)
  - Assemble PersonData {id, url, name, nameJp, portrait, details,
    favorites, bioText, bioNode, voices, staff, published} ; jamais throw
    (try/catch → champs nuls).
  - Purpose: contrat PersonData complet et défensif.
  - _Leverage: content/anime-view.js readAnime (assembly)._
  - _Requirements: 2.6, 2.7, 2.8_

- [x] 7. buildPeopleView : routine + activation + insertion + body class
  - File: content/people-view.js (nouveau section + R1)
  - Garde idempotence `#myapple-people` ; gate activation (name || portrait ||
    bioText || any work non vide) ; try/catch global → rollback
    (moved[] restaurés, retrait root/discret class, console.warn) ; insertion
    `content.insertBefore(view, content.firstChild)` ; `body.classList.add("myapple-people")`.
  - Purpose: chaîne garde-build-rollback conforme NFR.
  - _Leverage: content/anime-view.js buildAnimeView (rollback), season-view garde._
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 8. Vue rendue : hero (portrait + nom + metaline) + KPIs
  - File: content/people-view.js (continue)
  - section.apl-hero/.apl-hero-main : portrait arrondi, h1 + nameJp
    (chip/alt name), metaline de birthday / birthplace / website depuis
     details ; KPIs apl-kpi (favorites / count rôles voix / count œuvres staff,
     count published si dispo).
  - Purpose: R3.1 + R3.2, sans nouveau composant (re-déclaré en CSS).
  - _Leverage: content/anime-view.js hero/KPI render (gabarit DOM)._
  - _Requirements: 3.1, 3.2_

- [x] 9. Vue rendue : colonne principale (Bio, Voix, Staff, Published)
  - File: content/people-view.js (continue)
  - div.apl-cols/.apl-col-main : card Bio (moveInto bioNode si nod, sinon
    bioText) ; card Voix (grille apl-favgrid-people rendue via Work) ; card
    Staff (liste apl-card) ; card Published ; aucune card si données
    absentes. Chaque `Work` est un l'apl-fav-thumb + nom + sub/meta pill.
  - Purpose: R3.3 cards conditionnelles.
  - _Leverage: content/profile.js renderFavorites (gabarit favgrid), anime-view personCard._
  - _Requirements: 3.3_

- [x] 10. Vue rendue : colonne Informations (side)
  - File: content/people-view.js (continue)
  - .apl-col-side : card Informations en `dl.apl-infos` (paires details) ;
    lien "Voir sur MyAnimeList" (nav gabarit anime-view) ; fallback générationnaire depuis les données si aucun nœud natif déplaçable.
  - Purpose: R3.4, R3.5.
  - _Leverage: content/anime-view.js side Informations (dl.apl-infos)._
  - _Requirements: 3.4, 3.5_

- [x] 11. destroyPeopleView : rollback propre
  - File: content/people-view.js (continue)
  - Restituer les moved[] à leurs parents d'origine ; remove `#myapple-people` ;
    retirer `myapple-people` du body ; idempotent si double-invoke.
  - Purpose: R1.5 (toggle extension), idempotence.
  - _Leverage: content/season-view.js destroy + rollback._
  - _Requirements: 1.5_

- [x] 12. Câblage content.js + manifest.json
  - File: content/content.js, manifest.json
  - Bloc dispatch (content.js:~335) : + `window.__myapplePeople?
    .buildPeopleView()` ; bloc désactivation (~298) : +destroyPeopleView ;
    manifest.json content_scripts : `content/people-view.js` entre season-view.js
    et content.js.
  - Purpose: cycle de vie conforme aux vues existantes.
  - _Leverage: content/content.js dispatch + disable chain (gabarit existant)._
  - _Requirements: 1.5, 1.6, 4.1, 4.2, 4.6_

- [x] 13. CSS : 90-people.css socle (tokens, hero, KPI, hide natif)
  - File: content/css/90-people.css (nouveau), tools/build-css.mjs (MODULES +1)
  - Header comment owner/rôle ; tokens 00 ; scoping `#myapple-people` :
    ré-DÉCLARATION gabarit apl-hero/apl-hero-main (portrait preview ronde,
    meta) + apl-kpi ; `html.mal-custom body.myapple-people` masquage de natif
    résiduel (`#content > table`, les `.normal_header` après la vue) sans
    toucher aux racines ; animations transform/opacity uniquement.
  - Purpose: socle visuel + lisibilité du build.
  - _Leverage: content/css/00-tokens.css, 70-anime-detail.css (détail hors scope néanmoins)._
  - _Requirements: 3.1, 4.3, 4.4, 4.5_

- [x] 14. CSS : cards/infos/favgrid + a11y people
  - File: content/css/90-people.css (suite tâche 13)
  - apl-card/apl-card-body scoping people ; grille apl-favgrid-people
    (thumb+nom+sub) ; dl.apl-infos ; `:focus-visible` (nav et liens) ;
    `@media (prefers-reduced-motion: reduce)` ; vérifier aucun sélecteur non
    préfixé ; `node tools/build-css.mjs` puis `--check`.
  - Purpose: fin du module CSS conforme R4.3/4.4 + NFR.
  - _Leverage: content/css/40-profile.css apl-favgrid-people (référence), 50-a11y.css (checklist)._
  - _Requirements: 3.3, 3.4, 4.3, 4.4, 4.5_

- [x] 15. Tests de parse : tools/test-people-parse.mjs
  - File: tools/test-people-parse.mjs (nouveau)
  - Fixtures live : /people/2009 (staff only) + /people/70 (voices, prolifique)
    ; asserte : name/nameJp, portrait[data-src propre], Member Favorites parse
    (15,961 → 15961), details paires ≥ 4, bio présente, staff Work[] LEN > 0
    (title/url/sub/meta), voices Work[] avec person sub, page dégénérée →
    tout nul sans throw ; runner exit non-zéro si un assert échoue ; les fixtures live nécessitent le contexte cookies du profil .chrome-profile (gabarit test-anime-parse.mjs).
  - Purpose: gate de parse pérenne.
  - _Leverage: tools/test-anime-parse.mjs (gabarit runner + fixtures)._
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

- [x] 16. Mise à jour des vérifications AGENTS.md + merge gate
  - File: AGENTS.md
  - Fichiers table : + `content/people-view.js` et `content/css/90-people.css` ;
    Vérifications : `node --check` inclus people-view ; +
    `node tools/test-people-parse.mjs` OK après tout changement de parsing
    people.
  - Purpose: maintenance durable (docs = contrat).
  - _Leverage: AGENTS.md (table Fichiers + Vérifications)._
  - _Requirements: 4.1, 4.3_
