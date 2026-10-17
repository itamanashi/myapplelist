// Diag trigger mylist live : quel bouton ouvre .js-mylist ?
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto("https://myanimelist.net/anime/season", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));
console.log(await page.evaluate(() => {
  const out = {};
  const row = document.querySelector(".horiznav-nav-seasonal");
  out.rowChildren = [...row.children].map((n) => (n.tagName + "." + String(n.className).split(" ").slice(0, 3).join(".") + " [" + (n.dataset?.id || n.id || "?") + "]").slice(0, 90));
  const my = row.querySelector(".js-mylist");
  out.mylistPrev = my?.previousElementSibling ? (my.previousElementSibling.tagName + "." + String(my.previousElementSibling.className).slice(0, 60)) : "none";
  out.mylistDisplay = getComputedStyle(my).display;
  return JSON.stringify(out, null, 1);
}));
await browser.close();
