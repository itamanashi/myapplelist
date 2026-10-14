// node tools/test-list-data.mjs  — tests de content/list-data.js avec des données simulées.
import assert from "node:assert/strict";

const mem = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: mem[k] }),
  set: async (o) => { Object.assign(mem, o); },
  remove: async (ks) => { [].concat(ks).forEach((k) => delete mem[k]); },
} } };
await import("../content/list-data.js");
const L = globalThis.__myappleList;

const anime = (i) => ({
  status: 2, score: i % 11, tags: "a, b", is_rewatching: 0, num_watched_episodes: 12, created_at: 1696000000, updated_at: 1696100000,
  anime_title: `Anime ${i}`, anime_title_eng: null, anime_num_episodes: 12, anime_airing_status: 2, anime_id: 1000 + i,
  anime_studios: [{ id: 1, name: "Bones" }], anime_season: null, anime_popularity: 5, anime_score_val: "8.43", anime_total_members: 100,
  genres: [{ id: 1, name: "Action" }], demographics: [], anime_url: `/anime/${1000 + i}/x`,
  anime_image_path: "https://cdn.myanimelist.net/r/192x272/images/anime/1236/138696.webp?s=abc",
  anime_media_type_string: "TV", start_date_string: "12-10-23", finish_date_string: null, anime_start_date_string: "01-01-68", notes: "",
});
const manga = (i) => ({
  id: 100030000 + i, status: 1, score: 0, tags: "", is_rereading: 0, num_read_chapters: 345, num_read_volumes: 0, created_at: 1690000000,
  manga_title: `Manga ${i}`, manga_english: "Eng", manga_num_chapters: 0, manga_num_volumes: 0, manga_publishing_status: 1,
  manga_id: 500 + i, manga_magazines: null, manga_url: `/manga/${500 + i}/x`, manga_image_path: "https://cdn.myanimelist.net/images/manga/1/2.jpg",
  manga_media_type_string: "Manga", start_date_string: null, finish_date_string: null,
  manga_start_date_string: "01-01-68", manga_popularity: 288, manga_score_val: 8.95, manga_total_members: 67270,
});

// --- utilitaires
assert.equal(L.fixImg("https://cdn.myanimelist.net/r/192x272/images/anime/1236/138696.webp?s=abc"), "https://cdn.myanimelist.net/images/anime/1236/138696.webp");
assert.equal(L.fixImg("https://cdn.myanimelist.net/images/manga/1/2.jpg"), "https://cdn.myanimelist.net/images/manga/1/2.jpg");
assert.deepEqual(L.parseDMY("12-10-23"), { y: 2023, m: 10, d: 12 });
assert.equal(L.parseDMY("01-01-68").y, 1968);
assert.equal(L.parseDMY("00-00-00"), null);
assert.deepEqual(L.parseDMY("??-??-95"), { y: 1995, m: null, d: null });
assert.equal(L.parseDMY(null), null);
assert.equal(L.isoPartial(L.parseDMY("05-03-21")), "2021-03-05");
assert.equal(L.isoPartial(L.parseDMY("??-07-21")), "2021-07");
assert.equal(L.toMs(1696000000), 1696000000000);
assert.equal(L.toMs(1696000000000), 1696000000000);
assert.equal(L.toMs(0), null);

// --- normalisation
const a = L.normalizeItem(anime(1), "anime");
assert.equal(a.id, 1001); assert.equal(a.annee, 1968); assert.equal(a.scoreMal, 8.43);
assert.deepEqual(a.tags, ["a", "b"]); assert.equal(a.majLeSource, "updated"); assert.equal(a.airingOrPublishing, "termine");
assert.equal(a.debutVu, "2023-10-12"); assert.equal(a.studios[0].name, "Bones");
const m = L.normalizeItem(manga(1), "manga");
assert.equal(m.id, 501); assert.equal(m.listRowId, 100030001); assert.equal(m.majLeSource, "created");
assert.equal(m.majLe, 1690000000000); assert.deepEqual(m.studios, []); assert.equal(L.formatProgression(m.progression), "345 / ? ch");
assert.equal(L.progressPct(m.progression), null);
assert.equal(L.progressPct(a.progression), 100);
assert.equal(m.annee, 1968); assert.equal(m.popularite, 288); assert.equal(m.scoreMal, 8.95); assert.equal(m.members, 67270);
assert.equal(L.normalizeItem({ anime_id: 1 }, "anime"), null); // pas de titre -> ignoré

// --- chargement paginé : 617 entrées = 300 (DOM) + 300 + 17, puis page vide
const all = Array.from({ length: 617 }, (_, i) => anime(i));
const mkDoc = (raw) => ({ querySelector: () => ({ getAttribute: () => JSON.stringify(raw) }), body: { textContent: "" } });
let calls = [];
const fetchOk = async (url) => {
  calls.push(url);
  const off = Number(new URL(url).searchParams.get("offset"));
  return { ok: true, status: 200, json: async () => all.slice(off, off + 300) };
};
const fast = { pauseMs: 0, backoffMs: 1 };
const progress = [];
let r = await L.loadList({ kind: "anime", user: "tester", doc: mkDoc(all.slice(0, 300)), fetch: fetchOk, onProgress: (p) => progress.push(p.loaded), ...fast });
assert.equal(r.total, 617); assert.equal(r.fromCache, false); assert.equal(r.partial, false);
assert.equal(calls.length, 3); assert.ok(calls[0].includes("offset=300")); assert.ok(calls[2].includes("offset=617"));
assert.deepEqual(progress, [300, 600, 617]);

// --- 2e appel : cache (aucun fetch)
calls = [];
r = await L.loadList({ kind: "anime", user: "tester", doc: mkDoc([]), fetch: fetchOk, ...fast });
assert.equal(r.fromCache, true); assert.equal(r.total, 617); assert.equal(calls.length, 0);

// --- appel type profil : pas de table dans le DOM -> fetch dès offset=0
calls = [];
r = await L.loadList({ kind: "anime", user: "autre", doc: { querySelector: () => null, body: { textContent: "" } }, fetch: fetchOk, ...fast });
assert.equal(r.total, 617); assert.ok(calls[0].includes("offset=0"));

// --- panne en cours de route : résultat partiel, non mis en cache
const fetch500 = async () => ({ ok: false, status: 500, json: async () => [] });
r = await L.loadList({ kind: "anime", user: "panne", doc: mkDoc(all.slice(0, 300)), fetch: fetch500, ...fast });
assert.equal(r.partial, true); assert.equal(r.total, 300); assert.equal(r.error.code, "http");
assert.equal(mem["myapple_list_v1:anime:panne"], undefined);

// --- liste privée
const noTable = { querySelector: () => null, body: { textContent: "This list has been made private by the owner." } };
await assert.rejects(L.loadList({ kind: "anime", user: "prive", doc: noTable, fetch: fetchOk, ...fast }), { code: "private" });
const fetch403 = async () => ({ ok: false, status: 403, json: async () => [] });
await assert.rejects(L.loadList({ kind: "manga", user: "prive2", doc: { querySelector: () => null, body: { textContent: "" } }, fetch: fetch403, ...fast }), { code: "private" });

// --- dédoublonnage : une page qui rejoue les mêmes entrées ne boucle pas
const fetchDup = async () => ({ ok: true, status: 200, json: async () => all.slice(0, 300) });
r = await L.loadList({ kind: "anime", user: "dup", doc: mkDoc(all.slice(0, 300)), fetch: fetchDup, ...fast });
assert.equal(r.total, 300);

// --- manga : id de ligne utilisé pour dédoublonner, liste vide gérée
const mangas = Array.from({ length: 320 }, (_, i) => manga(i));
const fetchM = async (url) => { const off = Number(new URL(url).searchParams.get("offset")); return { ok: true, status: 200, json: async () => mangas.slice(off, off + 300) }; };
r = await L.loadList({ kind: "manga", user: "mm", doc: mkDoc(mangas.slice(0, 300)), fetch: fetchM, ...fast });
assert.equal(r.total, 320);
r = await L.loadList({ kind: "manga", user: "vide", doc: { querySelector: () => null, body: { textContent: "" } }, fetch: async () => ({ ok: true, status: 200, json: async () => [] }), ...fast });
assert.equal(r.empty, true);

// --- cache LRU : 6 entrées max
for (let i = 0; i < 8; i++) await L.loadList({ kind: "manga", user: `lru${i}`, doc: mkDoc([manga(i)]), fetch: async () => ({ ok: true, status: 200, json: async () => [] }), ...fast });
assert.ok(mem["myapple_list_index_v1"].length <= 6);

console.log("OK — tous les tests passent");
