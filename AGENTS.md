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
| `content/season-view.js` | Vue saisons /anime/season : readSeason() + grille filtres |
| `content/people-view.js` | Vue people /people/<id> : readPeople() + hero/KPIs/bio (nœud déplacé)/rôles voix/staff/published |
| `content/producer-view.js` | Vue producteur/studio /anime/producer & /studio : readProducer() + hero/KPIs/œuvres (grille-table)/actualités |
| `content/genre-view.js` | Vue genre /anime/genre/<id> : readGenre() + hero/KPIs/répartition/filtres/pagination |
| `content/malsync.js` | Adaptateur MAL-Sync : liens streaming et badges **déplacés**, jamais clonés |
| `content/css/*.css` | Source de vérité du style (12 modules 00→92). JAMAIS d'édition directe de `overlay.css` |
| `content/overlay.css` | Bundle GÉNÉRÉ via `node tools/build-css.mjs` (manifest + scripts QA pointent ici) |
| `popup/*` | Popup extension (état instantané, segments vue/densité, toggles) |
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
- Écritures MAL (actions rapides) : `POST /ownlist/{anime|manga}/edit.json` en JSON
  (+ `csrf_token` lu FRAIS depuis `meta[name="csrf_token"]`, jamais mis en cache).
  Jamais de retry auto sur une écriture (un retry = un +1 en double). Contrat prouvé live
  2026-10-15 (200 `null` = OK, 400 `{errors}` = refus). Après succès : `dropCacheFor(kind, user)`
  puis update optimiste ciblé (`refreshItem` + `updateCountsUI`, jamais de full re-render).
  Concurrence : les pages `load.json` qui arrivent APRÈS un +1 optimiste écrasent la
  mutation locale (race prouvée live 2026-10-15) → `updateData` DOIT réappliquer les
  entrées `dirty` et les oublier à convergence serveur.
- Préférences (`myapple_state_v1`) : `enabled, dark, panelOpen, listView(grid|table),`
  `density(normal|compact)`. Migration par fusion avec les défauts, jamais d'écrasement.
  Le popup écrit, `content.js` applique en live (`apl-compact` + `setViewMode`, sans refresh).
- Accessibilité : `:focus-visible` systématique, topbar ré-affichée au focus.
- Pas de `head`/`tail`/`sed` sous PowerShell Windows (utiliser `node -e`, `Select-Object`).
- Avant chaque save mémoire : `ecc memory search` pour éviter les doublons.

## Spec workflow (Pimzino/claude-code-spec-workflow)

- Spec-driven (Requirements → Design → Tasks → Implementation) et bug-fix (Report → Analyze → Fix → Verify).
- Slash commands opencode : `.opencode/command/spec-*.md`, `bug-*.md` (adaptées depuis `.claude/commands/`).
- Subagents opencode : `.opencode/agent/spec-task-executor.md` (+ 3 validators).
- Docs générées : `.claude/specs/<feature>/` (requirements/design/tasks), `.claude/steering/`, `.claude/templates/`.
- CLI : `npx --yes @pimzino/claude-code-spec-workflow` (`setup`, `generate-task-commands`, `get-spec-context <spec>`, `get-tasks <spec>`).
- Usage : `/spec-create <feature-name> "<description>"` puis `/spec-execute <task-id>` ; bugs : `/bug-create` → `/bug-verify`.
- Le dashboard live utilise l'ancien package : `npx -p @pimzino/claude-code-spec-workflow claude-spec-dashboard` (optionnel).

## Vérifications (merge gate)

- `node tools/build-css.mjs --check` OK après tout changement CSS (régénérer avec `node tools/build-css.mjs`)
- `node --check content/content.js content/profile.js content/list-data.js content/list-view.js content/anime-view.js content/season-view.js content/people-view.js content/producer-view.js content/genre-view.js content/malsync.js` OK
- `node tools/test-list-data.mjs` OK après tout changement de schéma liste
- `node tools/test-anime-parse.mjs` + `node tools/test-people-parse.mjs` + `node tools/test-season-parse.mjs` + `node tools/test-producer-parse.mjs` + `node tools/test-genre-parse.mjs` OK après changement d'un parseur (playwright)
- Recharger l'extension (`chrome://extensions` → ⟳) + refresh MAL
- Mémoire Vault à jour si découverte réutilisable (`ecc memory save`)

## Mémoire partagée

- Contexte réutilisable : Vault ECC (`ecc memory search`, scopes `project`+`team`).
- Suivi d'exécution : `.opencode/board.md` (cartes Kanban).
- Profil Chrome persistant : `.chrome-profile/` (cookies MAL, JAMAIS commité).
