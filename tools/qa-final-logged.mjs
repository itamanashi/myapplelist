// QA finale connectée : profil persistant (consent OK) + vrais content.js/CSS finaux.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const profile = path.join(shots, 'profile-logged');
const STUB = `(()=>{const KEY='myapple_state_v1';const store={[KEY]:{enabled:true,dark:false,panelOpen:false}};const lis=new Set();window.__setMyApple=async(p)=>{const o={...store[KEY]};store[KEY]={...store[KEY],...p};const c={[KEY]:{oldValue:o,newValue:{...store[KEY]}}};lis.forEach(f=>{try{f(c)}catch(e){}})};window.chrome={storage:{local:{get:async(k)=>(typeof k==='string'?{[k]:store[k]}:{...store}),set:async(o)=>{const c={};for(const[k,v]of Object.entries(o)){c[k]={oldValue:store[k],newValue:v};store[k]=v}lis.forEach(f=>{try{f(c)}catch(e){}})}},onChanged:{addListener:(f)=>lis.add(f)}}};})();`;
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
await ctx.addInitScript({ content: STUB });
const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
async function inject() {
  await page.addStyleTag({ path: path.join(root, 'content', 'overlay.css') });
  await page.addScriptTag({ path: path.join(root, 'content', 'content.js') });
  await sleep(1500);
}
await page.goto('https://myanimelist.net/', { waitUntil: 'domcontentloaded' });
await sleep(1200);
await inject();
console.log('login:', await page.evaluate(() => !!document.querySelector('#headerSmall .header-profile-link, #header-menu .header-profile-link')));
console.log('pastille:', await page.evaluate(() => document.querySelector('#myapple-account-link .avatar-name')?.textContent ?? 'ABSENTE'));
await sleep(2200);
console.log('avatar:', await page.evaluate(() => { const i = document.getElementById('myapple-avatar'); return i && !i.hidden ? i.src.slice(0, 70) : 'initiale'; }));
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => window.__setMyApple({ dark: false }));
await sleep(500);
await page.screenshot({ path: path.join(shots, 'final-logged-home-light.png') });
await page.evaluate(() => window.__setMyApple({ dark: true }));
await sleep(700);
await page.screenshot({ path: path.join(shots, 'final-logged-home-dark.png') });
const me = await page.evaluate(() => document.querySelector('#myapple-account-link .avatar-name')?.textContent?.trim());
console.log('pseudo:', me);
if (me) {
  await page.goto(`https://myanimelist.net/profile/${encodeURIComponent(me)}`, { waitUntil: 'domcontentloaded' });
  await inject();
  console.log('vue profil:', await page.evaluate(() => !!document.querySelector('#myapple-profile .apl-hero')));
  await page.evaluate(() => window.__setMyApple({ dark: false }));
  await sleep(500);
  console.log('h2 ink:', await page.evaluate(() => { const h = document.querySelector('#myapple-profile .apl-card > header h2'); return h ? getComputedStyle(h).color : 'no-h2'; }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, 'final-logged-profile-light.png') });
  await page.evaluate(() => window.__setMyApple({ dark: true }));
  await sleep(700);
  await page.screenshot({ path: path.join(shots, 'final-logged-profile-dark.png') });
}
await ctx.close();
console.log('TERMINE', shots);
