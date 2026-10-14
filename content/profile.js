// Profil : EXTRACTION + RECONSTRUCTION (audit 2026-10). readProfile() lit le
// DOM MAL en objet propre ; buildProfileView() dessine notre mise en page.
// Aucun noeud MAL deplace (fini debordement Navigation + carte-dans-carte).
// Echec silencieux = page native intacte.
(() => {
const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const N = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";
const SFR = { Watching: "En cours", Reading: "En cours", Completed: "Termines", "On-Hold": "En pause", Dropped: "Abandonnes", "Plan to Watch": "A voir", "Plan to Read": "A lire" };
const TFR = { "Total Entries": "Total", Rewatched: "Revisionnes", Reread: "Relus", Episodes: "Episodes", Chapters: "Chapitres", Volumes: "Tomes" };
const STFR = { "Last Online": "Derniere visite", Gender: "Genre", Location: "Lieu", Joined: "Membre depuis" };
const GFR = { Male: "Homme", Female: "Femme" };
const NAVFR = { Statistics: "Statistiques", History: "Historique", Favorites: "Favoris", Reviews: "Critiques", "Forum Posts": "Messages", Recommendations: "Recos", "Interest Stacks": "Stacks", "Blog Posts": "Blog", Clubs: "Clubs", Friends: "Amis" };

function readProfile(left, right) {
  const name = (location.pathname.match(/^\/profile\/([^/]+)/)?.[1] || "Profil").slice(0, 30);
  const avatar = IMG(left.querySelector(".user-image img"));
  const meta = [], navLinks = [];
  left.querySelectorAll("ul.user-status li").forEach((li) => {
    const a = li.querySelector("a[href]");
    // Compteurs collés ("Forum Posts0") : le chiffre vit dans .user-status-data.
    // Certains liens (Clubs) n'ont pas de .user-status-data : compteur en queue de texte.
    if (a) {
      const n = li.querySelector(".user-status-data");
      let raw = T(a);
      let count = N(n?.textContent);
      if (!n) {
        const m = raw.match(/^(.*?)(\d+)\s*$/);
        if (m) { raw = m[1].trim(); count = parseFloat(m[2]); }
      } else raw = raw.replace(T(n), "").trim();
      navLinks.push({ label: NAVFR[raw] || raw, count, href: a.href });
      return;
    }
    const label = T(li.querySelector(".user-status-title"));
    const value = T(li.querySelector(".user-status-data"));
    if (label && value) meta.push({ label: STFR[label] || label, value: GFR[value] || value, raw: label });
  });
  const online = meta.some((m) => m.raw === "Last Online" && /now/i.test(m.value));
  // Actions : listes + pages clés, CHERCHÉES DANS LA SIDEBAR (.user-profile) —
  // jamais dans les stats (chaque statut répète /animelist/?status=N -> 5 doublons).
  // NOTE QA 2026-10-15 : la sidebar connectée ne contient QUE "Anime List"
  // (pas Manga/Stats/History) — hrefs construits depuis le pseudo, même origine.
  const actions = [], seenLabel = new Set();
  const scope = left.querySelector(".user-profile") || left;
  const pushAction = (label, href) => {
    if (seenLabel.has(label) || !href) return;
    seenLabel.add(label);
    actions.push({ label, href });
  };
  scope.querySelectorAll(":scope a[href]").forEach((a) => {
    const h = a.href;
    if (!/animelist\/[^/]+\/?(\?.*)?$|mangalist\/[^/]+\/?(\?.*)?$|\/statistics\/?$|\/history\/[^/]+\/?$|\/favorites\/?$/.test(h)) return;
    const label = /animelist/.test(h) ? "Anime list" : /mangalist/.test(h) ? "Manga list" : /statistics/.test(h) ? "Stats" : /history/.test(h) ? "Historique" : "Favoris";
    pushAction(label, h.split("?")[0]);
  });
  // Filet : listes construites depuis le pseudo (même origine, pas d'API externe).
  const m = (location.pathname.match(/^\/profile\/([^/]+)/)?.[1] || "").replace(/\/$/, "");
  if (m && !/^\d+$/.test(m)) {
    pushAction("Anime list", `https://myanimelist.net/animelist/${m}`);
    pushAction("Manga list", `https://myanimelist.net/mangalist/${m}`);
  }
  const statsFor = (kind) => {
    const st = right.querySelector(".stats." + kind);
    if (!st) return null;
    const flat = T(st);
    const statuses = [...st.querySelectorAll("ul.stats-status li")].map((li) => {
      const raw = T(li.querySelector("a"));
      return { label: SFR[raw] || raw, count: N(li.querySelector("span:last-child")?.textContent ?? li.textContent), href: li.querySelector("a")?.href || "" };
    }).filter((s) => s.label);
    const totals = [...st.querySelectorAll("ul.stats-data li")].map((li) => {
      const sp = li.querySelectorAll("span");
      return { label: TFR[T(sp[0])] || T(sp[0]), value: N(sp[1]?.textContent ?? li.textContent) };
    }).filter((t) => t.label);
    const total = totals.find((t) => t.label === "Total")?.value || statuses.reduce((n, s) => n + s.count, 0);
    const done = statuses.find((s) => s.label === "Termines")?.count || 0;
    return { days: N((flat.match(/Days:\s*([\d.,]+)/) || [])[1]), mean: N((flat.match(/Mean Score:\s*([\d.,]+)/) || [])[1]), statuses, totals, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  };
  const updatesFor = (kind) => {
    const box = right.querySelector(".updates." + kind);
    if (!box) return { restricted: false, items: [] };
    if (/restricted by the owner/i.test(T(box)) && !box.querySelector(".statistics-updates")) return { restricted: true, items: [] };
    return { restricted: false, items: [...box.querySelectorAll(".statistics-updates")].slice(0, 6).map((u) => {
      const link = u.querySelector(".data > a") || u.querySelector("a");
      const title = T(link);
      return { img: IMG(u.querySelector("img")), title, href: link?.href || "", meta: T(u.querySelector(".data")).replace(title, "").trim().slice(0, 90), kind };
    }) };
  };
  const favAll = right.querySelector('a[href$="/favorites"]')?.href || "";
  const favorites = [...right.querySelectorAll('[id$="_favorites"]')].map((el) => {
    let h = el.previousElementSibling;
    while (h && h.tagName !== "H5") h = h.previousElementSibling;
    const items = [...el.querySelectorAll("li.btn-fav")].slice(0, 12).map((li) => ({
      title: li.getAttribute("title") || T(li.querySelector(".title")),
      sub: T(li.querySelector(".users")), href: li.querySelector("a")?.href || "", img: IMG(li.querySelector("img")),
    })).filter((f) => f.title && f.img);
    return { key: el.id.replace("_favorites", ""), label: T(h).replace(/\s*\(\d+\)\s*$/, "") || el.id, items };
  }).filter((f) => f.items.length);
  const friendsEl = left.querySelector(".user-friends");
  const clubsA = [...left.querySelectorAll("a[href]")].find((a) => /\/clubs\/?$/.test(a.href));
  let clubs = null;
  if (clubsA) {
    const li = clubsA.closest("li");
    const n = li?.querySelector(".user-status-data");
    let raw = T(clubsA).replace(n ? T(n) : "", "").trim();
    let count = N(n?.textContent);
    if (!n) { const m = raw.match(/^(.*?)(\d+)\s*$/); if (m) { raw = m[1].trim(); count = parseFloat(m[2]); } }
    clubs = { label: (NAVFR[raw] || raw || "Clubs") + (count ? ` · ${count}` : ""), href: clubsA.href };
  }
  const commentsNode = right.querySelector("#lastcomment");
  return {
    name, avatar, online, navLinks, actions, favorites, favAll, commentsNode,
    meta: meta.filter((m) => m.raw !== "Last Online"),
    anime: statsFor("anime"), manga: statsFor("manga"),
    updAnime: updatesFor("anime"), updManga: updatesFor("manga"),
    locked: commentsNode ? /login|sign up/i.test(T(commentsNode)) : true,
    friends: friendsEl ? T(friendsEl).slice(0, 120) : "",
    clubs,
    bioNode: right.querySelector(".user-profile-about"),
  };
}
function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function card(parent, title, href) {
  const s = el("section", "apl-card", parent);
  const h = el("header", null, s);
  el("h2", null, h, title);
  if (href) { const a = el("a", null, h, "Tout voir"); a.href = href; }
  return el("div", "apl-card-body", s);
}
// "May 10, 2019" -> "10 mai 2019" (Intl, repli = valeur brute si illisible).
function frDate(s) {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  try { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(t); } catch { return s; }
}
function hero(view, d) {
  const sec = view.querySelector(".apl-hero");
  const banner = view.querySelector(".apl-banner");
  const firstImg = d.favorites[0]?.items[0]?.img || "";
  if (firstImg) { const im = new Image(); im.onload = () => { banner.style.backgroundImage = `url("${firstImg}")`; }; im.src = firstImg; }
  const main = view.querySelector(".apl-hero-main");
  if (d.avatar) { const p = el("div", "apl-avatar", main); const im = el("img", null, p); im.src = d.avatar; im.alt = d.name; im.loading = "lazy"; }
  const who = el("div", "apl-who", main);
  const h1 = el("h1", null, who, d.name);
  if (d.online) el("span", "apl-online", h1, "En ligne");
  const meta = el("div", "apl-meta", who);
  d.meta.slice(0, 4).forEach((m) => {
    const v = /membre depuis/i.test(m.label) ? frDate(m.value) : m.value;
    el("span", null, meta, `${m.label} : ${v}`);
  });
  const act = el("div", "apl-actions", who);
  d.actions.forEach((a) => { const b = el("a", "apl-btn", act, a.label); b.href = a.href; });
  const kpis = el("div", "apl-kpis", sec);
  const kpi = (v, l, href) => {
    const k = el(href ? "a" : "div", "apl-kpi", kpis);
    if (href) k.href = href;
    el("b", null, k, String(v));
    el("span", null, k, l);
  };
  if (d.anime) {
    kpi(d.anime.total.toLocaleString("fr-FR"), "Animes");
    kpi(d.anime.days.toLocaleString("fr-FR"), "Jours");
    kpi(String(d.anime.mean).replace(".", ","), "Note moy.");
    const k = el("div", "apl-kpi apl-kpi-bar", kpis);
    el("b", null, k, d.anime.pct + " %");
    el("span", null, k, "Terminés");
    const bar = el("div", "apl-bar", k);
    el("i", null, bar).style.width = Math.min(100, d.anime.pct) + "%";
  }
}
// Stats reconstruites : statuts FR + barrettes + totaux (plus de floats MAL).
function stats(body, st, kind) {
  const g = el("div", "apl-statrows", body);
  st.statuses.forEach((s) => {
    const r = el(s.href ? "a" : "div", "apl-srow", g);
    if (s.href) r.href = s.href;
    el("span", null, r, s.label);
    el("b", null, r, s.count.toLocaleString("fr-FR"));
    const bar = el("div", "apl-bar apl-bar-" + kind, r);
    el("i", null, bar).style.width = (st.total ? Math.round((s.count / st.total) * 100) : 0) + "%";
  });
  const t = el("dl", "apl-totals", body);
  st.totals.slice(0, 4).forEach((x) => { el("dt", null, t, x.label); el("dd", null, t, x.value.toLocaleString("fr-FR")); });
}
// Favoris : grille d'affiches 3:2, titre au survol (natif title, clavier OK).
function favs(main, d) {
  if (!d.favorites.length) return;
  const body = card(main, "Favoris", d.favAll);
  d.favorites.slice(0, 4).forEach((f) => {
    el("h3", "apl-favtitle", body, f.label);
    const gr = el("div", "apl-favgrid", body);
    f.items.forEach((x) => {
      const a = el("a", "apl-fav", gr);
      a.href = x.href; a.title = x.title + (x.sub ? ` — ${x.sub}` : "");
      const im = el("img", null, a);
      im.src = x.img; im.alt = ""; im.loading = "lazy";
    });
  });
}
// Activite : timeline au lieu des lignes MAL ; message FR si liste restreinte.
function activity(side, upd, title) {
  if (!upd.items.length && !upd.restricted) return;
  const body = card(side, title);
  if (upd.restricted) { el("p", "apl-muted", body, "Liste privée — le membre a restreint l’accès."); return; }
  const tl = el("ol", "apl-tl", body);
  upd.items.forEach((u) => {
    const li = el("li", null, tl);
    if (u.img) { const im = el("img", null, li); im.src = u.img; im.alt = ""; im.loading = "lazy"; }
    const tx = el("div", null, li);
    const a = el("a", null, tx, u.title);
    if (u.href) a.href = u.href;
    if (u.meta) el("span", "apl-muted", tx, u.meta);
  });
}
// Assemblage : hero + bio + stats + favoris (colonne) / navigation + activite (lateral).
function buildProfileView() {
  if (document.getElementById("myapple-profile")) return;
  if (!/^\/profile\/[^/]+\/?$/.test(location.pathname)) return;
  const left = document.querySelector("#content .container-left");
  const right = document.querySelector("#content .container-right");
  if (!left || !right) return;
  let d;
  try { d = readProfile(left, right); } catch { return; }
  if (!d || (!d.anime && !d.manga && !d.favorites.length)) return;
  try {
    const view = el("div", null, null);
    view.id = "myapple-profile";
    const sec = el("section", "apl-hero", view);
    el("div", "apl-banner", sec, null).setAttribute("aria-hidden", "true");
    el("div", "apl-hero-main", sec);
    el("div", "apl-cols", view);
    const cols = view.querySelector(".apl-cols");
    el("div", "apl-col-main", cols);
    el("div", "apl-col-side", cols);
    const main = view.querySelector(".apl-col-main");
    const side = view.querySelector(".apl-col-side");
    hero(view, d);
    if (d.bioNode && T(d.bioNode).trim()) {
      const bio = card(main, "À propos");
      bio.appendChild(d.bioNode);
    }
    if (d.anime) stats(card(main, "Anime"), d.anime, "anime");
    if (d.manga) stats(card(main, "Manga"), d.manga, "manga");
    favs(main, d);
    if (d.navLinks.length) {
      const nb = card(side, "Navigation");
      const ul = el("ul", "apl-navlist", nb);
      // NAVFR couvre les liens sidebar ; ceux déjà présents dans le hero
      // (listes + pages clés) sont retirés ici pour éviter le doublon.
      const skip = new Set(d.actions.map((a) => a.href.replace(/\/$/, "")));
      const extra = (d.favAll ? [{ label: "Favoris", count: 0, href: d.favAll }] : []).filter((n) => !skip.has(n.href.replace(/\/$/, "")));
      d.navLinks
        .filter((n) => !skip.has(n.href.replace(/\/$/, "")))
        .concat(extra)
        .slice(0, 8)
        .forEach((n) => {
        const li = el("li", null, ul);
        const a = el("a", null, li, n.count ? `${n.label} · ${n.count}` : n.label);
        a.href = n.href;
      });
    }
    if (d.friends || d.clubs) {
      const cb = card(side, "Communauté");
      if (d.friends) el("p", "apl-muted", cb, d.friends);
      if (d.clubs) { const a = el("a", null, cb, d.clubs.label); a.href = d.clubs.href; }
    }
    activity(side, d.updAnime, "Activité anime");
    activity(side, d.updManga, "Activité manga");
    if (d.commentsNode && !d.locked && T(d.commentsNode).trim()) {
      const cm = card(main, "Commentaires");
      cm.appendChild(d.commentsNode);
    }
    const container = document.querySelector("#content .content-container");
    container?.parentNode?.insertBefore(view, container);
    document.body.classList.add("myapple-profile");
  } catch {
    document.getElementById("myapple-profile")?.remove();
    document.body.classList.remove("myapple-profile");
  }
}
window.__myappleProfile = { readProfile, buildProfileView };
})();
