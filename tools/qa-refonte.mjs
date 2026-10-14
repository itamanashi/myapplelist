// QA refonte profil : injecte profile.js + content.js + overlay.css dans le vrai DOM MAL.
import { chromium } from 'playwright';
import path from 'node:path';
const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const profile = path.join(shots, 'profile-logged');
const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false,panelOpen:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome={storage:{local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{const c={};for(const[k,v]of Object.entries(o)){c[k]={oldValue:store[k],newValue:v};store[k]=v}lis.forEach(f=>{try{f(c)}catch(e){}})}},onChanged:{addListener:(f)=>lis.add(f)}}};})();`;
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
await ctx.addInitScript({ content: STUB });
const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
const me = 'itaminashi';
await page.goto(`https://myanimelist.net/profile/${me}`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
await page.addScriptTag({ path: path.join(root, 'content', 'profile.js') });
await page.addScriptTag({ path: path.join(root, 'content', 'content.js') });
await sleep(2000);
const rep = await page.evaluate(() => ({
  vue: !!document.querySelector('#myapple-profile'),
  h1: document.querySelector('#myapple-profile h1')?.textContent?.slice(0, 40) ?? 'ABSENT',
  kpis: [...document.querySelectorAll('#myapple-profile .apl-kpi > b')].map((b) => b.textContent.trim()),
  favs: document.querySelectorAll('#myapple-profile .apl-fav').length,
  favTitles: [...document.querySelectorAll('#myapple-profile .apl-favtitle')].map((h) => h.textContent.trim()),
  nav: document.querySelectorAll('#myapple-profile .apl-navlist a').length,
  navLabels: [...document.querySelectorAll('#myapple-profile .apl-navlist a')].map((a) => a.textContent.trim()),
  actions: [...document.querySelectorAll('#myapple-profile .apl-actions a')].map((a) => a.textContent.trim()),
  srows: document.querySelectorAll('#myapple-profile .apl-srow').length,
  timeline: document.querySelectorAll('#myapple-profile .apl-tl > li').length,
  oldContainerVisible: (() => { const c = document.querySelector('#content .content-container'); return c ? getComputedStyle(c).display : 'ABSENT'; })(),
}));
console.log(JSON.stringify(rep, null, 2));
await page.evaluate(() => window.__setMyApple({ dark: false }));
await sleep(500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, 'refonte-profile-light.png') });
await page.evaluate(() => window.scrollTo(0, 1200));
await sleep(300);
await page.screenshot({ path: path.join(shots, 'refonte-profile-light-bas.png') });
await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(700);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(shots, 'refonte-profile-dark.png') });
await ctx.close();
console.log('TERMINE', shots);
