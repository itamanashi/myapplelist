# Design Document

## Overview

Vue "people" pour les pages `/people/<id>/<nom>` : un module JS auto-gardé
(`content/people-view.js`, gabarit season-view.js) qui parse le DOM MAL
(`readPeople()` gabarit readAnime()), construit une page Apple générée
(`div#myapple-people`) réutilisant la famille de composants des vues existantes
(apl-hero, apl-kpi, apl-card, apl-infos), plus un module CSS `90-people.css`
 branché dans le tableau MODULES de tools/build-css.mjs. Le dispatch
suit le pattern établi : appel conditionnel dans content.js + auto-garde locale,
pas de nouvelle centrale de routage.

## Steering Document Alignment

### Technical Standards (tech.md)
Fichier de steering absent ; AGENTS.md fait office de vérité :
- conteneurs racine MAL jamais masqués ; chrome MAL déjà masqué par 10-base.css.
- vue 100 % lecture : pas d'écriture, pas de csrf, pas de réseau.
- nœuds natifs déplacés (pattern `moveInto` + `moved[]` rollback d'anime-view.js),
  jamais dupliqués.
- tokens `--apl-*` uniquement (00-tokens.css), préfixe `html.mal-custom` ou
  classes `apl-*`/`#myapple-*` pour tout sélecteur de 90-people.css.
- animations transform/opacity + `@media (prefers-reduced-motion: reduce)`.

### Project Structure (structure.md)
- 1 fichier JS nouveau : `content/people-view.js` (IIFE, expose
  `window.__myapplePeople`), inséré dans manifest.json entre season-view.js et
  content.js.
- 1 module CSS nouveau : `content/css/90-people.css`, nom ajouté au tableau
  `MODULES` (hardcodé) de tools/build-css.mjs:14-24 ; bundle régénéré via
  `node tools/build-css.mjs` (garantie `--check`).
- 2 fichiers modifiés : `content/content.js` (1 appel de build + 1 appel de
  destroy), `manifest.json` (1 ligne content_scripts).

## Code Reuse Analysis

### Existing Components to Leverage
- **`_parsePerson` / `findH2` / `listAfterH2`** (anime-view.js:216-303) :
  pipeline de parse des lignes personne (picSurround, borderClass, spaceit_pad).
  La vue people déclare son propre parser row mais s'inspire du gabarit ; pas
  d'import d'anime-view (plugin indépendant) — code copié-adapté, documenté.
- **`fixImg()`** (list-data.js:42-47) : nettoyage CDN `/r/WxH/` des thumbs.
  Exposé sur `__myappleList` : la vue people le consomme via
  `window.__myappleList.fixImg`.
- **`el()` factory + `moveInto`/`moved[]` rollback** (anime-view.js:197-252) :
  gabarit de construction DOM + déplacement réversible des nœuds natifs.
- **Classes CSS complémentaires** (`apl-favgrid`/`apl-favgrid-people`,
  40-profile.css:332) : gabarits de grille thumb+nom dont la déclaration peut
  être réutilisée dans 90-people.css (voir stratégie CSS ci-dessous).
- **Garde/idempotence/destroy** (season-view.js:~354-371) : gabarit le plus
  récent du repo (isGuard + destroy + body class + disconnect observer).

> **Stratégie d'intégration CSS (choix assumé) :** les règles génériques
> (`apl-hero`, `apl-kpi`, `apl-card`, `apl-infos`, `apl-favgrid*`) sont toutes
> SCOPEES par view ID dans 40/70 (`#myapple-profile .apl-kpi`,
> `#myapple-anime .apl-hero`) : elles ne s'appliquent PAS à `#myapple-people`.
> Choix : (a) RE-DÉCLARATION de ces règles dans 90-people.css, scoping
> `#myapple-people`, sans modifier 40/70 — garantit R3.1 ("les autres vues ne
> doivent pas être affectées") au prix d'une duplication de ~80-120 lignes de
> CSS, contenue dans le module people. L'alternative (épingler `#myapple-people`
> dans les groupes 40/70) toucherait des fichiers possédés par d'autres fils,
> hors périmètre.

### Integration Points
- **content.js:335-338** : le bloc de dispatch gagne une 5e ligne
  `window.__myapplePeople?.buildPeopleView()`.
- **content.js:298-307** (toggle enabled=false) : `destroyPeopleView`
  ajouté au rouage de désactivation (aux côtés d'anime/season).
- **manifest.json:28** : `content/people-view.js` en 7ᵉ position (avant
  content.js).
- **tools/build-css.mjs MODULES** : `"90-people.css"` ajouté après
  `"80-season.css"` (ordre 00→90 conservé). Le module 50-a11y.css étant
  positionné au milieu du tableau, 90-people.css DOIT embarquer ses propres
  règles `:focus-visible` et `@media (prefers-reduced-motion: reduce)` scoping
  la vue.

## Architecture

```mermaid
graph TD
    A[content.js boot] -->|__myapplePeople?.buildPeopleView| B[people-view.js]
    B --> C{isPeoplePath? + #myapple-people absent? + DOM ok?}
    C -->|no| Z[fallback MAL natif]
    C -->|yes| D[readPeople content]
    D --> E[person data model]
    E --> F[buildRoot + hero + apl-cols]
    F --> G[main: Bio moveInto / Voices / Staff / Published]
    F --> H[side: Informations dl + MAL nav]
    F --> I[CSS: body.myapple-people masque le natif residuel]
    A -->|enabled=false| J[destroyPeopleView]
    J --> K[rollback moved[] + remove #myapple-people + body class]
```

## Components and Interfaces

### Component 1 — content/people-view.js
- **Purpose:** vue complète people (lecture + rendu + destroy).
- **Interfaces:**
  - `isPeoplePath(path) : bool` — regex `/^\/people\/\d+/`.
  - `readPeople(content) : PersonData` — parse ; jamais throw.
  - `buildPeopleView() : void` — garde + rendu + insertion.
  - `destroyPeopleView() : void` — rollback moved[] + retrait DOM + body class.
  - exposé : `window.__myapplePeople = { readPeople, buildPeopleView, destroyPeopleView }`.
- **Gate d'activation (aligné R2.8) :** activation dès qu'UN contenu utile
  existe — `name || portrait || bioText || voices?.length || staff?.length ||
  published?.length`. Si TOUT est nul/vide, buildPeopleView renonce avant
  insertion (page MAL native).
- **KPIs (R3.2) :** valeurs dérivées des données parsées —
  `favorites` (Member Favorites), `voices.length` (rôles voix), `staff.length`
  (+ `published.length` si présent). Composant `apl-kpi` re-déclaré pour
  `#myapple-people` dans 90-people.css.
- **Dependencies:** `__myappleList.fixImg` (defensive: fallback local si absent).
- **Reuses:** gabarits `_parsePerson`, `moveInto`, `el()`, season-view (garde/destroy).

### Component 2 — content/css/90-people.css
- **Purpose:** style de la vue (tailles/espacements spécifiques + masquage
  natif résiduel) ; réutilise au maximum 40/70/10.
- **Interfaces:** aucun (CSS declaratif) ; sélecteurs scoping :
  `#myapple-people ...` pour la vue, `html.mal-custom body.myapple-people ...`
  pour le masquage du natif.
- **Reuses:** tokens 00, ressorts/motion existants.

### Component 3 — branchements (content.js + manifest.json)
- **Purpose:** câblage au cycle de vie de l'extension.
- **Interfaces:** deux lignes de code dans content.js, une ligne manifest.
- **Reuses:** pattern exact des vues existantes.

## Data Models

### PersonData
```
{
  id: int|null                       // ex 2009
  url: string|null                   // location.href
  name: string|null                  // "Watanabe, Shinichirou"
  nameJp: string|null                // "渡辺 信一郎" (alternate/Japanese)
  portrait: string|null              // cdn photo (fixImg)
  details: Array<[label, value]>     // paires .dark_text parsing
  favorites: int|null                // Member Favorites
  bioText: string|null               // texte de .people-informantion-more
  bioNode: Node|null                 // nœud natif à DÉPLACER
  voices:  Work[]|null               // null si section absente/vide
  staff:   Work[]|null
  published: Work[]|null
}
```

### Work
```
{
  img: string|null      // thumb fixImg
  title: string|null    // a.js-people-title (ou h3/a principal)
  url: string|null
  sub: string|null      // role/position : "Production Manager, Production Assistant"
  meta: string|null     // "TV, Fall 1985" (.anime-info-text) — voices: nom du chara
  score: string|null    // .score-val / .total-score (hidden)
  members: string|null  // .series-total-members / small.js-people-favorites
}
```

## Error Handling

### Error Scenarios
1. **DOM natif absente/dégradé** (page courte, not found, skin change)
   - **Handling:** readPeople retourne des champs nuls ; si le gate d'activation
     (Component 1 : aucun des contenus utiles présents) échoue, buildPeopleView
     renonce avant toute insertion.
   - **User Impact:** page MAL 100 % native (aucune vue partielle).
2. **Exception runtime dans build**
   - **Handling:** try/catch global → rollback `moved[]` (retour aux parents
     d'origine), retrait `#myapple-people`, retrait classe body, console.warn
     discret.
   - **User Impact:** page MAL native intacte ; extension ne crash pas.
3. **Section vide** ("No voice acting roles have been added...")
   - **Handling:** card correspondante absente (pas de placeholder vide).
   - **User Impact:** page épurée, aucune card fantôme.
4. **`__myappleList` chargé avant people (manifest)**
   - **Handling:** usage défensif `window.__myappleList?.fixImg ?? (u)=>u`.
   - **User Impact:** aucun.

## Testing Strategy

### Unit Testing
- `tools/test-people-parse.mjs` (gabarit tools/test-anime-parse.mjs) : fixtures
  HTML live (Watanabe + une page avec Voice Acting Roles, ex. /people/70/ pour
  un doubleur prolifique) ; teste readPeople sur : name/nameJp/portrait,
  paires details, favorites parse "15,961" → 15961, bio, 3 blocs Work[]
  (img/title/sub/meta), champs nuls sur page dégénérée.

### Integration Testing
- `node --check content/people-view.js content/content.js` ; ordre manifest
  revu (season-view < people-view < content.js).
- **Merge gate** (voir AGENTS.md "Vérifications") : people-view.js ajouté
  à la liste `node --check`, et `node tools/test-people-parse.mjs` ajouté au
  paragraphe des vérifications ; `node tools/build-css.mjs --check`
  (liste : `content/people-view.js` ajouté au `node --check`).
- Les fixtures live de test-people-parse.mjs nécessitent le contexte cookies
  du profil persistant `.chrome-profile/` (fuite exacte du gabarit
  test-anime-parse.mjs).
- Recharge extension + navigation manuelle sur 3 pages : /people/2009 (staff
  only), /people/<doubleur prolifique> (voices only), page inexistante.

### End-to-End Testing
- Vérifs manuelles : idempotence (double appel), toggle enabled→off (destroy
  propre), dark mode (tokens agnostiques), raccourci clavier topbar intact.
