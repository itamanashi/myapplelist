import { chromium } from 'playwright';
import path from 'node:path';
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const PROFILE_DIR = path.join(shots, 'profile-logged');
const me = 'itaminashi';
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { channel: 'chrome', headless: true });
const page = await ctx.newPage();
await page.goto(`https://myanimelist.net/animelist/${me}`, { waitUntil: 'domcontentloaded' });
const counts = await page.evaluate(async (me) => {
  const out = {};
  for (const kind of ['animelist', 'mangalist']) {
    let n = 0, offset = 0, pages = 0;
    for (;;) {
      const r = await fetch(`/${kind}/${me}/load.json?offset=${offset}&status=7`, { credentials: 'include' });
      const chunk = r.ok ? await r.json() : [];
      const len = Array.isArray(chunk) ? chunk.length : 0;
      n += len; pages += 1;
      if (len < 300) break;
      offset += 300;
      await new Promise((res) => setTimeout(res, 250));
    }
    out[kind] = { n, pages };
  }
  return out;
}, me);
console.log(JSON.stringify(counts, null, 2));
await ctx.close();
