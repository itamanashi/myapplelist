# Requirements Document

## Introduction

Créer une vue "people" custom (Apple-style) pour les pages détail personnes de MyAnimeList :
`https://myanimelist.net/people/<id>/<nom>` (ex. `/people/2009/Shinichirou_Watanabe`).
Comme les vues profile (40-profile.css) et anime/manga détail (70-anime-detail.css), la vue
construit une page générée (`div#myapple-people`) en lisant le DOM MAL existant : aucune donnée
n'est dupliquée, les nœuds natifs utiles sont déplacés dans notre mise en page, le chrome MAL
(header/nav/footer/pubs) reste masqué par la base (10-base.css). Objectif : arriver sur la
fiche d'un réalisateur/doubleur et voir son portrait, ses chiffres et ses œuvres dans une mise
en page identique au reste de l'extension.

## Alignment with Product Vision

product.md n'existe pas encore (steering vierge) ; la référence produit est AGENTS.md
(« Overlay visuel Apple par-dessus myanimelist.net »). Cette feature complète la couverture
des pages d'un utilisateur type : liste → profil → détail anime/manga → saison → **people**,
avec les mêmes tokens, le même style et la même famille de composants (apl-hero, apl-kpi,
apl-card). Elle supprime la seule grande famille de pages encore 100 % en style MAL brut.

## Requirements

### Requirement 1 — Détection de route et injection de la vue

**User Story:** As a MAL user, I want people detail pages to look like the other redesigned
pages (anime/profile/season), so that the extension feels consistent everywhere.

#### Acceptance Criteria

1. WHEN l'URL matche `/^\/people\/\d+/` THEN l'extension SHALL construire `div#myapple-people`
   et l'insérer en tête du contenu MAL natif (pattern `content.insertBefore(view,
   content.firstChild)` d'anime-view.js).
2. IF `#myapple-people` existe déjà THEN la vue SHALL s'idempoter (return immédiat, pas de
   double insertion).
3. WHEN l'URL matche MAIS que la structure attendue est absente ou dégradée THEN l'extension
   SHALL laisser la page MAL native intacte (fallback silencieux, même en URL valide).
4. WHEN la vue est construite THEN body SHALL recevoir la classe `myapple-people` (ciblage CSS).
5. WHEN le toggle `enabled` passe à false THEN la vue SHALL être détruite via
   `window.__myapplePeople.destroyPeopleView()`, branchée dans content.js (pattern
   destroyAnimeView/destroySeasonView).
6. WHEN le builder est ajouté THEN manifest.json SHALL charger `content/people-view.js` AVANT
   `content/content.js` (position naturelle : après season-view.js).

### Requirement 2 — Lecture du DOM MAL (readPeople)

**User Story:** As a maintainer, I want a readPeople(content) parser, so that rendering stays
decoupled from parsing (pattern readAnime/readProfile).

#### Acceptance Criteria

1. WHEN la page contient le portrait THEN readPeople SHALL lire l'image de la colonne gauche
   et la nettoyer via `fixImg()` de list-data.js.
2. WHEN la page contient le nom THEN readPeople SHALL lire `h1.title-name` (nom principal +
   nom japonais/`small`) sans `<br>` ni texte parasite.
3. WHEN la zone détails existe (lignes `spaceit_pad`/`dark_text` : Birthday, Birthplace,
   Website, Member Favorites...) THEN readPeople SHALL les retourner en paires label/valeur.
4. IF "Member Favorites" est parseable THEN readPeople SHALL exposer ce nombre en entier.
5. WHEN la bio textuelle existe THEN readPeople SHALL retourner le texte ET préserver le nœud
   natif pour un déplacement (pas de duplication).
6. WHEN les blocs "Voice Acting Roles", "Anime Staff Positions" et "Published Works" existent
   THEN readPeople SHALL retourner les cartes parsées (image, nom, lien, sous-titre/rôle,
   numéro de section), en réutilisant le parser `_parsePerson` d'anime-view.js (pattern
   `findH2` + `listAfterH2`).
7. WHEN la structure attendue est absente THEN readPeople SHALL retourner un objet avec des
   champs nuls (pas de throw).
8. IF readPeople retourne un objet entièrement vide THEN la vue SHALL ne pas s'activer.

### Requirement 3 — Rendu Apple de la vue

**User Story:** As a MAL user, I want un hero Apple + des KPIs + les œuvres en cards,
so that je consomme l'information sans la moindre liste MAL brute.

#### Acceptance Criteria

1. WHEN la vue est rendue THEN le hero SHALL afficher portrait + nom (+ nom japonais) +
   metaline (birthday / birthplace / website), en réutilisant les classes apl-hero /
   apl-hero-main (les autres vues ne doivent pas être affectées).
2. WHEN des valeurs KPI existent (Member Favorites, nombre de rôles voix, œuvre staff) THEN
   la vue SHALL afficher des `apl-kpi` (composants existants).
3. WHEN la colonne principale existe THEN elle SHALL contenir : card Bio (nœud natif déplacé),
   card Voice Acting Roles (grille de thumb+nom réutilisant les classes `apl-favgrid-people`,
   ou variantes dérivées documentées dans design.md), card Anime Staff Positions, card
   Published Works ; toute card sans données SHALL être absente (pas d'empty placeholder).
4. WHEN la colonne latérale existe THEN elle SHALL contenir : Informations en `dl.apl-infos`
   (paires label/valeur parsées) + navigation liée (lien vers les œuvres MAL, pattern nav
   anime-view) ; tout nœud natif utile est déplacé (pas dupliqué, rollback dispo).
5. WHEN aucun nœud natif ne se prête au déplacement THEN la vue SHALL générer le contenu à
   partir des données parsées.

### Requirement 4 — Intégration et outillage

**User Story:** As a maintainer, I want une seule vue (1 module JS + 1 module CSS), so that
le coût de maintenance reste proche des vues existantes.

#### Acceptance Criteria

1. WHEN le code est écrit THEN content/people-view.js SHALL exposer
   `window.__myapplePeople = { readPeople, buildPeopleView, destroyPeopleView }`.
2. WHEN content.js est modifié THEN un seul appel `window.__myapplePeople?.buildPeopleView()`
   SHALL être ajouté au bloc de dispatch (pas de nouvelle détection centralisée).
3. WHEN le CSS est écrit THEN un seul module `content/css/90-people.css` SHALL être ajouté au
   tableau MODULES de tools/build-css.mjs (ordre 00→90).
4. WHEN le module CSS est stylisé THEN toutes les règles SHALL consommer les tokens
   00-tokens.css (aucune valeur hex/en dur pour couleurs/statuts) et être préfixées par
   `html.mal-custom`, ou être des classes `apl-*`/`#myapple-*` créées par l'extension.
   Génération validée via `node tools/build-css.mjs` puis `--check`.
5. WHEN l'utilisateur active le dark mode THEN 90-people.css SHALL consommer uniquement des
   tokens dark-agnostiques (pas d'overrides dark spécifiques à la vue).
6. WHEN la vue est intégrée THEN manifest.json SHALL lister `content/people-view.js` dans la
   chaîne content_scripts conformément à R1.6 (après season-view.js, avant content.js).

## Non-Functional Requirements

### Performance
- Animations : uniquement `transform` + `opacity` (compositor),   appui sur les tokens
  ressorts existants ; `@media (prefers-reduced-motion: reduce)` obligatoire dans
  90-people.css.
- La page people est statique au chargement : pas de MutationObserver par défaut. SI un
  observer s'avérait nécessaire, il SHALL être debouncé (rAF/150 ms) sur le plus petit
  conteneur et déconnecté au destroy (règle AGENTS.md).

### Security
- Vue 100 % lecture : aucune écriture MAL (pas de POST, aucun csrf_token).
- Aucune nouvelle requête réseau : parsing 100 % DOM local.
- Aucun innerHTML nourri de contenu MAL brut : factory el() + insertion de nœuds natifs
  déplacés (pattern anime-view.js).

### Reliability
- Toute exception dans buildPeopleView SHALL être catchée avec rollback : retire la vue,
  place MAL natif intact (pattern anime-view.js).
- Idempotence par garde `#myapple-people` + gardes regex sur `location.pathname`.
- destroyPeopleView SHALL retirer la classe `myapple-people` + le nœud vue.

### Usability
- `:focus-visible` systématique sur tout élément interactif (héritée de 50-a11y.css et
  complétés dans 90-people.css).
- Contraste accessible : les couleurs proviennent des tokens `--apl-*` (jamais d'hex frais).
- Mise en page responsive déjà gérée par 10-base.css ; la vue SHALL respecter le max-width
  de 1400px existant.
