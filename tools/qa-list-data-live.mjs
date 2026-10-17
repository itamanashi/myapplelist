// Validation live de list-data.js contre les listes itaminashi.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const PROFILE_DIR = fs.existsSync(path.join(shots, "profile-logged"))
  ? path.join(shots, "profile-logged")
  : path.join(root, ".chrome-profile");
const me = "itaminashi";

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

const summarize = (items, kind) => {
  const byStatut = {};
  for (const it of items) byStatut[it.statut] = (byStatut[it.statut] || 0) + 1;
  const withSeason = items.filter((it) => it.saison);
  const withAnnee = items.filter((it) => it.annee);
  const airing = {};
  for (const it of items) airing[it.airingOrPublishing ?? "null"] = (airing[it.airingOrPublishing ?? "null"] || 0) + 1;
  const unknownTotal = items.filter((it) => it.progression.total === 0).length;
  const sample = items.find((it) => it.genres.length && it.studios.length) || items[0];
  return {
    kind,
    total: items.length,
    skippedHint: items.length,
    byStatut,
    airing,
    withSeason: withSeason.length,
    seasonSample: withSeason[0]?.saison ?? null,
    withAnnee: withAnnee.length,
    unknownTotal,
    imgSample: sample?.img ?? null,
    imgHasResize: /\/r\/\d+x\d+\//.test(sample?.img || ""),
    sample: sample
      ? {
          id: sample.id,
          titre: sample.titre,
          annee: sample.annee,
          saison: sample.saison,
          genres: sample.genres.slice(0, 3),
          studios: sample.studios.slice(0, 2),
          airingOrPublishing: sample.airingOrPublishing,
          majLeSource: sample.majLeSource,
          progression: sample.progression,
          popularite: sample.popularite,
          scoreMal: sample.scoreMal,
        }
      : null,
  };
};

for (const kind of ["anime", "manga"]) {
  await page.goto(`https://myanimelist.net/${kind}list/${me}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: path.join(root, "content", "list-data.js") });
  const result = await page.evaluate(async ({ kind, me }) => {
    const L = window.__myappleList;
    const progress = [];
    const r = await L.loadList({
      kind,
      user: me,
      force: true,
      onProgress: (p) => progress.push(p),
    });
    const edits = [...document.querySelectorAll("table.list-table a[href*='/edit']")]
      .slice(0, 5)
      .map((a) => ({ text: (a.textContent || "").trim().slice(0, 20), href: a.getAttribute("href") }));
    const editAny = document.querySelector("table.list-table a[href*='ownlist'][href*='edit'], table.list-table a.List_EditLink, table.list-table .edit a");
    return {
      total: r.total,
      partial: r.partial,
      error: r.error || null,
      skipped: r.skipped,
      empty: r.empty,
      fromCache: r.fromCache,
      progress,
      path: L.kindFromPath(location.pathname),
      items: r.items,
      edits,
      editAny: editAny ? editAny.href : null,
    };
  }, { kind, me });
  const { items, ...meta } = result;
  console.log(`${kind} meta`, JSON.stringify({ ...meta, items: undefined, n: items.length }, null, 2));
  console.log(`${kind} summary`, JSON.stringify(summarize(items, kind), null, 2));
}

await ctx.close();
console.log("TERMINE");
