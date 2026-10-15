// node tools/test-anime-parse.mjs — parsePerson/personCard sur fixture hors-ligne.
// Couvre : personne avec lien, sans lien (carte texte), nom manquant (null),
// structure HTML inattendue (null, sans crash), rendu carte avec/sans href.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
await page.setContent(`<body><div id="fx">
<table id="t-link"><tbody><tr>
<td><a href="https://myanimelist.net/people/2009/X"><img alt="Nom, Test" data-src="https://cdn.myanimelist.net/img.jpg"></a></td>
<td><a href="https://myanimelist.net/people/2009/X">Nom, Test</a><div><small>Director</small></div></td>
</tr></tbody></table>
<table id="t-nolink"><tbody><tr>
<td><img alt="Sans Lien, Person" src="https://cdn.myanimelist.net/nolink.jpg"></td>
<td>Sans Lien, Person<div><small>Producer</small></div></td>
</tr></tbody></table>
<table id="t-noname"><tbody><tr>
<td><img src="https://cdn.myanimelist.net/unknown.jpg"></td>
<td><div><small>Producer</small></div></td>
</tr></tbody></table>
<table id="t-weird"><tbody><tr><td></td><td>   </td></tr></tbody></table>
<table id="t-va"><tbody><tr>
<td><a href="https://myanimelist.net/character/1/Y"><img alt="Perso, Test" data-src="https://cdn.myanimelist.net/c.jpg"></a></td>
<td><a href="https://myanimelist.net/character/1/Y">Perso, Test</a><div><small>Main</small></div></td>
<td><div><small>Japanese</small></div><a href="https://myanimelist.net/people/2/Z">Doubleur, Test</a></td>
<td><a href="https://myanimelist.net/people/2/Z"><img alt="Doubleur, Test" data-src="https://cdn.myanimelist.net/v.jpg"></a></td>
</tr></tbody></table>
</div><div id="cards"></div></body>`);
await page.addScriptTag({ path: path.join(root, "content", "anime-view.js") });

const r = await page.evaluate(() => {
  const P = window.__myappleAnime._parsePerson;
  const C = window.__myappleAnime._personCard;
  const g = (id) => document.getElementById(id);
  const out = {
    link: P(g("t-link")),
    nolink: P(g("t-nolink")),
    noname: P(g("t-noname")),
    weird: P(g("t-weird")),
    nil: P(null),
    notable: P(g("cards")),
    va: P(g("t-va")),
  };
  const box = g("cards");
  C(box, { img: "x.jpg", name: "Avec Lien", href: "https://example.com/", sub: "Main" }, false);
  C(box, { img: "", name: "Sans Lien", href: "", sub: "Producer" }, false);
  out.renderLink = box.children[0].querySelector(":scope > a")?.getAttribute("href") || null;
  out.renderText = box.children[1].querySelector(":scope > span.apl-static") ? box.children[1].querySelector("b").textContent : null;
  out.renderTextAnchor = !!box.children[1].querySelector("a");
  return out;
});

// 1. Personne avec lien : extraction complète, inchangée
assert.equal(r.link.name, "Nom, Test");
assert.equal(r.link.href, "https://myanimelist.net/people/2009/X");
assert.equal(r.link.sub, "Director");
assert.equal(r.link.img, "https://cdn.myanimelist.net/img.jpg");
assert.equal(r.link.va, undefined);
// 2. Sans lien mais identifiable (alt) : carte texte, href vide, rôle conservé
assert.equal(r.nolink.name, "Sans Lien, Person");
assert.equal(r.nolink.href, "");
assert.equal(r.nolink.sub, "Producer");
// 3. Nom manquant (ni lien ni alt) : rejetée, pas de nom inventé depuis le rôle
assert.equal(r.noname, null);
// 4. Structure inattendue : rejetée sans crash (cellules vides, conteneur, null)
assert.equal(r.weird, null);
assert.equal(r.nil, null);
assert.equal(r.notable, null);
// 5. Doubleur : branche VA conservée
assert.equal(r.va.name, "Perso, Test");
assert.equal(r.va.va.name, "Doubleur, Test");
assert.equal(r.va.va.lang, "Japanese");
// 6. Rendu : lien réel vs carte texte (span, aucun <a>)
assert.equal(r.renderLink, "https://example.com/");
assert.equal(r.renderText, "Sans Lien");
assert.equal(r.renderTextAnchor, false);

await browser.close();
console.log("OK — parse anime : 6 cas (lien, sans-lien, sans-nom, inattendu, VA, rendu).");
