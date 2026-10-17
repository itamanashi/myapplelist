// Smoke-test readPeople sur la page Watanabe (offline, HTML en cache live)
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(process.env.TEMP + "/opencode/people.html", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
await page.setContent(html, { url: "https://myanimelist.net/people/2009/Shinichirou_Watanabe" });
await page.addScriptTag({ path: path.join(root, "content", "people-view.js") });
const r = await page.evaluate(() => window.__myapplePeople.readPeople());
console.log(JSON.stringify(r, null, 2));
await browser.close();
