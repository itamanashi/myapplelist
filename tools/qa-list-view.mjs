// QA refonte animelist et mangalist : test live et captures d'écran
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });

const profile = fs.existsSync(path.join(shots, "profile-logged"))
  ? path.join(shots, "profile-logged")
  : path.join(root, ".chrome-profile");

const STUB = `(()=>{
  const KEY = 'myapple_state_v1';
  const store = { [KEY]: { enabled: true, dark: false } };
  const lis = new Set();
  window.__setMyApple = async (p) => {
    const o = { ...store[KEY] };
    store[KEY] = { ...store[KEY], ...p };
    const c = { [KEY]: { oldValue: o, newValue: { ...store[KEY] } } };
    lis.forEach((f) => { try { f(c); } catch(e) {} });
  };
  window.chrome = {
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : { ...store }),
        set: async (o) => {
          const c = {};
          for (const [k, v] of Object.entries(o)) {
            c[k] = { oldValue: store[k], newValue: v };
            store[k] = v;
          }
          lis.forEach((f) => { try { f(c); } catch(e) {} });
        },
        remove: async (ks) => { [].concat(ks).forEach((k) => delete store[k]); }
      },
      onChanged: { addListener: (f) => lis.add(f) }
    }
  };
})();`;

const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1440, height: 900 }
});
await ctx.addInitScript({ content: STUB });

const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

const me = "itaminashi";

console.log("=== 1. Test Anime List ===");
await page.goto(`https://myanimelist.net/animelist/${me}`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });
await page.addScriptTag({ path: path.join(root, "content", "list-data.js") });
await page.addScriptTag({ path: path.join(root, "content", "list-view.js") });
await page.addScriptTag({ path: path.join(root, "content", "profile.js") });
await page.addScriptTag({ path: path.join(root, "content", "content.js") });

await sleep(2500);

const animeState = await page.evaluate(() => {
  const rootEl = document.getElementById("myapple-list");
  const hero = rootEl?.querySelector(".apl-list-hero");
  const h1 = hero?.querySelector("h1")?.textContent?.trim();
  const kpis = [...rootEl?.querySelectorAll(".apl-list-kpi > b") || []].map((b) => b.textContent.trim());
  const tabs = [...rootEl?.querySelectorAll(".apl-tab-btn") || []].map((t) => t.textContent.trim());
  const cards = rootEl?.querySelectorAll(".apl-poster-card").length || 0;
  const oldHidden = (() => {
    const el = document.querySelector(".list-container");
    return el ? getComputedStyle(el).display : "ABSENT";
  })();
  const topbar = !!document.getElementById("myapple-topbar");

  return {
    hasRoot: !!rootEl,
    h1,
    kpis,
    tabs,
    cards,
    oldHidden,
    topbar,
  };
});

console.log("Anime List State:", JSON.stringify(animeState, null, 2));

// Capture Anime Light
await page.evaluate(() => window.__setMyApple({ dark: false }));
await sleep(500);
await page.screenshot({ path: path.join(shots, "list-anime-light.png") });

// Test clic onglet "En cours"
console.log("Filtrage par onglet 'En cours'...");
await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".apl-tab-btn")].find((b) => b.textContent.includes("En cours"));
  btn?.click();
});
await sleep(400);

const watchingCards = await page.evaluate(() => document.querySelectorAll(".apl-poster-card").length);
console.log(`Nombre de cartes 'En cours': ${watchingCards}`);
await page.screenshot({ path: path.join(shots, "list-anime-watching.png") });

// Test Recherche "Stone"
console.log("Recherche instantanée...");
await page.evaluate(() => {
  const allBtn = [...document.querySelectorAll(".apl-tab-btn")].find((b) => b.textContent.includes("Tous"));
  allBtn?.click();
  const input = document.getElementById("myapple-list-search");
  if (input) {
    input.value = "Stone";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await sleep(400);
const searchResults = await page.evaluate(() => document.querySelectorAll(".apl-poster-card").length);
console.log(`Nombre de résultats pour 'Stone': ${searchResults}`);
await page.screenshot({ path: path.join(shots, "list-anime-search.png") });

// Test Bascule Tableau
console.log("Bascule en vue tableau...");
await page.evaluate(() => {
  const input = document.getElementById("myapple-list-search");
  if (input) {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const tableBtn = document.querySelector(".apl-icon-btn[title*='Tableau']");
  tableBtn?.click();
});
await sleep(400);
const tableRows = await page.evaluate(() => document.querySelectorAll(".apl-table-row").length);
console.log(`Nombre de lignes dans le tableau: ${tableRows}`);
await page.screenshot({ path: path.join(shots, "list-anime-table.png") });

// Mode Sombre
console.log("Basculement en Dark mode...");
await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(600);
await page.screenshot({ path: path.join(shots, "list-anime-dark-table.png") });

// Revenir en grille pour capture dark grid
await page.evaluate(() => {
  const gridBtn = document.querySelector(".apl-icon-btn[title*='Grille']");
  gridBtn?.click();
});
await sleep(400);
await page.screenshot({ path: path.join(shots, "list-anime-dark-grid.png") });

// Test Modal Détail (clic 1re carte)
console.log("Test ouverture modal de détail...");
await page.evaluate(() => {
  const firstCard = document.querySelector(".apl-poster-card");
  firstCard?.click();
});
await sleep(500);
const modalOpen = await page.evaluate(() => {
  const m = document.getElementById("myapple-list-modal");
  return m ? m.classList.contains("open") && getComputedStyle(m).display !== "none" : false;
});
console.log(`Modal détail ouvert: ${modalOpen}`);
await page.screenshot({ path: path.join(shots, "list-anime-modal-dark.png") });

await page.evaluate(() => {
  const close = document.querySelector(".apl-modal-close");
  close?.click();
});
await sleep(300);

console.log("=== 2. Test Manga List ===");
await page.goto(`https://myanimelist.net/mangalist/${me}`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ path: path.join(root, "content", "overlay.css") });
await page.addScriptTag({ path: path.join(root, "content", "list-data.js") });
await page.addScriptTag({ path: path.join(root, "content", "list-view.js") });
await page.addScriptTag({ path: path.join(root, "content", "profile.js") });
await page.addScriptTag({ path: path.join(root, "content", "content.js") });
await sleep(2500);

const mangaState = await page.evaluate(() => {
  const rootEl = document.getElementById("myapple-list");
  const hero = rootEl?.querySelector(".apl-list-hero");
  const h1 = hero?.querySelector("h1")?.textContent?.trim();
  const kpis = [...rootEl?.querySelectorAll(".apl-list-kpi > b") || []].map((b) => b.textContent.trim());
  const cards = rootEl?.querySelectorAll(".apl-poster-card").length || 0;
  return { hasRoot: !!rootEl, h1, kpis, cards };
});

console.log("Manga List State:", JSON.stringify(mangaState, null, 2));

// Capture Manga Light et Dark
await page.evaluate(() => window.__setMyApple({ dark: false }));
await sleep(400);
await page.screenshot({ path: path.join(shots, "list-manga-light.png") });

await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(400);
await page.screenshot({ path: path.join(shots, "list-manga-dark.png") });

await ctx.close();
console.log("=== QA TERMINÉ AVEC SUCCÈS ===");
