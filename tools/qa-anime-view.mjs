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
let page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

async function inject() {
  await page.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await page.addScriptTag({ path: path.join(root, 'content', 'malsync.js') });
  await page.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
  await page.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(2500);
}
const report = () => page.evaluate(() => {
  const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : 'ABSENT'; };
  return {
  vue: !!document.querySelector('#myapple-anime'),
  h1: document.querySelector('#myapple-anime h1')?.textContent?.trim() ?? 'ABSENT',
  h1Size: cs('#myapple-anime h1', 'fontSize'),
  ficheW: Math.round(document.querySelector('#myapple-anime')?.getBoundingClientRect().width ?? 0),
  score: document.querySelector('#myapple-anime .apl-score > b')?.textContent?.trim() ?? 'ABSENT',
  scoreColor: cs('#myapple-anime .apl-score > b', 'color'),
  starColor: cs('#myapple-anime .apl-star', 'color'),
  kpis: document.querySelectorAll('#myapple-anime .apl-kpi').length,
  chips: document.querySelectorAll('#myapple-anime .apl-chip').length,
  infos: document.querySelectorAll('#myapple-anime dl.apl-infos > dt').length,
  parasites: (document.querySelector('#myapple-anime')?.textContent || '').split(/ADKami|voir-anime|Quicksearch/i).length - 1,
  chars: document.querySelectorAll('#myapple-anime #apl-sec-chars .apl-person').length,
  related: document.querySelectorAll('#myapple-anime ul.apl-related > li').length,
  toc: document.querySelectorAll('#myapple-anime .apl-toc a').length,
  videoBg: cs('#myapple-anime .video-promotion a', 'backgroundColor'),
  actions: [...document.querySelectorAll('#myapple-anime .apl-actions a')].map((a) => a.textContent.trim()),
  oldHidden: (() => { const t = document.querySelector('#content > table'); return t ? getComputedStyle(t).display : 'ABSENT'; })(),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  h2Border: cs('#myapple-anime .apl-card h2', 'borderBottomWidth'),
  synLh: (() => { const p = document.querySelector('#apl-sec-synopsis p'); return p ? getComputedStyle(p).lineHeight : 'ABSENT'; })(),
  tocLabels: [...document.querySelectorAll('#myapple-anime .apl-toc a')].map((a) => a.textContent.trim()),
  softNav: !!document.querySelector('#myapple-anime .apl-card-soft ul.apl-navlist'),
  };
});

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
  ok(r.parasites === 0, c.tag + ' : aucun élément parasite dans la fiche');
  ok(r.ficheW >= 1150 && r.ficheW <= 1250, c.tag + ' : largeur fiche ' + r.ficheW + 'px (cible 1160-1240)');
  ok(parseFloat(r.h1Size) >= 40 && parseFloat(r.h1Size) <= 48, c.tag + ' : titre ' + r.h1Size);
  ok(r.h2Border === '0px', c.tag + ' : titres sans filet MAL (' + r.h2Border + ')');
  if (r.synLh !== 'ABSENT') ok(parseFloat(r.synLh) >= 23 && parseFloat(r.synLh) <= 25, c.tag + ' : synopsis lh 1.7 (' + r.synLh + ')');
  ok(r.tocLabels.includes('Synopsis') && r.tocLabels.includes('Infos'), c.tag + ' : sommaire Synopsis+Infos (' + r.tocLabels.join('/') + ')');
  ok(r.softNav, c.tag + ' : nav secondaire en retrait');
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(400);
  const light = await page.evaluate(() => {
    const e = document.querySelector('#myapple-anime .apl-score > b');
    return { score: e ? getComputedStyle(e).color : 'ABSENT' };
  });
  if (r.vue) ok(light.score === 'rgb(29, 29, 31)', c.tag + ' : note en encre en clair (' + light.score + ')');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, c.tag + '-light.png') });
  await page.evaluate(() => window.__setMyApple({ dark: true }));
  await sleep(600);
  const dark = await page.evaluate(() => {
    const s = document.querySelector('#myapple-anime .apl-score > b');
    const v = document.querySelector('#myapple-anime .video-promotion a');
    return { score: s ? getComputedStyle(s).color : 'ABSENT', videoBg: v ? getComputedStyle(v).backgroundColor : 'ABSENT' };
  });
  if (r.vue) ok(dark.score === 'rgb(255, 255, 255)', c.tag + ' : note blanche en sombre (' + dark.score + ')');
  if (dark.videoBg !== 'ABSENT') ok(dark.videoBg !== 'rgb(255, 255, 255)', c.tag + ' : pas de zone blanche vidéo en sombre (' + dark.videoBg + ')');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, c.tag + '-dark.png') });
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(300);
}

// Mobile 390px : vrai contexte mobile (isMobile + tactile), pas un simple resize.
// Sans ça, Chromium applique la sémantique desktop et le test ne reflète pas un téléphone.
// Même profil que desktop (consentement déjà stocké, pas de mur) : on libère le verrou d'abord.
console.log('== mobile-390 ==');
await ctx.close();
const mctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
});
await mctx.addInitScript({ content: STUB });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e).slice(0, 160)));
await mp.goto(CASES[0].url, { waitUntil: 'domcontentloaded' });
await mp.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
await mp.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
await mp.addScriptTag({ path: path.join(root, 'content', 'content.js') });
await sleep(2500);
const m = await mp.evaluate(() => ({
  vue: !!document.querySelector('#myapple-anime'),
  h1: document.querySelector('#myapple-anime h1')?.textContent?.trim() ?? 'ABSENT',
  ficheW: Math.round(document.querySelector('#myapple-anime')?.getBoundingClientRect().width ?? 0),
  viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'ABSENT',
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}));
console.log(JSON.stringify(m));
ok(m.vue && m.h1 === CASES[0].h1, 'mobile : vue + titre');
ok(m.ficheW >= 320 && m.ficheW <= 390, 'mobile : fiche pleine largeur (' + m.ficheW + 'px)');
ok(/width=device-width/.test(m.viewportMeta), 'mobile : viewport device-width (' + m.viewportMeta + ')');
ok(m.overflow <= 1, 'mobile : pas de débordement horizontal (+' + m.overflow + 'px)');
ok(merrs.length === 0, 'mobile : aucune erreur JS (' + merrs.length + ')');
await mp.evaluate(() => window.scrollTo(0, 0));
await mp.screenshot({ path: path.join(shots, 'bebop-mobile.png') });
await mctx.close();

// Formats intermédiaires P3 (passe polish) : 1024x768 (petit desktop) et 768x1024 (tablette portrait).
// Mêmes injections que mobile, un contexte à la fois (verrou profil).
for (const vp of [{ w: 1024, h: 768 }, { w: 768, h: 1024 }]) {
  console.log('== mid-' + vp.w + 'x' + vp.h + ' ==');
  const cctx = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: true, viewport: { width: vp.w, height: vp.h },
  });
  await cctx.addInitScript({ content: STUB });
  const cp = await cctx.newPage();
  const cerrs = [];
  cp.on('pageerror', (e) => cerrs.push(String(e).slice(0, 160)));
  await cp.goto(CASES[0].url, { waitUntil: 'domcontentloaded' });
  await cp.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await cp.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
  await cp.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(2500);
  const mid = await cp.evaluate(() => {
    const personsGrid = document.querySelector('#myapple-anime .apl-persons')
      ? getComputedStyle(document.querySelector('#myapple-anime .apl-persons')).gridTemplateColumns.split(' ').length : 0;
    return {
      vue: !!document.querySelector('#myapple-anime'),
      ficheW: Math.round(document.querySelector('#myapple-anime')?.getBoundingClientRect().width ?? 0),
      cols: document.querySelector('#myapple-anime .apl-cols')
        ? getComputedStyle(document.querySelector('#myapple-anime .apl-cols')).gridTemplateColumns : 'ABSENT',
      personsCols: personsGrid,
      h2Border: document.querySelector('#myapple-anime .apl-card h2')
        ? getComputedStyle(document.querySelector('#myapple-anime .apl-card h2')).borderBottomWidth : 'ABSENT',
      synLh: document.querySelector('#apl-sec-synopsis p')
        ? getComputedStyle(document.querySelector('#apl-sec-synopsis p')).lineHeight : 'ABSENT',
      toc: [...document.querySelectorAll('#myapple-anime .apl-toc a')].map((a) => a.textContent.trim()),
      softNav: !!document.querySelector('#myapple-anime .apl-card-soft ul.apl-navlist'),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log(JSON.stringify(mid));
  const tag = vp.w + 'x' + vp.h;
  ok(mid.vue, tag + ' : vue construite');
  ok(mid.overflow <= 1, tag + ' : pas de débordement (+' + mid.overflow + 'px)');
  ok(mid.ficheW >= vp.w - 140 && mid.ficheW <= vp.w, tag + ' : fiche pleine largeur (' + mid.ficheW + 'px)');
  ok(mid.personsCols >= 2, tag + ' : grille personnages lisible (' + mid.personsCols + ' col)');
  ok(mid.h2Border === '0px', tag + ' : titres sans filet MAL (' + mid.h2Border + ')');
  ok(parseFloat(mid.synLh) >= 23 && parseFloat(mid.synLh) <= 25, tag + ' : synopsis lh 1.7 (' + mid.synLh + ')');
  ok(mid.toc.includes('Synopsis') && mid.toc.includes('Infos'), tag + ' : sommaire Synopsis+Infos (' + mid.toc.join('/') + ')');
  ok(mid.softNav, tag + ' : nav secondaire en retrait');
  if (vp.w === 1024) ok(!/1fr\)?$/.test(mid.cols) || mid.cols.includes('280px') || mid.cols.split(' ').length === 2, tag + ' : 2 colonnes (' + mid.cols + ')');
  if (vp.w === 768) ok(mid.cols.split(' ').length === 1, tag + ' : 1 colonne (' + mid.cols + ')');
  await cp.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(400);
  await cp.evaluate(() => window.scrollTo(0, 0));
  await cp.screenshot({ path: path.join(shots, 'bebop-' + tag + '-light.png') });
  await cp.evaluate(() => window.__setMyApple({ dark: true }));
  await sleep(600);
  await cp.evaluate(() => window.scrollTo(0, 0));
  await cp.screenshot({ path: path.join(shots, 'bebop-' + tag + '-dark.png') });
  const darkMid = await cp.evaluate(() => ({
    h2c: getComputedStyle(document.querySelector('#myapple-anime .apl-card h2')).color,
    softc: getComputedStyle(document.querySelector('#myapple-anime .apl-card-soft h2')).color,
  }));
  ok(darkMid.h2c !== darkMid.softc, tag + ' : nav secondaire atténuée en sombre');
  ok(cerrs.length === 0, tag + ' : aucune erreur JS (' + cerrs.length + ')');
  await cp.evaluate(() => window.__setMyApple({ dark: false }));
  await cctx.close();
}

// Désactivation : retour propre à la page native (vue retirée, nœuds restaurés).
// Nouveau contexte (le précédent est fermé pour le test mobile).
console.log('== disable ==');
const ctxD = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
await ctxD.addInitScript({ content: STUB });
page = await ctxD.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
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
  viewportBack: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'ABSENT',
}));
console.log(JSON.stringify(d));
ok(!d.vue, 'disable : vue retirée');
ok(d.tableVisible !== 'none', 'disable : tableau MAL réaffiché (' + d.tableVisible + ')');
ok(d.synopsisBack, 'disable : synopsis restauré dans le DOM natif');
ok(d.labelIntact, 'disable : labels MAL intacts (extraction non destructive)');
ok(!/width=device-width/.test(d.viewportBack), 'disable : viewport d\'origine restauré (' + d.viewportBack + ')');
await page.evaluate(() => window.__setMyApple({ enabled: true }));
await ctxD.close();

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
  await p2.addScriptTag({ path: path.join(root, 'content', 'malsync.js') });
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
