// QA MAL avec session persistante (cookies conservés).
// Usage:  npx playwright install chrome  (une fois, ou utilise ton Chrome via channel)
//          node tools/qa-mal.mjs [url]
// Le profil .chrome-profile/ garde login + Agree MAL entre les runs.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const userDataDir = path.join(root, '.chrome-profile');
const url = process.argv[2] ?? 'https://myanimelist.net/';

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome', // utilise ton Chrome installé, pas besoin de dl Chromium
  headless: false,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
  ],
  viewport: { width: 1440, height: 900 },
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url, { waitUntil: 'domcontentloaded' });

// Constats rapides : topbar présente ? menu ? avatar ?
await page.waitForSelector('#myapple-topbar', { timeout: 15000 });
const report = await page.evaluate(() => ({
  topbar: !!document.getElementById('myapple-topbar'),
  menus: [...document.querySelectorAll('#myapple-topbar nav .menu > a')].map((a) => a.textContent.trim()),
  drops: document.querySelectorAll('#myapple-topbar nav .drop').length,
  profile: document.getElementById('myapple-profile')?.outerHTML?.slice(0, 200) ?? null,
  agreeVisible: !!document.querySelector('[id*="consent"], [class*="consent"], [id*="agree"]'),
}));
console.log(JSON.stringify(report, null, 2));
console.log('\nProfil:', userDataDir);
console.log('Laisse la fenêtre ouverte pour rester connecté. Ctrl+C pour quitter.');
await new Promise(() => {}); // garde ouvert -> cookies sauvés à la fermeture
