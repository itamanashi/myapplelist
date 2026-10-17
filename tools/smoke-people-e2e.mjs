// Smoke e2e people-view : page MAL remplacée par le HTML en cache via route,
// URL réelle (route), buildPeopleView + destroyPeopleView.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const root = "C:/Users/NOM/Desktop/Nouveaudossier/code/myapplelist";
const html = fs.readFileSync(process.env.TEMP + "/opencode/people.html", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
await page.route("**/people/2009/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
await page.goto("https://myanimelist.net/people/2009/Shinichirou_Watanabe", { waitUntil: "domcontentloaded" });
await page.addScriptTag({ path: path.join(root, "content", "people-view.js") });
const r = await page.evaluate(() => {
  const P = window.__myapplePeople;
  const d = P.readPeople();
  P.buildPeopleView();
  const view = document.getElementById("myapple-people");
  const summary = view ? {
    hero: !!view.querySelector(".apl-hero"),
    h1: view.querySelector(".apl-who h1")?.textContent,
    nameJp: view.querySelector(".apl-alt")?.textContent,
    portrait: !!view.querySelector(".apl-poster img"),
    kpis: [...view.querySelectorAll(".apl-kpi")].map((k) => k.textContent?.trim()),
    cards: [...view.querySelectorAll(".apl-card > header > h2")].map((h) => h.textContent),
    bioMoved: !!view.querySelector(".apl-sec-bio .people-informantion-more"),
    worksFirst: view.querySelector(".apl-work-title")?.textContent,
    infos: view.querySelectorAll(".apl-infos dt").length,
    bodyClass: document.body.classList.contains("myapple-people"),
    viewFirst: document.querySelector("#content")?.firstElementChild?.id,
  } : null;
  P.destroyPeopleView();
  const after = {
    viewGone: !document.getElementById("myapple-people"),
    bioRestored: !!document.querySelector("#content .people-informantion-more"),
    bioBackHome: !!document.querySelector("#content .people-informantion-more")?.closest("td, #content") &&
      !document.querySelector("#content .apl-sec-bio"),
    bodyClassGone: !document.body.classList.contains("myapple-people"),
  };
  P.buildPeopleView();
  const rebuilt = !!document.getElementById("myapple-people");
  P.destroyPeopleView();
  return { data: { name: d.name, nameJp: d.nameJp, id: d.id, url: d.url?.pathname || d.url }, summary, after, rebuilt };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
