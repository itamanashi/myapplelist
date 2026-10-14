# AGENTS.md — MyAppleList (extension Chrome MV3)

Overlay visuel Apple par-dessus myanimelist.net. On ne touche JAMAIS aux
conteneurs racine MAL (`#myanimelist`, `.wrapper`, `#contentWrapper`, `#content` :
jamais masqués). En revanche on re-stylise le CSS MAL, on masque son chrome
(header/nav/footer/pubs) et la vue profil DÉPLACE des nœuds MAL existants
(avatar, statuts, stats, updates) dans notre mise en page — sans les dupliquer.

## Fichiers (un owner par fichier en parallèle)

| Fichier | Rôle |
|---|---|
| `content/content.js` | Topbar, panel Notes, reveal images, délégation profil |
| `content/profile.js` | Vue profil : readProfile() + hero/KPIs/favoris/timeline |
| `content/overlay.css` | Tout le style (tokens `--apl-*`, topbar, grille, dark) |
| `popup/*` | Popup extension (toggle actif/dark) |
| `background/service-worker.js` | Init state |
| `tools/` | Outillage dev/QA (profils Chrome persistants) |

## Règles

- Chercher le profil UNIQUEMENT dans `#headerSmall` / `#header-menu`
  (jamais `document` : sinon on attrape un auteur des news).
- Contenu MAL : ne jamais masquer `#myanimelist`, `.wrapper`, `#contentWrapper`, `#content`.
- Animations : que `transform` + `opacity` (compositor), `@media (prefers-reduced-motion: reduce)` obligatoire.
- Spécificité CSS : préfixer par `html.mal-custom` (+ `body div#myanimelist` si MAL résiste).
- Accessibilité : `:focus-visible` systématique, panneau `inert` + `Échap` + focus géré, topbar ré-affichée au focus.
- Pas de `head`/`tail`/`sed` sous PowerShell Windows (utiliser `node -e`, `Select-Object`).
- Avant chaque save mémoire : `ecc memory search` pour éviter les doublons.

## Vérifications (merge gate)

- `node --check content/content.js` OK
- Recharger l'extension (`chrome://extensions` → ⟳) + refresh MAL
- Mémoire Vault à jour si découverte réutilisable (`ecc memory save`)

## Mémoire partagée

- Contexte réutilisable : Vault ECC (`ecc memory search`, scopes `project`+`team`).
- Suivi d'exécution : `.opencode/board.md` (cartes Kanban).
- Profil Chrome persistant : `.chrome-profile/` (cookies MAL, JAMAIS commité).
