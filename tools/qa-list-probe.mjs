// Probe animelist / mangalist : clés réelles de data-items + load.json.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const root = `C:\\Users\\NOM\\Desktop\\Nouveaudossier\\code\\myapplelist`;
const shots = `C:\\Users\\NOM\\AppData\\Local\\Temp\\opencode\\shots`;
const profileLogged = path.join(shots, 'profile-logged');
const profileRepo = path.join(root, '.chrome-profile');
const PROFILE_DIR = fs.existsSync(profileLogged) ? profileLogged : profileRepo;
const me = 'itaminashi';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

function summarize(item, kind) {
  if (!item) return null;
  const img = item.anime_image_path || item.manga_image_path || item.image_path || '';
  return {
    id: item.anime_id ?? item.manga_id ?? item.id,
    title: item.anime_title ?? item.manga_title ?? item.title,
    score: item.score,
    status: item.status,
    type: item.anime_media_type_string ?? item.manga_media_type_string ?? item.media_type,
    year: item.anime_start_date_string ?? item.manga_start_date_string ?? item.start_date_string,
    updated_at: item.updated_at,
    episodes: item.num_watched_episodes ?? item.num_read_chapters,
    total: item.anime_num_episodes ?? item.manga_num_chapters,
    volumes: item.num_read_volumes ?? item.manga_num_volumes,
    img,
    hasSizeSuffix: /\/[a-z]\d+x\d+/.test(img) || /\.(jpg|webp)\?s=/.test(img) || /t\.jpg|l\.jpg|_thumb|_small/i.test(img),
    genres: item.genres,
    studios: item.anime_studios ?? item.manga_magazines,
    tags: item.tags,
  };
}

for (const kind of ['animelist', 'mangalist']) {
  await page.goto(`https://myanimelist.net/${kind}/${me}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(async (kind) => {
    const t = document.querySelector('table.list-table');
    let items = [];
    try { items = JSON.parse(t?.getAttribute('data-items') || '[]'); } catch { items = []; }
    const privateMsg = document.querySelector('.list-table, .ownlist, #content')?.textContent?.slice(0, 240) || '';
    const r = await fetch(`/${kind}/${location.pathname.split('/')[2]}/load.json?offset=300&status=7`, { credentials: 'include' });
    let more = [];
    let loadErr = null;
    try { more = r.ok ? await r.json() : []; } catch (e) { loadErr = String(e); }
    const imgKeys = Object.keys(items[0] || {}).filter((k) => /image|poster|path/i.test(k));
    const statuses = [...new Set(items.map((x) => x.status))];
    const scores = items.map((x) => Number(x.score)).filter((n) => n > 0);
    const zeros = items.filter((x) => Number(x.score) === 0).length;
    const unknownTotal = items.filter((x) => {
      const tot = x.anime_num_episodes ?? x.manga_num_chapters ?? 0;
      return Number(tot) === 0;
    }).length;
    return {
      n: items.length,
      keys: Object.keys(items[0] || {}),
      sample: items[0] || null,
      loadStatus: r.status,
      loadN: Array.isArray(more) ? more.length : typeof more,
      loadErr,
      loadKeys: Object.keys((Array.isArray(more) ? more[0] : more) || {}),
      loadSample: Array.isArray(more) ? more[0] : more,
      tablePresent: !!t,
      imgKeys,
      statuses,
      scoreMin: scores.length ? Math.min(...scores) : null,
      scoreMax: scores.length ? Math.max(...scores) : null,
      scored: scores.length,
      unrated: zeros,
      unknownTotal,
      listOwner: document.querySelector('.header-list .username, .list-unit .username, h1')?.textContent?.trim()?.slice(0, 80) || null,
      privateHint: /private|restricted|this list/i.test(privateMsg),
    };
  }, kind);
  info.sampleSummary = summarize(info.sample, kind);
  info.loadSummary = summarize(info.loadSample, kind);
  await page.screenshot({ path: path.join(shots, `probe-${kind}-native.png`) });
  console.log(kind, JSON.stringify(info, null, 2));
}

await page.goto(`https://myanimelist.net/profile/${me}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const updates = await page.evaluate(() => {
  const u = document.querySelector('.statistics-updates');
  if (!u) return { present: false };
  return {
    present: true,
    htmlSlice: u.innerHTML.slice(0, 800),
    hasGraph: !!u.querySelector('.graph, .graph-content, .graph-inner'),
    dataText: (u.querySelector('.data')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  };
});
console.log('profile-updates', JSON.stringify(updates, null, 2));
await ctx.close();
console.log('PROFILE_DIR', PROFILE_DIR);
console.log('TERMINE', shots);
