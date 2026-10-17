// node tools/qa-producer.mjs [slug] — QA live de la vue Producer/Studio.
// Charge la vraie page MAL (ex. /anime/producer/14/Sunrise), injecte overlay.css +
// producer-view.js + content.js (stub chrome.storage), vérifie le parse, la mise en
// page (chrome natif masqué, pas de débordement), les filtres/vues, puis capture
// light/dark. Aucune extension requise (ni profil persistant).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] || "14/Sunrise";
const url = `https://myanimelist.net/anime/producer/${slug}`;
const shots = process.env.TEMP ? path.join(process.env.TEMP, "myapple-producer-shots") : root;

const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false,panelOpen:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome={storage:{local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{const c={};for(const[k,v]of Object.entries(o)){c[k]={oldValue:store[k],newValue:v};store[k]=v}lis.forEach(f=>{try{f(c)}catch(e){}})}},onChanged:{addListener:(f)=>lis.add(f)}}};})();`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript({ content: STUB });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Le script de consentement Quantcast installe un interceptor qui avale les clics :
// on le bloque (le test ne dépend pas du choix de consentement).
await page.route("**/*", (route) => {
  if (/cdn\.myanimelist\.net\/js\/(quantcast_choice|cmp)\.js/.test(route.request().url())) {
    return route.abort();
  }
  return route.continue();
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });
await page.addScriptTag({ path: path.join(root, "content", "producer-view.js") });
await page.addScriptTag({ path: path.join(root, "content", "content.js") });
await sleep(2500);
// Bandeau de consentement Quantcast : retire l'overlay (il intercepte les clics).
await page.evaluate(() => {
  document.querySelectorAll("#qc-cmp2-container, .qc-cmp-cleanslate").forEach((n) => n.remove());
});

const report = await page.evaluate(() => {
  const v = document.querySelector("#myapple-producer");
  const style = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "ABSENT"; };
  const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }; };
  const out = {
    url: location.pathname,
    view: !!v,
    h1: v?.querySelector(".apl-who h1")?.textContent ?? null,
    kind: v?.querySelector(".apl-kind")?.textContent ?? null,
    kpis: [...(v?.querySelectorAll(".apl-kpi") || [])].map((k) => k.textContent.trim()),
    legend: [...(v?.querySelectorAll(".apl-legend-item") || [])].map((i) => i.textContent.trim()),
    chips: [...(v?.querySelectorAll(".apl-chip") || [])].map((c) => c.textContent.trim()),
    cards: v?.querySelectorAll(".apl-work").length ?? 0,
    firstCard: v?.querySelector(".apl-work-title")?.textContent ?? null,
    withScore: v?.querySelectorAll(".apl-work-score").length ?? 0,
    withStatus: v?.querySelectorAll(".apl-work-status").length ?? 0,
    news: v?.querySelectorAll(".apl-news-item").length ?? 0,
    toc: [...(v?.querySelectorAll(".apl-toc a") || [])].map((a) => a.textContent.trim()),
    bio: !!v?.querySelector(".apl-sec-bio .apl-panel-body span"),
    infos: v?.querySelectorAll(".apl-infos dt").length ?? 0,
    native: {
      left: style("#content .content-left"),
      right: style("#content .content-right"),
      header: style("#contentWrapper > div:has(> .h1.edit-info)"),
    },
    geometry: {
      view: box("#myapple-producer"),
      hero: box("#myapple-producer .apl-hero"),
      poster: box("#myapple-producer .apl-poster"),
      firstCard: box("#myapple-producer .apl-work"),
      gridCols: v ? getComputedStyle(v.querySelector(".apl-works")).gridTemplateColumns.split(" ").length : 0,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroOverflow: (() => { const h = v?.querySelector(".apl-hero"); return h ? h.scrollWidth - h.clientWidth : null; })(),
      body: box("#myapple-producer .apl-work-body"),
    },
    bodyClass: document.body.classList.contains("myapple-producer"),
    topbar: !!document.querySelector("#myapple-topbar"),
  };

  return out;
});

// MAL bloque les clics synthétiques (isTrusted=false) : interactions via vrais clics.
const tableBtn = page.locator('#myapple-producer .apl-view-btn[data-view="table"]');
await tableBtn.click();
const table = await page.evaluate(() => {
  const v = document.querySelector("#myapple-producer");
  return {
    visible: !v.querySelector(".apl-table-wrap").hidden,
    gridHidden: v.querySelector(".apl-works").hidden,
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    firstRow: v.querySelector(".apl-row-title")?.textContent ?? null,
    pressed: v.querySelector('.apl-view-btn[data-view="table"]').getAttribute("aria-pressed"),
    overflow: (() => { const t = v.querySelector(".apl-table-wrap"); return t.scrollWidth - t.clientWidth; })(),
  };
});
const tvChip = page.locator('#myapple-producer .apl-chip[data-type="tv"]');
await tvChip.click();
const tableTv = await page.evaluate(() => {
  const v = document.querySelector("#myapple-producer");
  return {
    rows: v.querySelectorAll(".apl-works-table tbody tr").length,
    chip: v.querySelector('.apl-chip[data-type="tv"]').getAttribute("aria-pressed"),
    count: v.querySelector(".apl-card-count").textContent,
  };
});
report.table = { ...table, tvRows: tableTv.rows, tvChip: tableTv.chip, tvCount: tableTv.count };
// Retour grille + Tout pour les captures.
await page.locator('#myapple-producer .apl-view-btn[data-view="grid"]').click();
await page.locator('#myapple-producer .apl-chip[data-type="all"]').click();

await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, "producer-light-top.png") });
await page.evaluate(() => window.scrollTo(0, 1050));
await sleep(300);
await page.screenshot({ path: path.join(shots, "producer-light-grid.png") });
await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, "producer-dark-top.png") });
await page.evaluate(() => window.scrollTo(0, 1050));
await sleep(300);
await page.screenshot({ path: path.join(shots, "producer-dark-grid.png") });

await browser.close();
console.log(JSON.stringify({ report, errors, shots }, null, 2));
