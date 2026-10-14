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
  La page profil réorganise les nœuds MAL existants par déplacement (pas de copie).

## Installer en dev
1. `chrome://extensions` → Mode développeur ON
2. Charger l'extension non empaquetée → dossier `myapplelist/` (celui avec `manifest.json`)
3. Aller sur https://myanimelist.net/ → tu dois voir la topbar
4. Clic icône extension → popup pour toggle

## Fichiers
- `manifest.json` : MV3, matches `https://myanimelist.net/*`
- `content/content.js` + `content/overlay.css` : overlay
- `popup/` : contrôle
- `background/service-worker.js` : init state

## Méthode "récupérer le visuel toi-même"
Je ne scrape pas le CSS MAL pour le cloner. Je :
1. `fetch` la structure (titres, listes, URLs) pour savoir quoi overlay
2. J'injecte notre design system (tokens, blur, radius 18px, SF/Inter)
3. Je laisse le DOM MAL intact dessous : je re-stylise et je déplace des nœuds
   existants (profil) sans les dupliquer. Les sélecteurs pointent des IDs/classes
   MAL : si MAL renomme, la mise en page se dégrade gracieusement (page native intacte).

Prochaine étape : brancher vraie data via Jikan API (https://api.jikan.moe/v4) dans le panneau pour afficher top airing sans scraper.
