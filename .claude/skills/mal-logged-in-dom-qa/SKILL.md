---
name: mal-logged-in-dom-qa
description: "Use when parsing or QA-testing MyAnimeList DOM that reflects the user's own list (list statuses, in-list badges, edit buttons) — a cookie-less fetch shows server-default DOM where every row is `notinmylist`."
metadata:
  origin: auto-extracted
---

# MAL Session-DOM : les statuts de liste sont rendus côté serveur

**Extracted:** 2026-10-17
**Context:** myapplelist (extension Chrome MV3 sur myanimelist.net) — parsing
des pages people/anime avec statuts « PTW / Watching », mais valable pour
toute sélection de DOM MAL dépendant de la session.

## Problem

Un `fetch()` (ou un navigateur headless sans cookies) récupère le HTML MAL
**sans session** : chaque ligne porte `js-anime-watch-status-people-va-notinmylist`
et un `a.addtolist` « add ». Les statuts réels (« PTW », « Watching »…)
n'arrivent PAS par injection JS — ils sont rendus par le serveur selon les
cookies. Tester un parseur de statut sur du HTML fetché échoue (ou pire,
valide à tort la branche exception).

## Solution

Les 3 signaux absents du DOM sans session, à extraire dans l'ordre :

1. `a.Lightbox_AddEdit.button_edit` : classe du mot-clé statut + attribut
   `data-status` (1 = watching/reading, 2 = completed, 3 = onhold,
   4 = dropped, 6 = plantowatch/plantoread). Hors liste : `a.addtolist`
   avec texte « add ».
2. Classe de la ligne `tr.js-anime-watch-status-people-<section>-<status>`
   (section `va|staff|...`, statut parmi `watching|reading|plantowatch|
   plantoread|completed|onhold|dropped|inmylist|notinmylist`).
3. `inmylist` = dans la liste mais statut générique → traiter en pilule
   neutre (« Ma liste »), jamais mapper vers un statut inventé.

QA workflow :

1. Profil Chrome persistant avec cookies MAL : `.chrome-profile/`
   (jamais commité, voir AGENTS.md).
2. Playwright :
   `chromium.launchPersistentContext(".chrome-profile", { channel: "chrome", headless: true })`
   puis `browser.newPage()` — PAS de `newContext()` (indisponible en mode
   persistent, sinon `TypeError`).
3. Avant d'écrire le sélecteur de statut, vérifier le `className` réel d'une
   ligne dont l'œuvre est dans la liste utilisateur.

## When to Use

- Tout affichage de statut dans une vue de l'extension (cartes people,
  listes, rapid actions).
- Un test de parse doit refléter l'état « connecté » du DOM.
- Debug « pourquoi mon statut ne sort jamais » : suspect n°1 = HTML fetché
  sans cookies ; suspect n°2 = mauvaise priorité statut (classe ligne
  générique `inmylist` écrasée par `data-status` du lien édition).
