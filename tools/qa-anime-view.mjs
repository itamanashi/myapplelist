// QA vue anime/manga : injecte anime-view.js + content.js + overlay.css dans le vrai DOM MAL.
import { chromium } from 'playwright';
import path from 'node:path';
const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const profile = path.join(shots, 'profile-logged');
const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome={storage:{local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{const c={};for(const[k,v]of Object.entries(o)){c[k]={oldValue:store[k],newValue:v};store[k]=v}lis.forEach(f=>{try{f(c)}catch(e){}})}},onChanged:{addListener:(f)=>lis.add(f)}}};})();`;
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
await ctx.addInitScript({ content: STUB });
const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

async function check(url, tag) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await page.addScriptTag({ path: path.join(root, 'content', 'anime-view.js') });
  await page.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(2500);
  const rep = await page.evaluate(() => ({
    vue: !!document.querySelector('#myapple-anime'),
    h1: document.querySelector('#myapple-anime h1')?.textContent?.slice(0, 50) ?? 'ABSENT',
    kpis: [...document.querySelectorAll('#myapple-anime .apl-kpi > b')].map((b) => b.textContent.trim()),
    chips: document.querySelectorAll('#myapple-anime .apl-chip').length,
    infos: document.querySelectorAll('#myapple-anime dl.apl-infos > dt').length,
    chars: document.querySelectorAll('#myapple-anime .apl-person').length,
    related: document.querySelectorAll('#myapple-anime ul.apl-related > li').length,
    nav: document.querySelectorAll('#myapple-anime ul.apl-navlist a').length,
    oldTableHidden: (() => { const t = document.querySelector('#content > table'); return t ? getComputedStyle(t).display : 'ABSENT'; })(),
    bodyClass: document.body.classList.contains('myapple-anime'),
  }));
  console.log(tag, JSON.stringify(rep, null, 2));
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, `${tag}-light.png`) });
  await page.evaluate(() => window.scrollTo(0, 1400));
  await sleep(300);
  await page.screenshot({ path: path.join(shots, `${tag}-light-bas.png`) });
  await page.evaluate(() => window.__setMyApple({ dark: true }));
  await sleep(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, `${tag}-dark.png`) });
}

await check('https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood', 'anime-fmab');
await check('https://myanimelist.net/manga/2/Berserk', 'manga-berserk');
await ctx.close();
console.log('TERMINE', shots);
