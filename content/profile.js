// Profil : EXTRACTION + RECONSTRUCTION (Refonte Premium Apple 2026).
// readProfile() extrait les données ; buildProfileView() reconstruit une mise en page fluide :
// Hero avec mesh gradient + puces méta + pilules listes unifiées,
// Statistiques avec jauge segmentée stacked (façon stockage iCloud) et sélecteur Anime/Manga,
// Favoris en grille élégante avec sous-onglets thématiques et titres,
// Navigation latérale façon Réglages iOS avec icônes et chevrons,
// Timeline d'activité enrichie en français.
(() => {
"use strict";

const T = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const N = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const IMG = (im) => im?.getAttribute("data-src") || im?.getAttribute("src") || im?.src || "";

const SFR = {
  Watching: "En cours",
  Reading: "En cours",
  Completed: "Terminés",
  "On-Hold": "En pause",
  Dropped: "Abandonnés",
  "Plan to Watch": "À voir",
  "Plan to Read": "À lire"
};

const STATUS_COLORS = {
  // Synchro avec --apl-st-* (content/css/00-tokens.css, palette audit 2026-10-15).
  "En cours": "#10b981",
  "Terminés": "#3b82f6",
  "En pause": "#f59e0b",
  "Abandonnés": "#f43f5e",
  "À voir": "#64748b",
  "À lire": "#64748b",
};

const TFR = {
  "Total Entries": "Total",
  Rewatched: "Revisionnés",
  Reread: "Relus",
  Episodes: "Épisodes",
  Chapters: "Chapitres",
  Volumes: "Tomes"
};

const STFR = {
  "Last Online": "Dernière visite",
  Gender: "Genre",
  Location: "Lieu",
  Joined: "Membre depuis"
};

const META_ICONS = {
  Genre: "👤",
  Lieu: "📍",
  "Membre depuis": "📅",
  "Dernière visite": "🕒",
};

const GFR = { Male: "Homme", Female: "Femme" };

const NAV_ICONS = {
  Statistiques: "📊",
  Historique: "🕒",
  Favoris: "⭐",
  Critiques: "✍️",
  Messages: "💬",
  Recos: "💡",
  Stacks: "📚",
  Blog: "📝",
  Clubs: "🏛️",
  Amis: "👥"
};

const NAVFR = {
  Statistics: "Statistiques",
  History: "Historique",
  Favorites: "Favoris",
  Reviews: "Critiques",
  "Forum Posts": "Messages",
  Recommendations: "Recos",
  "Interest Stacks": "Stacks",
  "Blog Posts": "Blog",
  Clubs: "Clubs",
  Friends: "Amis"
};

function readProfile(left, right) {
  const name = (location.pathname.match(/^\/profile\/([^/]+)/)?.[1] || "Profil").slice(0, 30);
  const avatar = IMG(left.querySelector(".user-image img"));
  const meta = [], navLinks = [];

  left.querySelectorAll("ul.user-status li").forEach((li) => {
    const a = li.querySelector("a[href]");
    if (a) {
      const n = li.querySelector(".user-status-data");
      let raw = T(a);
      let count = N(n?.textContent);
      if (!n) {
        const m = raw.match(/^(.*?)(\d+)\s*$/);
        if (m) { raw = m[1].trim(); count = parseFloat(m[2]); }
      } else raw = raw.replace(T(n), "").trim();
      const label = NAVFR[raw] || raw;
      navLinks.push({ label, count, href: a.href, icon: NAV_ICONS[label] || "•" });
      return;
    }
    const label = T(li.querySelector(".user-status-title"));
    const value = T(li.querySelector(".user-status-data"));
    if (label && value) {
      const frLabel = STFR[label] || label;
      meta.push({
        label: frLabel,
        value: GFR[value] || value,
        raw: label,
        icon: META_ICONS[frLabel] || "•"
      });
    }
  });

  const online = meta.some((m) => m.raw === "Last Online" && /now/i.test(m.value));

  const actions = [], seenLabel = new Set();
  const pushAction = (label, href, active = false) => {
    if (seenLabel.has(label) || !href) return;
    seenLabel.add(label);
    actions.push({ label, href, active });
  };

  const m = (location.pathname.match(/^\/profile\/([^/]+)/)?.[1] || "").replace(/\/$/, "");
  if (m && !/^\d+$/.test(m)) {
    pushAction("Anime List", `https://myanimelist.net/animelist/${m}`, true);
    pushAction("Manga List", `https://myanimelist.net/mangalist/${m}`, false);
  }

  const statsFor = (kind) => {
    const st = right.querySelector(".stats." + kind);
    if (!st) return null;
    const flat = T(st);
    const statuses = [...st.querySelectorAll("ul.stats-status li")].map((li) => {
      const raw = T(li.querySelector("a"));
      const label = SFR[raw] || raw;
      return {
        label,
        count: N(li.querySelector("span:last-child")?.textContent ?? li.textContent),
        href: li.querySelector("a")?.href || "",
        color: STATUS_COLORS[label] || "#0071e3"
      };
    }).filter((s) => s.label);

    const totals = [...st.querySelectorAll("ul.stats-data li")].map((li) => {
      const sp = li.querySelectorAll("span");
      return { label: TFR[T(sp[0])] || T(sp[0]), value: N(sp[1]?.textContent ?? li.textContent) };
    }).filter((t) => t.label);

    const total = totals.find((t) => t.label === "Total")?.value || statuses.reduce((n, s) => n + s.count, 0);
    const done = statuses.find((s) => s.label === "Terminés")?.count || 0;
    const days = N((flat.match(/Days:\s*([\d.,]+)/) || [])[1]);
    const mean = N((flat.match(/Mean Score:\s*([\d.,]+)/) || [])[1]);

    return {
      kind,
      days,
      hours: Math.round(days * 24),
      mean,
      statuses,
      totals,
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0
    };
  };

  const updatesFor = (kind) => {
    const box = right.querySelector(".updates." + kind);
    if (!box) return { restricted: false, items: [] };
    if (/restricted by the owner/i.test(T(box)) && !box.querySelector(".statistics-updates")) return { restricted: true, items: [] };
    return {
      restricted: false,
      items: [...box.querySelectorAll(".statistics-updates")].slice(0, 6).map((u) => {
        const link = u.querySelector(".data > a") || u.querySelector("a");
        const title = T(link);
        let metaRaw = T(u.querySelector(".data")).replace(title, "").trim().slice(0, 100);

        // Formatage français plus naturel ; "Scored -" (sans note) est un
        // résidu brut MAL → supprimé, jamais affiché tel quel.
        metaRaw = metaRaw
          .replace(/Watching\s+(\d+)\/(\d+)/i, "En cours · Ép. $1/$2")
          .replace(/Reading\s+(\d+)\/(\d+)/i, "En cours · Ch. $1/$2")
          .replace(/Completed\s+(\d+)\/(\d+)/i, "Terminé · Ép. $1/$2")
          .replace(/\s*·?\s*Scored\s+(\d+)/i, " · ★ $1")
          .replace(/\s*·?\s*Scored\s*-?/gi, "")
          .replace(/^[·\s]+/, "");

        return { img: IMG(u.querySelector("img")), title, href: link?.href || "", meta: metaRaw, kind };
      })
    };
  };

  const favAll = right.querySelector('a[href$="/favorites"]')?.href || "";
  const favorites = [...right.querySelectorAll('[id$="_favorites"]')].map((el) => {
    let h = el.previousElementSibling;
    while (h && h.tagName !== "H5") h = h.previousElementSibling;
    const items = [...el.querySelectorAll("li.btn-fav")].slice(0, 12).map((li) => {
      const fullTitle = li.getAttribute("title") || T(li.querySelector(".title"));
      const parts = fullTitle.split(" - ");
      return {
        title: parts[0] || fullTitle,
        sub: parts[1] || T(li.querySelector(".users")),
        href: li.querySelector("a")?.href || "",
        img: IMG(li.querySelector("img")),
      };
    }).filter((f) => f.title && f.img);

    const key = el.id.replace("_favorites", "");
    const label = T(h).replace(/\s*\(\d+\)\s*$/, "") || key;
    return { key, label, items };
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
  const bioNode = right.querySelector(".user-profile-about");
  const bioText = bioNode ? T(bioNode) : "";
  const hasBio = bioText.length > 0 && !/no biography yet/i.test(bioText);

  return {
    name, avatar, online, navLinks, actions, favorites, favAll, commentsNode,
    meta: meta.filter((m) => m.raw !== "Last Online"),
    anime: statsFor("anime"), manga: statsFor("manga"),
    updAnime: updatesFor("anime"), updManga: updatesFor("manga"),
    locked: commentsNode ? /login|sign up/i.test(T(commentsNode)) : true,
    friends: friendsEl ? T(friendsEl).slice(0, 120) : "",
    clubs,
    bioNode: hasBio ? bioNode : null,
  };
}

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function card(parent, title, href, extraHeader) {
  const s = el("section", "apl-card", parent);
  const h = el("header", null, s);
  el("h2", null, h, title);
  if (extraHeader) h.appendChild(extraHeader);
  if (href) { const a = el("a", "apl-card-link", h, "Tout voir ↗"); a.href = href; }
  return el("div", "apl-card-body", s);
}

function frDate(s) {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  try { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(t); } catch { return s; }
}

function renderHero(view, d) {
  const sec = view.querySelector(".apl-hero");
  const main = view.querySelector(".apl-hero-main");

  // Avatar avec contour doux
  if (d.avatar) {
    const p = el("div", "apl-avatar", main);
    const im = el("img", null, p);
    im.src = d.avatar;
    im.alt = d.name;
    im.loading = "lazy";
  }

  const who = el("div", "apl-who", main);
  const titleRow = el("div", "apl-who-title-row", who);
  el("h1", null, titleRow, d.name);
  if (d.online) el("span", "apl-online", titleRow, "En ligne");

  // Puces de métadonnées modernes avec icônes
  const meta = el("div", "apl-meta", who);
  d.meta.slice(0, 4).forEach((m) => {
    const v = /membre depuis/i.test(m.label) ? frDate(m.value) : m.value;
    const chip = el("span", "apl-meta-chip", meta);
    el("span", "apl-chip-icon", chip, m.icon);
    el("span", "apl-chip-text", chip, `${m.label} : ${v}`);
  });

  // Actions pilules unifiées avec la vue liste
  const act = el("div", "apl-actions", who);
  d.actions.forEach((a) => {
    const b = el("a", `apl-pill-btn ${a.active ? "active" : ""}`, act, a.label);
    b.href = a.href;
  });

  // KPIs
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

// Statistiques unifiées avec jauge segmentée iCloud
function renderUnifiedStats(parent, d) {
  if (!d.anime && !d.manga) return;

  // Contrôle segmenté Anime/Manga (classes dédiées : .apl-icon-btn est un
  // bouton carré 32px qui faisait se chevaucher les libellés texte).
  const tabsWrap = el("div", "apl-seg apl-stats-tabs", null);
  const btnAnime = el("button", "apl-seg-btn active", tabsWrap, "Anime");
  btnAnime.type = "button";
  btnAnime.setAttribute("aria-pressed", "true");
  let btnManga = null;
  if (d.manga) {
    btnManga = el("button", "apl-seg-btn", tabsWrap, "Manga");
    btnManga.type = "button";
    btnManga.setAttribute("aria-pressed", "false");
  }

  const body = card(parent, "Statistiques", null, tabsWrap);
  const content = el("div", "apl-stats-content", body);

  const drawFor = (st) => {
    content.innerHTML = "";
    if (!st || !st.total) {
      el("p", "apl-muted", content, "Aucune donnée enregistrée.");
      return;
    }

    // 1. Jauge segmentée continue (Stacked Progress Bar)
    const stackedBar = el("div", "apl-stacked-bar", content);
    stackedBar.setAttribute("role", "progressbar");
    stackedBar.setAttribute("aria-valuenow", String(st.pct));

    st.statuses.forEach((s) => {
      const pct = (s.count / st.total) * 100;
      if (pct > 0) {
        const seg = el("div", "apl-stacked-segment", stackedBar);
        seg.style.width = `${pct}%`;
        seg.style.backgroundColor = s.color;
        seg.title = `${s.label} : ${s.count} (${Math.round(pct)} %)`;
      }
    });

    // 2. Légende interactive en grille
    const legend = el("div", "apl-stats-legend", content);
    st.statuses.forEach((s) => {
      const pct = Math.round((s.count / st.total) * 100);
      const row = el(s.href ? "a" : "div", "apl-legend-item", legend);
      if (s.href) row.href = s.href;

      const dot = el("span", "apl-legend-dot", row);
      dot.style.backgroundColor = s.color;

      el("span", "apl-legend-label", row, s.label);
      el("b", "apl-legend-count", row, s.count.toLocaleString("fr-FR"));
      el("span", "apl-legend-pct", row, `${pct}%`);
    });

    // 3. Totaux en grille compacte
    const totalsGrid = el("dl", "apl-totals", content);
    st.totals.slice(0, 4).forEach((x) => {
      el("dt", null, totalsGrid, x.label);
      el("dd", null, totalsGrid, x.value.toLocaleString("fr-FR"));
    });
  };

  // Affichage initial Anime
  drawFor(d.anime || d.manga);

  const fadeTransition = (fn) => {
    content.style.opacity = "0";
    content.style.transform = "translateY(8px)";
    setTimeout(() => {
      fn();
      content.style.opacity = "1";
      content.style.transform = "translateY(0)";
    }, 150);
  };

  btnAnime.addEventListener("click", () => {
    if (btnAnime.classList.contains("active")) return;
    btnAnime.classList.add("active");
    btnAnime.setAttribute("aria-pressed", "true");
    btnManga?.classList.remove("active");
    btnManga?.setAttribute("aria-pressed", "false");
    fadeTransition(() => drawFor(d.anime));
  });

  btnManga?.addEventListener("click", () => {
    if (btnManga.classList.contains("active")) return;
    btnManga.classList.add("active");
    btnManga.setAttribute("aria-pressed", "true");
    btnAnime.classList.remove("active");
    btnAnime.setAttribute("aria-pressed", "false");
    fadeTransition(() => drawFor(d.manga));
  });
}

// Favoris avec onglets thématiques
function renderFavorites(main, d) {
  if (!d.favorites.length) return;

  const tabsWrap = el("div", "apl-fav-tabs", null);
  d.favorites.forEach((f, idx) => {
    const btn = el("button", `apl-pill-btn ${idx === 0 ? "active" : ""}`, tabsWrap);
    btn.type = "button";
    btn.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
    btn.textContent = `${f.label} (${f.items.length})`;
    btn.dataset.idx = String(idx);
  });

  const body = card(main, "Favoris", d.favAll, d.favorites.length > 1 ? tabsWrap : null);
  const container = el("div", "apl-fav-container", body);

  const drawFav = (f) => {
    container.innerHTML = "";
    const isCharOrPerson = /character|person/i.test(f.key);
    const gr = el("div", `apl-favgrid ${isCharOrPerson ? "apl-favgrid-people" : ""}`, container);

    f.items.forEach((x) => {
      const a = el("a", "apl-fav", gr);
      a.href = x.href;
      a.title = x.title + (x.sub ? ` — ${x.sub}` : "");

      const thumb = el("div", "apl-fav-thumb", a);
      const im = el("img", null, thumb);
      im.src = x.img;
      im.alt = "";
      im.loading = "lazy";

      const titleBox = el("div", "apl-fav-info", a);
      el("span", "apl-fav-name", titleBox, x.title);
      if (x.sub) el("span", "apl-fav-sub", titleBox, x.sub);
    });
  };

  drawFav(d.favorites[0]);

  tabsWrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsWrap.querySelectorAll("button").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      const idx = parseInt(btn.dataset.idx, 10);
      drawFav(d.favorites[idx]);
    });
  });
}

// Navigation façon Réglages iOS
function renderIosNavigation(side, d) {
  if (!d.navLinks.length) return;

  const nb = card(side, "Navigation");
  const ul = el("ul", "apl-ios-list", nb);

  const skip = new Set(d.actions.map((a) => a.href.replace(/\/$/, "")));
  const extra = (d.favAll ? [{ label: "Favoris", count: 0, href: d.favAll, icon: "⭐" }] : []).filter((n) => !skip.has(n.href.replace(/\/$/, "")));

  d.navLinks
    .filter((n) => !skip.has(n.href.replace(/\/$/, "")))
    .concat(extra)
    .slice(0, 8)
    .forEach((n) => {
      const li = el("li", "apl-ios-item", ul);
      const a = el("a", "apl-ios-link", li);
      a.href = n.href;

      const left = el("div", "apl-ios-left", a);
      el("span", "apl-ios-icon", left, n.icon || "•");
      el("span", "apl-ios-label", left, n.label);

      const right = el("div", "apl-ios-right", a);
      if (n.count) {
        el("span", "apl-ios-badge", right, String(n.count));
      }
      el("span", "apl-ios-chevron", right, "›");
    });
}

// Activite : timeline avec formatting soigné
function renderActivity(side, upd, title) {
  if (!upd.items.length && !upd.restricted) return;
  const body = card(side, title);
  if (upd.restricted) {
    el("p", "apl-muted", body, "Liste privée — le membre a restreint l’accès.");
    return;
  }
  const tl = el("ol", "apl-tl", body);
  upd.items.forEach((u) => {
    const li = el("li", null, tl);
    if (u.img) {
      const im = el("img", null, li);
      im.src = u.img;
      im.alt = "";
      im.loading = "lazy";
    }
    const tx = el("div", null, li);
    const a = el("a", null, tx, u.title);
    if (u.href) a.href = u.href;
    if (u.meta) el("span", "apl-muted", tx, u.meta);
  });
}

// Assemblage global
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

    // Hero (surface pleine, sans bannière floutée)
    const sec = el("section", "apl-hero", view);
    el("div", "apl-hero-main", sec);

    // Colonnes (Main + Side)
    const cols = el("div", "apl-cols", view);
    const main = el("div", "apl-col-main", cols);
    const side = el("div", "apl-col-side", cols);

    renderHero(view, d);

    // Bio si non vide
    if (d.bioNode) {
      const bio = card(main, "À propos");
      bio.appendChild(d.bioNode);
    }

    // Statistiques unifiées avec barre segmentée
    renderUnifiedStats(main, d);

    // Favoris avec sous-onglets
    renderFavorites(main, d);

    // Navigation façon iOS
    renderIosNavigation(side, d);

    // Communauté ("No friend yet." est un résidu brut MAL → traduit, jamais tel quel)
    if (d.friends || d.clubs) {
      const cb = card(side, "Communauté");
      if (d.friends) el("p", "apl-muted", cb, /no friends?\s+yet/i.test(d.friends) ? "Aucun ami pour l'instant." : d.friends);
      if (d.clubs) {
        const a = el("a", "apl-card-link", cb, d.clubs.label);
        a.href = d.clubs.href;
      }
    }

    // Activités
    renderActivity(side, d.updAnime, "Activité anime");
    renderActivity(side, d.updManga, "Activité manga");

    // Commentaires
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
