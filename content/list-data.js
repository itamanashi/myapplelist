// Couche données des pages animelist / mangalist (phase 2). Aucun rendu ici.
// Source : table.list-table[data-items] (300 premiers) puis
//   /{kind}list/<pseudo>/load.json?offset=N&status=7  (même origine, cookies).
// Sortie : items normalisés (schéma v1, voir normalizeAnime / normalizeManga).
// Cache : chrome.storage.local, TTL 10 min, 6 entrées max (LRU).
// Exposé : window.__myappleList (utilisable depuis profile.js et les vues liste).
(() => {
"use strict";
const root = typeof window !== "undefined" ? window : globalThis;

const SCHEMA_V = 1;
const TTL_MS = 10 * 60 * 1000;
const PAUSE_MS = 250;          // entre deux load.json
const MAX_PAGES = 60;          // garde-fou : 60 x 300 = 18 000 entrées
const MAX_CACHED = 6;
const CACHE_PREFIX = "myapple_list_v1:";
const INDEX_KEY = "myapple_list_index_v1";

// Statuts MAL (le 5 n'existe pas).
const STATUT = Object.freeze({ EN_COURS: 1, TERMINE: 2, PAUSE: 3, ABANDON: 4, A_PLANIFIER: 6 });
const STATUT_FR = {
  anime: { 1: "En cours", 2: "Terminé", 3: "En pause", 4: "Abandonné", 6: "À voir" },
  manga: { 1: "En cours", 2: "Terminé", 3: "En pause", 4: "Abandonné", 6: "À lire" },
};
const statutLabel = (kind, s) => STATUT_FR[kind]?.[s] ?? "Inconnu";

// Statut de diffusion / publication (mapping MAL habituel, à confirmer sur données réelles).
const DIFFUSION = {
  anime: { 1: "en_cours", 2: "termine", 3: "a_venir" },
  manga: { 1: "en_cours", 2: "termine", 3: "a_venir", 4: "hiatus", 5: "arrete" },
};

// ---------- utilitaires ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v, d = 0) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };
const pos = (v) => { const n = num(v, 0); return n > 0 ? n : null; };
const str = (v) => (v == null || v === "" ? null : String(v));
const err = (code, message, fatal = false) => Object.assign(new Error(message), { code, fatal });

// CDN : retirer le préfixe de resize /r/<w>x<h>/ et la signature ?s=...
//   .../r/192x272/images/anime/1236/138696.webp?s=...  ->  .../images/anime/1236/138696.webp
function fixImg(u) {
  if (!u) return "";
  const s = String(u);
  const re = /\/r\/\d+x\d+\//;
  return re.test(s) ? s.replace(re, "/").split("?")[0] : s;
}

// Dates MAL "DD-MM-YY". Parties inconnues ("??" ou 00) -> null. "00-00-00" -> null.
// Pivot 2 chiffres : yy > (année courante + 2) => 19yy, sinon 20yy (68 -> 1968, 23 -> 2023).
// Limite connue : une date de 1917 est lue 2017 (le format ne permet pas de les distinguer).
function parseDMY(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}|\?{1,2})-(\d{1,2}|\?{1,2})-(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10) || null;
  const mo = parseInt(m[2], 10) || null;
  let y = parseInt(m[3], 10);
  if (!d && !mo && y === 0) return null;
  if (m[3].length === 2) y += y > (new Date().getFullYear() % 100) + 2 ? 1900 : 2000;
  return { y, m: mo, d };
}
// {y,m,d} -> "YYYY" | "YYYY-MM" | "YYYY-MM-DD" (triable en ordre lexicographique)
function isoPartial(p) {
  if (!p) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return p.m ? (p.d ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : `${p.y}-${pad(p.m)}`) : String(p.y);
}
// Timestamp MAL (secondes, ms ou ISO) -> ms epoch, ou null.
function toMs(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    return n > 0 ? Math.round(n < 1e12 ? n * 1000 : n) : null;
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
function namedList(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? { id: null, name: x } : x && x.name ? { id: x.id ?? null, name: String(x.name) } : null))
    .filter(Boolean);
}
function tagList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
// anime_season : souvent null. Accepte {year, season} ou "Fall 2023".
function seasonOf(v) {
  if (!v) return null;
  if (typeof v === "object") {
    const annee = pos(v.year), nom = str(v.season);
    return annee || nom ? { annee, nom: nom ? nom.toLowerCase() : null } : null;
  }
  const m = String(v).match(/(winter|spring|summer|fall|autumn)\s*(\d{4})/i);
  return m ? { annee: parseInt(m[2], 10), nom: m[1].toLowerCase() === "autumn" ? "fall" : m[1].toLowerCase() } : null;
}

// ---------- normalisation (schéma v1) ----------
// Champs communs. Particularités par kind :
//  - anime : majLe = updated_at (majLeSource "updated")
//  - manga : majLe = created_at (majLeSource "created", pas d'updated_at chez MAL),
//            studios = manga_magazines, id = manga_id, listRowId = champ `id` de ligne.
function normalizeAnime(r) {
  if (r.anime_id == null || !r.anime_title) return null;
  const start = parseDMY(r.anime_start_date_string);
  return {
    kind: "anime", id: r.anime_id, listRowId: null,
    titre: String(r.anime_title), titreEn: str(r.anime_title_eng),
    img: fixImg(r.anime_image_path), url: str(r.anime_url),
    statut: num(r.status), note: num(r.score),
    progression: { fait: num(r.num_watched_episodes), total: num(r.anime_num_episodes), unite: "ep", volumesFait: null, volumesTotal: null },
    type: str(r.anime_media_type_string),
    annee: start ? start.y : null,
    saison: seasonOf(r.anime_season),
    genres: namedList(r.genres), demographics: namedList(r.demographics), studios: namedList(r.anime_studios),
    tags: tagList(r.tags), notes: str(r.notes) ?? "", priorite: str(r.priority_string),
    prioriteNum: r.priority != null && r.priority !== "" ? num(r.priority, null) : null,
    debutVu: isoPartial(parseDMY(r.start_date_string)), finVu: isoPartial(parseDMY(r.finish_date_string)),
    majLe: toMs(r.updated_at) ?? toMs(r.created_at), majLeSource: "updated", createdAt: toMs(r.created_at),
    popularite: pos(r.anime_popularity), scoreMal: pos(r.anime_score_val), members: pos(r.anime_total_members),
    isRewatch: !!r.is_rewatching,
    rewatches: num(r.num_times_rewatched, 0),
    rewatchValue: num(r.rewatch_value, 0),
    airingOrPublishing: DIFFUSION.anime[r.anime_airing_status] ?? null,
  };
}
function normalizeManga(r) {
  if (r.manga_id == null || !r.manga_title) return null;
  const start = parseDMY(r.manga_start_date_string); // confirmé probe 2026-10-15
  return {
    kind: "manga", id: r.manga_id, listRowId: r.id ?? null,
    titre: String(r.manga_title), titreEn: str(r.manga_english),
    img: fixImg(r.manga_image_path), url: str(r.manga_url),
    statut: num(r.status), note: num(r.score),
    progression: {
      fait: num(r.num_read_chapters), total: num(r.manga_num_chapters), unite: "ch",
      volumesFait: num(r.num_read_volumes), volumesTotal: num(r.manga_num_volumes),
    },
    type: str(r.manga_media_type_string),
    annee: start ? start.y : null,
    saison: null,
    genres: namedList(r.genres), demographics: namedList(r.demographics), studios: namedList(r.manga_magazines),
    tags: tagList(r.tags), notes: str(r.notes) ?? "", priorite: str(r.priority_string),
    prioriteNum: r.priority != null && r.priority !== "" ? num(r.priority, null) : null,
    debutVu: isoPartial(parseDMY(r.start_date_string)), finVu: isoPartial(parseDMY(r.finish_date_string)),
    majLe: toMs(r.created_at), majLeSource: "created", createdAt: toMs(r.created_at),
    popularite: pos(r.manga_popularity), scoreMal: pos(r.manga_score_val), members: pos(r.manga_total_members),
    isRewatch: !!r.is_rereading,
    rewatches: num(r.num_times_reread ?? r.num_times_rewatched, 0),
    rewatchValue: num(r.reread_value ?? r.rewatch_value, 0),
    airingOrPublishing: DIFFUSION.manga[r.manga_publishing_status] ?? null,
  };
}
function normalizeItem(r, kind) {
  if (!r || typeof r !== "object") return null;
  return kind === "manga" ? normalizeManga(r) : normalizeAnime(r);
}

// Affichage : total inconnu (0) -> "?"   ex. "345 / ? ch · vol. 12 / ?"
function formatProgression(p) {
  const t = p.total > 0 ? p.total : "?";
  let s = `${p.fait} / ${t} ${p.unite}`;
  if (p.unite === "ch" && (p.volumesFait || p.volumesTotal)) {
    s += ` · vol. ${p.volumesFait ?? 0} / ${p.volumesTotal > 0 ? p.volumesTotal : "?"}`;
  }
  return s;
}
const progressPct = (p) => (p.total > 0 ? Math.min(100, Math.round((p.fait / p.total) * 100)) : null);

// ---------- lecture de la page courante ----------
function kindFromPath(path) {
  const m = String(path || "").match(/^\/(anime|manga)list\/([^/?#]+)/);
  return m ? { kind: m[1], user: decodeURIComponent(m[2]) } : null;
}
// Retourne { found, raw, parseError, private }.
function readInitial(doc) {
  const out = { found: false, raw: [], parseError: false, private: false };
  if (!doc) return out;
  const t = doc.querySelector?.("table.list-table");
  if (!t) {
    out.private = /made private|restricted by the owner|private by the owner/i.test(doc.body?.textContent || "");
    return out;
  }
  out.found = true;
  try {
    const raw = JSON.parse(t.getAttribute("data-items") || "[]");
    out.raw = Array.isArray(raw) ? raw : [];
  } catch { out.parseError = true; }
  return out;
}

// ---------- réseau ----------
// Réessaie sur 429 / 5xx / erreur réseau (3 essais). 401/403 -> "private" ; réponse non-tableau -> "parse".
async function getJson(url, o) {
  let last;
  for (let i = 0; i < 3; i++) {
    if (o.signal?.aborted) throw err("aborted", "annulé", true);
    try {
      const r = await o.fetchImpl(url, { credentials: "include", headers: { Accept: "application/json" }, signal: o.signal });
      if (r.status === 401 || r.status === 403) throw err("private", `HTTP ${r.status}`, true);
      if (r.status === 429 || r.status >= 500) { last = err("http", `HTTP ${r.status}`); await sleep(o.backoffMs * (i + 1) ** 2); continue; }
      if (!r.ok) throw err("http", `HTTP ${r.status}`, true);
      const j = await r.json();
      if (!Array.isArray(j)) throw err("parse", "réponse inattendue", true);
      return j;
    } catch (e) {
      if (e.fatal) throw e;
      if (e.name === "AbortError") throw err("aborted", "annulé", true);
      last = e;
      await sleep(o.backoffMs * (i + 1) ** 2);
    }
  }
  throw Object.assign(last || new Error("réseau"), { code: last?.code || "network" });
}

// ---------- cache ----------
const store = () => (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;
async function cacheGet(key) {
  const s = store(); if (!s) return null;
  try {
    const o = await s.get(CACHE_PREFIX + key);
    const v = o && o[CACHE_PREFIX + key];
    return v && v.v === SCHEMA_V && Array.isArray(v.items) ? v : null;
  } catch { return null; }
}
async function cacheSet(key, payload) {
  const s = store(); if (!s) return false;
  try {
    await s.set({ [CACHE_PREFIX + key]: { v: SCHEMA_V, ...payload } });
    const idx = ((await s.get(INDEX_KEY))[INDEX_KEY] || []).filter((e) => e.key !== key);
    idx.unshift({ key, t: Date.now() });
    const evicted = idx.splice(MAX_CACHED);
    await s.set({ [INDEX_KEY]: idx });
    if (evicted.length && s.remove) await s.remove(evicted.map((e) => CACHE_PREFIX + e.key));
    return true;
  } catch { return false; } // quota dépassé : on continue sans cache
}
async function clearCache() {
  const s = store(); if (!s || !s.remove) return;
  const idx = (await s.get(INDEX_KEY))[INDEX_KEY] || [];
  await s.remove([INDEX_KEY, ...idx.map((e) => CACHE_PREFIX + e.key)]);
}

// ---------- chargement ----------
// opts : { kind?, user?, force?, signal?, onProgress({loaded,pages}), onStale(result), ttlMs?,
//          doc?, fetch?, pauseMs?, backoffMs? }   (doc/fetch/pauseMs/backoffMs : tests)
// Retour : { kind, user, items, total, fromCache, fetchedAt, partial, error?, skipped, empty }
// Erreurs : code "private" | "parse" | "network" | "http" | "aborted" (si aucune donnée récupérée).
const inflight = new Map();
function loadList(opts = {}) {
  const ctx = (opts.kind && opts.user) ? { kind: opts.kind, user: opts.user } : kindFromPath(root.location?.pathname);
  if (!ctx) return Promise.reject(err("context", "kind/user introuvables"));
  const key = `${ctx.kind}:${ctx.user.toLowerCase()}`;
  if (!opts.force && inflight.has(key)) return inflight.get(key);
  const p = run(ctx, key, opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
async function run({ kind, user }, key, opts) {
  const o = {
    fetchImpl: opts.fetch || ((...a) => root.fetch(...a)),
    signal: opts.signal, pauseMs: opts.pauseMs ?? PAUSE_MS, backoffMs: opts.backoffMs ?? 600,
  };
  const fromCache = (c, extra) => ({ kind, user, items: c.items, total: c.items.length, fromCache: true, fetchedAt: c.fetchedAt, partial: false, skipped: 0, empty: !c.items.length, ...extra });
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== "undefined" ? document : null);
  const init = readInitial(doc);
  if (init.private && !init.raw.length) throw err("private", "liste privée");

  const domStats = doc?.querySelector?.(".list-stats")?.textContent?.replace(/\s+/g, " ").trim() || "";

  const cached = opts.force ? null : await cacheGet(key);
  let cacheValid = cached && Date.now() - cached.fetchedAt < (opts.ttlMs ?? TTL_MS);

  // Invalidation dynamique : si la page contient des éléments ou stats différentes du cache,
  // la liste a été modifiée (ex: anime supprimé ou ajouté) -> on force le rafraîchissement.
  if (cacheValid && init.found && init.raw.length > 0) {
    if (domStats && cached.stats && domStats !== cached.stats) {
      cacheValid = false;
    } else if (cached.items.length <= 300 && init.raw.length !== cached.items.length) {
      cacheValid = false;
    } else {
      const initIds = init.raw.map((r) => r.anime_id ?? r.manga_id);
      for (let i = 0; i < Math.min(initIds.length, 25); i++) {
        if (cached.items[i] && (cached.items[i].id !== initIds[i] && cached.items[i].listRowId !== initIds[i])) {
          cacheValid = false;
          break;
        }
      }
    }
  }

  if (cacheValid) return fromCache(cached);
  if (cached) opts.onStale?.(fromCache(cached, { stale: true }));

  const seen = new Set(), items = [];
  let skipped = 0, pages = 0, offset = init.raw.length, partial = false, error = null;
  const push = (rawPage) => {
    let added = 0;
    for (const r of rawPage) {
      const it = normalizeItem(r, kind);
      if (!it) { skipped++; continue; }
      const k = it.listRowId ?? it.id;
      if (seen.has(k)) continue;
      seen.add(k); items.push(it); added++;
    }
    return added;
  };
  if (init.raw.length) push(init.raw);
  opts.onProgress?.({ loaded: items.length, pages });

  try {
    for (;;) {
      if (pages >= MAX_PAGES) { partial = true; error = { code: "limit", message: `plus de ${MAX_PAGES} pages` }; break; }
      if (pages > 0 || items.length) await sleep(o.pauseMs);
      const page = await getJson(`https://myanimelist.net/${kind}list/${encodeURIComponent(user)}/load.json?offset=${offset}&status=7`, o);
      pages++;
      if (!page.length) break;
      const added = push(page);
      offset += page.length;
      opts.onProgress?.({ loaded: items.length, pages });
      if (!added) break; // page déjà vue : on évite une boucle infinie
    }
  } catch (e) {
    if (e.code === "aborted" || !items.length) throw e;
    partial = true; error = { code: e.code || "network", message: e.message };
  }

  const fetchedAt = Date.now();
  if (!partial) await cacheSet(key, { kind, user, fetchedAt, items, stats: domStats });
  return { kind, user, items, total: items.length, fromCache: false, fetchedAt, partial, ...(error ? { error } : {}), skipped, empty: !items.length };
}

// ---------- écriture : actions rapides (contrat vérifié live 2026-10-15) ----------
// Mécanisme repris du bundle MAL lui-même (updateAnimeEntry/updateMangaEntry) :
//   POST /ownlist/anime/edit.json  JSON {anime_id, status, score, num_watched_episodes, csrf_token}
//   POST /ownlist/manga/edit.json  JSON {manga_id, status, score, num_read_volumes, num_read_chapters, csrf_token}
// 200 (body `null`) = OK ; 400 = {errors:[{message}]} ; sans csrf_token = page 400.
// Le token se lit FRAIS dans <meta name="csrf_token"> à chaque écriture (jamais en cache).
// Jamais de retry auto sur écriture (un retry = un +1 en double). Aucun rendu ici.
function readCsrfToken(doc) {
  try {
    return doc?.querySelector?.('meta[name="csrf_token"]')?.content || null;
  } catch { return null; }
}
const clampScore = (v) => { const n = Math.trunc(num(v, 0)); return n < 0 ? 0 : n > 10 ? 10 : n; };

// Cible d'un +1 : { fait, statut, completed }. 6 (prévu) -> 1 (en cours) ;
// total atteint -> 2 (terminé). Total inconnu : compteur seul (6 -> 1 conservé).
function nextProgress(item) {
  const total = item.progression.total > 0 ? item.progression.total : null;
  const fait = total ? Math.min(item.progression.fait + 1, total) : item.progression.fait + 1;
  let statut = item.statut === 6 ? 1 : item.statut;
  if (total && fait >= total) statut = 2;
  return { fait, statut, completed: statut === 2 && item.statut !== 2 };
}
// +1 affichable ? Seulement s'il reste quelque chose à incrémenter.
function canQuickPlus(item) {
  const { fait, total } = item.progression;
  if (total > 0) return fait < total;
  return item.statut !== 2;
}
// N'envoie que les champs fournis (+ id et csrf) : on n'écrase jamais le reste.
// Champs étendus (éditeur intégré) : dates ISO "YYYY-MM-DD" (ou partiels),
// rewatch/reread, priorité 0-2, notes/tags. Les clés inconnues de MAL sont
// simplement ignorées côté serveur : on envoie les variantes snake_case
// reconnues par le bundle MAL (edit.json) et l'API v2 (comments/tags).
function buildUpdatePayload(kind, id, f, csrf) {
  const int0 = (v) => Math.max(0, Math.trunc(v));
  const dateStr = (v) => {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : null;
  };
  const tagsStr = (v) => Array.isArray(v) ? v.join(", ") : (v != null ? String(v) : null);
  if (kind === "manga") {
    const p = { manga_id: parseInt(id, 10), csrf_token: csrf };
    if (f.status != null) p.status = parseInt(f.status, 10);
    if (f.score != null) p.score = clampScore(f.score);
    if (f.chapters != null) p.num_read_chapters = int0(f.chapters);
    if (f.volumes != null) p.num_read_volumes = int0(f.volumes);
    if (f.isRereading != null) { p.is_rereading = f.isRereading ? 1 : 0; }
    else if (f.isRewatching != null) { p.is_rereading = f.isRewatching ? 1 : 0; }
    if (f.rewatches != null) { p.num_times_reread = int0(f.rewatches); p.num_times_rewatched = int0(f.rewatches); }
    if (f.rewatchValue != null) { p.reread_value = int0(f.rewatchValue); p.rewatch_value = int0(f.rewatchValue); }
    const sd = dateStr(f.startDate); if (sd) p.start_date = sd;
    const fd = dateStr(f.finishDate); if (fd) p.finish_date = fd;
    if (f.priority != null && f.priority !== "") p.priority = Math.max(0, Math.min(2, parseInt(f.priority, 10) || 0));
    const tg = tagsStr(f.tags); if (tg != null) p.tags = tg;
    if (f.notes != null || f.comments != null) {
      const c = f.notes ?? f.comments ?? "";
      p.notes = String(c); p.comments = String(c);
    }
    return p;
  }
  const p = { anime_id: parseInt(id, 10), csrf_token: csrf };
  if (f.status != null) p.status = parseInt(f.status, 10);
  if (f.score != null) p.score = clampScore(f.score);
  if (f.episodes != null) p.num_watched_episodes = int0(f.episodes);
  if (f.isRewatching != null) { p.is_rewatching = f.isRewatching ? 1 : 0; }
  else if (f.isRereading != null) { p.is_rewatching = f.isRereading ? 1 : 0; }
  if (f.rewatches != null) p.num_times_rewatched = int0(f.rewatches);
  if (f.rewatchValue != null) p.rewatch_value = int0(f.rewatchValue);
  const sd = dateStr(f.startDate); if (sd) p.start_date = sd;
  const fd = dateStr(f.finishDate); if (fd) p.finish_date = fd;
  if (f.priority != null && f.priority !== "") p.priority = Math.max(0, Math.min(2, parseInt(f.priority, 10) || 0));
  const tg = tagsStr(f.tags); if (tg != null) p.tags = tg;
  if (f.notes != null || f.comments != null) {
    const c = f.notes ?? f.comments ?? "";
    p.notes = String(c); p.comments = String(c);
  }
  return p;
}

// opts : { kind, id, fields:{status?,score?,episodes?,chapters?,volumes?,startDate?,finishDate?,
//          isRewatching?,isRereading?,rewatches?,rewatchValue?,priority?,notes?,comments?,tags?},
//          doc?, fetch?, signal?, timeoutMs? }  (doc/fetch : tests)
// Succès -> { ok:true, data }. Échec -> throw code "csrf"|"auth"|"mal"|"http"|"network"|"aborted".
async function updateEntry({ kind, id, fields = {} }, opts = {}) {
  if (kind !== "anime" && kind !== "manga") throw err("context", "kind inconnu", true);
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== "undefined" ? document : null);
  const csrf = readCsrfToken(doc);
  if (!csrf) throw err("csrf", "jeton CSRF introuvable (recharge la page)", true);
  const fetchImpl = opts.fetch || ((...a) => root.fetch(...a));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener?.("abort", onAbort);
  try {
    const r = await fetchImpl(`https://myanimelist.net/ownlist/${kind}/edit.json`, {
      method: "POST",
      credentials: "include",
      signal: opts.signal ?? ctrl.signal,
      headers: { "Content-Type": "application/json; charset=UTF-8", Accept: "application/json" },
      body: JSON.stringify(buildUpdatePayload(kind, id, fields, csrf)),
    });
    if (r.status === 401 || r.status === 403) throw err("auth", "session expirée, reconnecte-toi", true);
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok) {
      const msg = data?.errors?.[0]?.message || `HTTP ${r.status}`;
      throw err(r.status === 400 ? "mal" : "http", msg, true);
    }
    return { ok: true, data };
  } catch (e) {
    if (e?.name === "AbortError") throw err("aborted", "délai dépassé", true);
    throw e?.code ? e : err("network", e?.message || "réseau", true);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener?.("abort", onAbort);
  }
}

// Suppression d'entrée (contrat web MAL : POST /ownlist/{kind}/{id}/delete,
// utilisé par les userscripts de purge ; edit.json = écriture, delete = retrait).
// Envoie le csrf_token en JSON (cohérent avec updateEntry) ; MAL l'ignore s'il
// n'en a pas besoin. 200/204/302 = OK. 401/403 -> "auth". 404 -> "mal" (déjà absent).
// Jamais de retry auto (comme les écritures). Aucun rendu ici.
async function deleteEntry({ kind, id }, opts = {}) {
  if (kind !== "anime" && kind !== "manga") throw err("context", "kind inconnu", true);
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== "undefined" ? document : null);
  const csrf = readCsrfToken(doc);
  if (!csrf) throw err("csrf", "jeton CSRF introuvable (recharge la page)", true);
  const fetchImpl = opts.fetch || ((...a) => root.fetch(...a));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener?.("abort", onAbort);
  try {
    const idKey = kind === "manga" ? "manga_id" : "anime_id";
    const r = await fetchImpl(`https://myanimelist.net/ownlist/${kind}/${parseInt(id, 10)}/delete`, {
      method: "POST",
      credentials: "include",
      signal: opts.signal ?? ctrl.signal,
      headers: { "Content-Type": "application/json; charset=UTF-8", Accept: "application/json" },
      body: JSON.stringify({ [idKey]: parseInt(id, 10), csrf_token: csrf }),
    });
    if (r.status === 401 || r.status === 403) throw err("auth", "session expirée, reconnecte-toi", true);
    if (r.status === 404) throw err("mal", "entrée déjà absente de la liste", true);
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok) {
      const msg = data?.errors?.[0]?.message || `HTTP ${r.status}`;
      throw err(r.status === 400 ? "mal" : "http", msg, true);
    }
    return { ok: true, data };
  } catch (e) {
    if (e?.name === "AbortError") throw err("aborted", "délai dépassé", true);
    throw e?.code ? e : err("network", e?.message || "réseau", true);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener?.("abort", onAbort);
  }
}

// Invalide le cache d'une liste après écriture (best-effort : le prochain load refetch).
async function dropCacheFor(kind, user) {
  const s = store(); if (!s || !s.remove) return;
  const key = `${kind}:${String(user).toLowerCase()}`;
  try {
    await s.remove(CACHE_PREFIX + key);
    const idx = ((await s.get(INDEX_KEY))[INDEX_KEY] || []).filter((e) => e.key !== key);
    await s.set({ [INDEX_KEY]: idx });
  } catch { /* cache best-effort */ }
}

root.__myappleList = {
  SCHEMA_V, STATUT, statutLabel, loadList, readInitial, normalizeItem, normalizeAnime, normalizeManga,
  fixImg, parseDMY, isoPartial, toMs, formatProgression, progressPct, kindFromPath, clearCache,
  readCsrfToken, clampScore, nextProgress, canQuickPlus, buildUpdatePayload, updateEntry, deleteEntry, dropCacheFor,
};
})();
