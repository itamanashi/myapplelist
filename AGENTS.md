# AGENTS.md — MyAppleList (extension Chrome MV3)

Overlay visuel Apple par-dessus myanimelist.net. On ne touche JAMAIS aux
conteneurs racine MAL (`#myanimelist`, `.wrapper`, `#contentWrapper`, `#content` :
jamais masqués). En revanche on re-stylise le CSS MAL, on masque son chrome
(header/nav/footer/pubs) et la vue profil DÉPLACE des nœuds MAL existants
(avatar, statuts, stats, updates) dans notre mise en page — sans les dupliquer.

## Fichiers (un owner par fichier en parallèle)

| Fichier | Rôle |
|---|---|
| `content/content.js` | Topbar, reveal images, délégation vues |
| `content/list-data.js` | Couche données listes (normalize + cache). Aucun rendu. |
| `content/list-view.js` | Vue listes : animelist & mangalist (hero, KPIs, grille/table, modal) |
| `content/profile.js` | Vue profil : readProfile() + hero/KPIs/favoris/timeline |
| `content/anime-view.js` | Vue detail : readAnime() + hero/KPIs/infos/personnages/staff/liés (anime & manga) |
| `content/css/*.css` | Source de vérité du style (8 modules 00→70). JAMAIS d'édition directe de `overlay.css` |
| `content/overlay.css` | Bundle GÉNÉRÉ via `node tools/build-css.mjs` (manifest + scripts QA pointent ici) |
| `popup/*` | Popup extension (toggle actif/dark) |
| `background/service-worker.js` | Init state |
| `tools/` | Outillage dev/QA (profils Chrome persistants) |

## Règles

- Chercher le profil UNIQUEMENT dans `#headerSmall` / `#header-menu`
  (jamais `document` : sinon on attrape un auteur des news). Sur les pages listes, `.list-menu-float a.profile`.
- Contenu MAL : ne jamais masquer `#myanimelist`, `.wrapper`, `#contentWrapper`, `#content`.
- Animations : que `transform` + `opacity` (compositor), `@media (prefers-reduced-motion: reduce)` obligatoire.
- Spécificité CSS : préfixer par `html.mal-custom` (+ `body div#myanimelist` si MAL résiste).
  Interdit : sélecteurs globaux non préfixés (`body`, `.table`, `.st-1` nu, `div`, `img`).
  Seules exceptions : classes `apl-*` / `#myapple-*` créées par l'extension (jamais présentes dans le DOM MAL),
  et `:root` pour les `--apl-*`. Tout `.st-N` doit être employé qualifié
  (ex. `.apl-status-dot.st-1`), jamais nu.
- Tokens : `content/css/00-tokens.css` est le seul endroit où créer `--apl-*`
  (couleurs, statuts `--apl-st-*`, rayons, ombres, ressorts). Les vues consomment les tokens,
  jamais de valeur hex en dur pour un statut.
- DOM dynamique MAL (listes en AJAX, lazyload) : tout `MutationObserver` DOIT être
  debouncé (rAF ou 150 ms) et ciblé (`childList` + `subtree` sur le conteneur le plus petit
  possible, jamais de travail layout-forçant dans le callback). Déconnecter quand la vue est détruite.
- Accessibilité : `:focus-visible` systématique, topbar ré-affichée au focus.
- Pas de `head`/`tail`/`sed` sous PowerShell Windows (utiliser `node -e`, `Select-Object`).
- Avant chaque save mémoire : `ecc memory search` pour éviter les doublons.

## Vérifications (merge gate)

- `node tools/build-css.mjs --check` OK après tout changement CSS (régénérer avec `node tools/build-css.mjs`)
- `node --check content/content.js content/profile.js content/list-data.js content/list-view.js` OK
- `node tools/test-list-data.mjs` OK après tout changement de schéma liste
- Recharger l'extension (`chrome://extensions` → ⟳) + refresh MAL
- Mémoire Vault à jour si découverte réutilisable (`ecc memory save`)

## Mémoire partagée

- Contexte réutilisable : Vault ECC (`ecc memory search`, scopes `project`+`team`).
- Suivi d'exécution : `.opencode/board.md` (cartes Kanban).
- Profil Chrome persistant : `.chrome-profile/` (cookies MAL, JAMAIS commité).
