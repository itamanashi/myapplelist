// QA v2 vue anime/manga : assertions réelles + multi-cas (Bebop, FMAB, Berserk),
// mobile 390px, dark/light, test de désactivation (retour page native), mode déconnecté.
// Chemins portables : racine = dossier du script, captures = %TEMP%/opencode/shots.
// Usage : node tools/qa-anime-view.mjs   (code de sortie != 0 si échec)
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(os.tmpdir(), 'opencode', 'shots');
const profile = path.join(shots, 'profile-logged');
const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false,panelOpen:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome={storage:{local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{const c={};for(const[k,v]of Object.entries(o)){c[k]={oldValue:store[k],newValue:v};store[k]=v}lis.forEach(f=>{try{f(c)}catch(e){}})}},onChanged:{addListener:(f)=>lis.add(f)}}};})();`;

const failures = [];
const ok = (cond, label) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + label);
  if (!cond) failures.push(label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { url: 'https://myanimelist.net/anime/1/Cowboy_Bebop', tag: 'bebop', h1: 'Cowboy Bebop', chars: true },
  { url: 'https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood', tag: 'anime-fmab', h1: 'Fullmetal Alchemist: Brotherhood', chars: true },
  { url: 'https://myanimelist.net/manga/2/Berserk', tag: 'manga-berserk', h1: 'Berserk', chars: true },
];

const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
await ctx.addInitScript({ content: STUB });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

async function inject() {
  await page.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await page.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
  await page.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(2500);
}
const report = () => page.evaluate(() => ({
  vue: !!document.querySelector('#myapple-anime'),
  h1: document.querySelector('#myapple-anime h1')?.textContent?.trim() ?? 'ABSENT',
  score: document.querySelector('#myapple-anime .apl-score > b')?.textContent?.trim() ?? 'ABSENT',
  kpis: document.querySelectorAll('#myapple-anime .apl-kpi').length,
  chips: document.querySelectorAll('#myapple-anime .apl-chip').length,
  infos: document.querySelectorAll('#myapple-anime dl.apl-infos > dt').length,
  chars: document.querySelectorAll('#myapple-anime #apl-sec-chars .apl-person').length,
  related: document.querySelectorAll('#myapple-anime ul.apl-related > li').length,
  toc: document.querySelectorAll('#myapple-anime .apl-toc a').length,
  actions: [...document.querySelectorAll('#myapple-anime .apl-actions a')].map((a) => a.textContent.trim()),
  oldHidden: (() => { const t = document.querySelector('#content > table'); return t ? getComputedStyle(t).display : 'ABSENT'; })(),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}));

for (const c of CASES) {
  console.log('== ' + c.tag + ' ==');
  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await inject();
  const r = await report();
  console.log(JSON.stringify(r));
  ok(r.vue, c.tag + ' : vue construite');
  ok(r.h1 === c.h1, c.tag + ' : h1 exact ("' + r.h1 + '")');
  ok(r.score !== 'ABSENT', c.tag + ' : note dominante affichée');
  ok(r.kpis >= 3, c.tag + ' : stats secondaires (' + r.kpis + ')');
  ok(r.infos >= 5, c.tag + ' : grille infos (' + r.infos + ')');
  if (c.chars) ok(r.chars > 0, c.tag + ' : personnages (' + r.chars + ')');
  ok(r.toc >= 2, c.tag + ' : sommaire (' + r.toc + ' ancres)');
  ok(r.oldHidden === 'none', c.tag + ' : tableau MAL masqué');
  ok(r.overflow <= 1, c.tag + ' : pas de débordement horizontal (+' + r.overflow + 'px)');
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, c.tag + '-light.png') });
  await page.evaluate(() => window.__setMyApple({ dark: true }));
  await sleep(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, c.tag + '-dark.png') });
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(300);
}

// Mobile 390px (Bebop) : hero compact, pas de débordement
console.log('== mobile-390 ==');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(CASES[0].url, { waitUntil: 'domcontentloaded' });
await inject();
const m = await report();
console.log(JSON.stringify(m));
ok(m.vue && m.h1 === CASES[0].h1, 'mobile : vue + titre');
ok(m.overflow <= 1, 'mobile : pas de débordement horizontal (+' + m.overflow + 'px)');
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, 'bebop-mobile.png') });
await page.setViewportSize({ width: 1440, height: 900 });

// Désactivation : retour propre à la page native (vue retirée, nœuds restaurés)
console.log('== disable ==');
await page.goto(CASES[0].url, { waitUntil: 'domcontentloaded' });
await inject();
ok(await page.evaluate(() => !!document.querySelector('#myapple-anime')), 'disable : vue présente avant');
await page.evaluate(() => window.__setMyApple({ enabled: false }));
await sleep(600);
const d = await page.evaluate(() => ({
  vue: !!document.querySelector('#myapple-anime'),
  tableVisible: (() => { const t = document.querySelector('#content > table'); return t ? getComputedStyle(t).display : 'ABSENT'; })(),
  synopsisBack: !!document.querySelector('#content p[itemprop="description"]'),
  labelIntact: [...document.querySelectorAll('#content .leftside .spaceit_pad .dark_text')].length > 0,
}));
console.log(JSON.stringify(d));
ok(!d.vue, 'disable : vue retirée');
ok(d.tableVisible !== 'none', 'disable : tableau MAL réaffiché (' + d.tableVisible + ')');
ok(d.synopsisBack, 'disable : synopsis restauré dans le DOM natif');
ok(d.labelIntact, 'disable : labels MAL intacts (extraction non destructive)');
await page.evaluate(() => window.__setMyApple({ enabled: true }));
await ctx.close();

// Mode déconnecté (contexte vierge) : pas de faux boutons, pas de crash
console.log('== logged-out ==');
try {
  const ctx2 = await chromium.launchPersistentContext(path.join(shots, 'profile-guest'), { channel: 'chrome', headless: true });
  await ctx2.addInitScript({ content: STUB });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e).slice(0, 160)));
  await p2.goto(CASES[0].url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p2.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await p2.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
  await p2.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(2500);
  const g = await p2.evaluate(() => ({
    vue: !!document.querySelector('#myapple-anime'),
    h1: document.querySelector('#myapple-anime h1')?.textContent?.trim() ?? 'ABSENT',
    actions: [...document.querySelectorAll('#myapple-anime .apl-actions a')].map((a) => a.textContent.trim() + '|' + (a.getAttribute('href') || '').slice(0, 60)),
  }));
  console.log(JSON.stringify(g));
  ok(g.vue && g.h1 === CASES[0].h1, 'guest : vue construite');
  ok(errs2.length === 0, 'guest : aucune erreur JS (' + errs2.length + ')');
  await ctx2.close();
} catch (e) {
  console.log('  SKIP guest : ' + String(e).split('\n')[0].slice(0, 160));
}

ok(errors.length === 0, 'aucune erreur JS sur les pages connectées (' + errors.length + ')');
if (errors.length) console.log(errors);
console.log(failures.length ? `ECHEC : ${failures.length} assertion(s)` : 'TOUT-VERT');
process.exit(failures.length ? 1 : 0);
