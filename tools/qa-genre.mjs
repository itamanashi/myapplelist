// node tools/qa-genre.mjs [id/slug] — QA live de la vue Genre avec le profil
// Chrome persistant (.chrome-profile, session MAL connectée, extensions coupées
// pour injecter le code courant). Vérifie parse + hero + filtres + tableau +
// pagination, puis capture light/dark dans le dossier temporaire.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] || "1/Action";
const url = `https://myanimelist.net/anime/genre/${slug}`;
const shots = process.env.TEMP ? path.join(process.env.TEMP, "myapple-genre-shots") : root;

const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false,panelOpen:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome=window.chrome||{};window.chrome.storage={local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{}},onChanged:{addListener:(f)=>lis.add(f)}};})();`;

const ctx = await chromium.launchPersistentContext(path.join(root, ".chrome-profile"), {
  channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 },
  args: ["--disable-extensions"],
});
await ctx.addInitScript({ content: STUB });
const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Le consentement Quantcast installe un interceptor qui avale les clics.
await page.route("**/*", (route) => {
  if (/cdn\.myanimelist\.net\/js\/(quantcast_choice|cmp)\.js/.test(route.request().url())) {
    return route.abort();
  }
  return route.continue();
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });
await page.addScriptTag({ path: path.join(root, "content", "genre-view.js") });
await page.addScriptTag({ path: path.join(root, "content", "content.js") });
await sleep(2500);
await page.evaluate(() => {
  document.querySelectorAll("#qc-cmp2-container, .qc-cmp-cleanslate").forEach((n) => n.remove());
});

const report = await page.evaluate(() => {
  const v = document.querySelector("#myapple-genre");
  const style = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "ABSENT"; };
  const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const cards = [...(v?.querySelectorAll(".apl-work") || [])].slice(0, 10);
  return {
    signedIn: window.MAL?.USER_NAME || "",
    url: location.pathname + location.search,
    view: !!v,
    h1: v?.querySelector(".apl-who h1")?.textContent ?? null,
    alt: v?.querySelector(".apl-alt")?.textContent ?? null,
    kpis: [...(v?.querySelectorAll(".apl-kpi") || [])].map((k) => k.textContent.trim()),
    legend: [...(v?.querySelectorAll(".apl-legend-item") || [])].map((i) => i.textContent.trim()),
    chips: [...(v?.querySelectorAll(".apl-chip") || [])].map((c) => c.textContent.trim()),
    mineBtn: v?.querySelector(".apl-mine-btn")?.textContent ?? null,
    cards: v?.querySelectorAll(".apl-work").length ?? 0,
    statuses: v?.querySelectorAll(".apl-work-status").length ?? 0,
    ownScores: v?.querySelectorAll(".apl-work-own").length ?? 0,
    firstCard: v?.querySelector(".apl-work-title")?.textContent ?? null,
    firstSubtitle: v?.querySelector(".apl-work-subtitle")?.textContent ?? null,
    firstStudio: v?.querySelector(".apl-work-studio")?.textContent ?? null,
    pager: [...(v?.querySelectorAll(".apl-pager-link") || [])].map((a) => a.textContent.trim()),
    pagerCurrent: v?.querySelector(".apl-pager-link[aria-current='page']")?.textContent ?? null,
    descMoved: !!v?.querySelector(".apl-sec-desc .genre-description"),
    descNoDup: document.querySelectorAll(".genre-description").length === 1,
    native: {
      h1Band: style("#contentWrapper > div:has(> h1.h1)"),
      breadcrumb: style("#content .breadcrumb"),
      horiznav: style("#content #horiznav_nav"),
      form: style("#content #advancedsearch"),
      header: style("#content .normal_header"),
      list: style("#content .js-categories-seasonal"),
      pager: style("#content .pagination"),
    },
    geometry: {
      view: box("#myapple-genre"),
      hero: box("#myapple-genre .apl-hero"),
      firstCard: box("#myapple-genre .apl-work"),
      gridCols: v ? getComputedStyle(v.querySelector(".apl-works")).gridTemplateColumns.split(" ").length : 0,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroOverflow: (() => { const h = v?.querySelector(".apl-hero"); return h ? h.scrollWidth - h.clientWidth : null; })(),
      cardIssues: cards.map((c) => {
        const s = c.querySelector(".apl-work-status");
        const sc = c.querySelector(".apl-work-score");
        const t = c.querySelector(".apl-work-title");
        const im = c.querySelector("img");
        return {
          overlap: s && sc ? overlap(s.getBoundingClientRect(), sc.getBoundingClientRect()) : false,
          titleClipped: t ? t.scrollHeight > t.clientHeight + 1 : false,
          imgOk: im ? im.naturalWidth > 0 : null,
        };
      }),
    },
    topbar: !!document.querySelector("#myapple-topbar"),
    bodyClass: document.body.classList.contains("myapple-genre"),
  };
});

// Vue tableau (vrais clics).
await page.locator('#myapple-genre .apl-view-btn[data-view="table"]').click();
const table = await page.evaluate(() => {
  const v = document.querySelector("#myapple-genre");
  return {
    visible: !v.querySelector(".apl-table-wrap").hidden,
    gridHidden: v.querySelector(".apl-works").hidden,
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    firstRow: v.querySelector(".apl-row-titles .apl-row-title")?.textContent ?? null,
    firstStudio: v.querySelector(".apl-works-table tbody .apl-col-studio")?.textContent ?? null,
    pressed: v.querySelector('.apl-view-btn[data-view="table"]').getAttribute("aria-pressed"),
    overflow: (() => { const t = v.querySelector(".apl-table-wrap"); return t.scrollWidth - t.clientWidth; })(),
  };
});
// Filtre « Ma liste ».
await page.locator("#myapple-genre .apl-mine-btn").click();
const mine = await page.evaluate(() => {
  const v = document.querySelector("#myapple-genre");
  return {
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    pressed: v.querySelector(".apl-mine-btn").getAttribute("aria-pressed"),
    count: v.querySelector(".apl-card-count").textContent,
  };
});
// Filtre TV + retour Tout / grille.
await page.locator('#myapple-genre .apl-chip[data-type="tv"]').click();
const tv = await page.evaluate(() => {
  const v = document.querySelector("#myapple-genre");
  return {
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    chip: v.querySelector('.apl-chip[data-type="tv"]').getAttribute("aria-pressed"),
    count: v.querySelector(".apl-card-count").textContent,
  };
});
await page.locator("#myapple-genre .apl-chip[data-type='all']").click();
await page.locator("#myapple-genre .apl-mine-btn").click();
await page.locator('#myapple-genre .apl-view-btn[data-view="grid"]').click();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, "genre-light-top.png") });
await page.evaluate(() => window.scrollTo(0, 950));
await sleep(300);
await page.screenshot({ path: path.join(shots, "genre-light-grid.png") });
await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, "genre-dark-top.png") });
await page.evaluate(() => window.scrollTo(0, 950));
await sleep(300);
await page.screenshot({ path: path.join(shots, "genre-dark-grid.png") });

await ctx.close();
report.table = { ...table, mineRows: mine.rows, minePressed: mine.pressed, mineCount: mine.count, tvRows: tv.rows, tvPressed: tv.chip, tvCount: tv.count };
console.log(JSON.stringify({ report, errors, shots }, null, 2));
