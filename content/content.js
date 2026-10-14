// MyAppleList — REMPLACE le chrome MAL par un shell Apple. Skill apple-design appliqué.
(() => {
  const STATE_KEY = "myapple_state_v1";
  const NOTE_KEY = () => `myapple_note_${location.pathname}`;
  const defaults = { enabled: true, dark: false, panelOpen: false };

  const getState = async () => {
    try {
      const r = await chrome.storage.local.get(STATE_KEY);
      return { ...defaults, ...(r[STATE_KEY] || {}) };
    } catch { return defaults; }
  };
  const setState = async (patch) => {
    const s = { ...(await getState()), ...patch };
    await chrome.storage.local.set({ [STATE_KEY]: s });
    return s;
  };

  function applyTheme(s) {
    document.documentElement.classList.toggle("mal-custom", s.enabled);
    document.documentElement.classList.toggle("mal-dark", s.dark);
  }

  // Animations : 100 % CSS (transform + opacity, compositor only).
  // Pas de spring JS : il doublait la transition CSS et calculait une valeur morte.

  // Profil MAL : on ne cherche QUE dans le header (pas dans les news, sinon on attrape un auteur).
  // Connecté : le header n'a PAS de lien /profile/ direct — juste un toggle
  // `.header-profile-link` (pseudo, sans href) + un dropdown dont l'entrée "Profile"
  // pointe vers /profile/<pseudo>. Pas de photo dans le header : on la charge
  // depuis la page profil (cache 24h), initiale en fallback.
  function detectProfile() {
    const scope = document.getElementById("headerSmall") || document.getElementById("header-menu");
    if (scope) {
      const toggle = scope.querySelector(".header-profile-link");
      if (toggle) {
        const name = (toggle.textContent || "Profil").trim().slice(0, 20);
        const drop = scope.querySelector(".header-profile-dropdown");
        let href = "";
        if (drop) {
          const entry = [...drop.querySelectorAll('a[href*="/profile/"]')]
            .find((a) => /\/profile\/[^/]+\/?$/.test(a.href));
          if (entry) href = entry.href;
        }
        if (!href && name) href = `https://myanimelist.net/profile/${encodeURIComponent(name)}`;
        return { mode: "user", name, href };
      }
      const loginA = scope.querySelector('a[href*="login.php"]');
      if (loginA) return { mode: "guest", loginHref: loginA.href };
    }
    return { mode: "guest", loginHref: "https://myanimelist.net/login.php" };
  }

  // Photo du compte : og:image de la page profil, cache 24h par pseudo.
  // Le header MAL connecté ne contient aucune image, donc sans ça on n'aurait que l'initiale.
  async function enhanceAvatar(imgEl, fallbackEl, prof) {
    if (prof.mode !== "user" || !imgEl) return;
    const KEY = "myapple_avatar_v3";
    const show = (url) => {
      if (!url) return;
      imgEl.src = url;
      imgEl.hidden = false;
      if (fallbackEl) fallbackEl.hidden = true;
    };
    imgEl.addEventListener("error", () => {
      imgEl.hidden = true;
      if (fallbackEl) fallbackEl.hidden = false;
    }, { once: true });
    try {
      const cached = (await chrome.storage.local.get(KEY))[KEY];
      // Ancien cache (og:image = icône par défaut) invalide : on refetch la vraie photo
      const cachedOk = cached?.url && cached?.user === prof.name
        && Date.now() - cached.at < 864e5 && !cached.url.includes("/sp/icon/");
      if (cachedOk) {
        show(cached.url);
        return;
      }
      const res = await fetch(prof.href, { credentials: "include" });
      if (!res.ok) return;
      const html = await res.text();
      // Vraie photo : .user-image de la page profil. L'img est en lazyload
      // (data-src seul, pas de src) → lire data-src d'abord.
      // og:image = icône MAL par défaut, inutilisable comme photo.
      const doc = new DOMParser().parseFromString(html, "text/html");
      const profileImg = doc.querySelector(".user-image img");
      const url =
        profileImg?.getAttribute("data-src") ||
        profileImg?.src ||
        doc.querySelector('meta[property="og:image"]')?.content ||
        "";
      if (url) {
        show(url);
        await chrome.storage.local.set({ [KEY]: { url, user: prof.name, at: Date.now() } });
      }
    } catch { /* hors-ligne ou profil privé : on garde l'initiale */ }
  }

  function buildTopbar() {
    if (document.getElementById("myapple-topbar")) return;
    const prof = detectProfile();
    const initial = (prof.name || "?").trim().charAt(0).toUpperCase();
    const profHtml = prof.mode === "user"
      ? `<a id="myapple-account-link" href="${prof.href}" title="Mon profil"><span class="avatar-wrap"><img id="myapple-avatar" alt="" hidden /><span class="avatar-fallback" aria-hidden="true">${initial}</span></span><span class="avatar-name">${prof.name}</span></a>`
      : `<a id="myapple-account-link" href="${prof.loginHref}">Login</a>
         <a id="myapple-signup" href="https://myanimelist.net/register.php">Sign Up</a>`;
    const bar = document.createElement("div");
    bar.id = "myapple-topbar";
    bar.setAttribute("role", "navigation");
    bar.setAttribute("aria-label", "Navigation MyAppleList");
    bar.innerHTML = `
      <div class="logo" aria-hidden="true">myapple<span>list</span></div>
      <button id="myapple-burger" aria-expanded="false" aria-controls="myapple-nav" aria-label="Menu">☰</button>
      <nav id="myapple-nav" aria-label="Sections MyAnimeList">
        <div class="menu"><a href="https://myanimelist.net/anime.php">Anime</a><div class="drop">
          <a href="https://myanimelist.net/anime.php">Anime Search</a>
          <a href="https://myanimelist.net/topanime.php">Top Anime</a>
          <a href="https://myanimelist.net/anime/season">Seasonal Anime</a>
          <a href="https://myanimelist.net/anime/reviews">Reviews</a>
          <a href="https://myanimelist.net/anime/recommendations">Recommendations</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/manga.php">Manga</a><div class="drop">
          <a href="https://myanimelist.net/manga.php">Manga Search</a>
          <a href="https://myanimelist.net/topmanga.php">Top Manga</a>
          <a href="https://myanimelist.net/store">Manga Store</a>
          <a href="https://myanimelist.net/manga/reviews">Reviews</a>
          <a href="https://myanimelist.net/manga/recommendations">Recommendations</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/forum/">Community</a><div class="drop">
          <a href="https://myanimelist.net/forum/">Forums</a>
          <a href="https://myanimelist.net/clubs.php">Clubs</a>
          <a href="https://myanimelist.net/blogs.php">Blogs</a>
          <a href="https://myanimelist.net/users.php">Users</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/news">Industry</a><div class="drop">
          <a href="https://myanimelist.net/news">News</a>
          <a href="https://myanimelist.net/featured">Featured Articles</a>
          <a href="https://myanimelist.net/people.php">People</a>
          <a href="https://myanimelist.net/character.php">Characters</a>
          <a href="https://myanimelist.net/anime/producer">Companies</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/watch">Watch</a><div class="drop">
          <a href="https://myanimelist.net/watch/episode">Episode Videos</a>
          <a href="https://myanimelist.net/watch/promotion">Anime Trailers</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/store">Read</a><div class="drop">
          <a href="https://myanimelist.net/store">Manga Store</a>
        </div></div>
        <div class="menu"><a href="https://myanimelist.net/about">Help</a><div class="drop">
          <a href="https://myanimelist.net/about">About</a>
          <a href="https://myanimelist.net/about/support">Support</a>
          <a href="https://myanimelist.net/faq">FAQ</a>
          <a href="https://myanimelist.net/staff">Staff</a>
        </div></div>
      </nav>
      <input id="myapple-q" placeholder="Rechercher…" aria-label="Rechercher un anime" />
      <button id="myapple-go" class="ghost">↗</button>
      <span id="myapple-account">${profHtml}</span>
    `;
    document.body.appendChild(bar);
    enhanceAvatar(bar.querySelector("#myapple-avatar"), bar.querySelector(".avatar-fallback"), prof);
    // Burger : replie les 7 menus en un panneau vertical sous 900px
    const burger = bar.querySelector("#myapple-burger");
    burger.addEventListener("click", () => {
      const open = bar.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    // Feedback instantané sur pointerdown, pas au click
    bar.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("button, a");
      if (b) b.style.transform = "scale(.96)";
    }, { passive: true });
    bar.addEventListener("pointerup", (e) => {
      const b = e.target.closest("button, a");
      if (b) b.style.transform = "";
    });

    const go = () => {
      const q = bar.querySelector("#myapple-q").value.trim();
      location.href = q
        ? `https://myanimelist.net/anime.php?q=${encodeURIComponent(q)}&cat=anime`
        : `https://myanimelist.net/anime/season`;
    };
    bar.querySelector("#myapple-go").onclick = go;
    bar.querySelector("#myapple-q").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  function buildPanel() {
    if (document.getElementById("myapple-panel")) return;
    const scrim = document.createElement("div");
    scrim.id = "myapple-scrim";
    scrim.onclick = async () => { await setState({ panelOpen: false }); togglePanel(false, true); };
    const p = document.createElement("div");
    p.id = "myapple-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "true");
    p.setAttribute("aria-label", "Notes personnelles");
    p.setAttribute("aria-hidden", "true");
    p.inert = true;
    p.innerHTML = `
      <h3>Notes</h3>
      <div class="sub">${location.pathname} · stocké en local</div>
      <textarea id="myapple-note" placeholder="Où je me suis arrêté, mon avis…" aria-label="Note pour cette page"></textarea>
      <div class="row">
        <button id="myapple-save" class="apl-primary">Sauver</button>
        <button id="myapple-close" class="apl-secondary">Fermer</button>
      </div>
      <div id="myapple-status" role="status" aria-live="polite"></div>
    `;
    document.body.append(scrim, p);
    p.querySelector("#myapple-close").onclick = async () => { await setState({ panelOpen: false }); togglePanel(false, true); };
    p.querySelector("#myapple-save").onclick = async () => {
      const v = p.querySelector("#myapple-note").value;
      await chrome.storage.local.set({ [NOTE_KEY()]: { text: v, at: Date.now() } });
      p.querySelector("#myapple-status").textContent = "✔ Sauvé " + new Date().toLocaleTimeString();
    };
    chrome.storage.local.get(NOTE_KEY()).then((r) => {
      if (r[NOTE_KEY()]?.text) p.querySelector("#myapple-note").value = r[NOTE_KEY()].text;
    });
    // Échap ferme le panneau et rend le focus au FAB
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && p.classList.contains("open")) {
        setState({ panelOpen: false });
        togglePanel(false, true);
      }
    });
  }

  let lastFabFocus = false;
  function togglePanel(open, returnFocus = false) {
    const p = document.getElementById("myapple-panel");
    const scrim = document.getElementById("myapple-scrim");
    p?.classList.toggle("open", open);
    scrim?.classList.toggle("open", open);
    if (!p) return;
    p.setAttribute("aria-hidden", String(!open));
    p.inert = !open;
    if (open) {
      lastFabFocus = document.activeElement?.id === "myapple-fab";
      p.querySelector("#myapple-note")?.focus({ preventScroll: true });
    } else if (returnFocus || lastFabFocus) {
      document.getElementById("myapple-fab")?.focus({ preventScroll: true });
      lastFabFocus = false;
    }
  }

  function buildFab() {
    if (document.getElementById("myapple-fab")) return;
    const b = document.createElement("button");
    b.id = "myapple-fab"; b.title = "Notes"; b.textContent = "✎";
    // pointerdown = réponse immédiate
    b.addEventListener("pointerdown", () => { b.style.transform = "scale(.94)"; }, { passive: true });
    b.addEventListener("pointerup", () => { b.style.transform = ""; });
    b.onclick = async () => {
      const s = await getState();
      const n = await setState({ panelOpen: !s.panelOpen });
      togglePanel(n.panelOpen);
    };
    document.body.appendChild(b);
  }

  // PROFIL : vraie refonte par relocalisation. On ne duplique rien : on DÉPLACE
  // les nœuds MAL (avatar, statuts, stats, updates, favoris) dans notre mise en page,
  // puis on masque le conteneur d'origine (vide). Échec silencieux = page native intacte.
  function buildProfileView() {
    if (document.getElementById("myapple-profile")) return;
    if (!/^\/profile\/[^/]+\/?$/.test(location.pathname)) return;
    const left = document.querySelector("#content .container-left");
    const right = document.querySelector("#content .container-right");
    if (!left || !right) return;
    try {
      const view = document.createElement("div");
      view.id = "myapple-profile";
      view.innerHTML = `
        <section class="apl-hero"><div class="apl-hero-main"></div><div class="apl-hero-side"></div></section>
        <div class="apl-cols"><div class="apl-col-main"></div><div class="apl-col-side"></div></div>
      `;
      const heroMain = view.querySelector(".apl-hero-main");
      const heroSide = view.querySelector(".apl-hero-side");
      const colMain = view.querySelector(".apl-col-main");
      const colSide = view.querySelector(".apl-col-side");
      const card = (title, action) => {
        const s = document.createElement("section");
        s.className = "apl-card";
        s.innerHTML = `<header><h2></h2></header><div class="apl-card-body"></div>`;
        s.querySelector("h2").textContent = title;
        if (action) s.querySelector("header").appendChild(action);
        return [s, s.querySelector(".apl-card-body")];
      };

      // --- Hero : avatar + nom + statuts + actions
      const avatar = left.querySelector(".user-image");
      if (avatar) heroMain.appendChild(avatar);
      // Pseudo depuis l'URL (/profile/<pseudo>) : le h1 contient aussi les liens header
      const name = (location.pathname.match(/^\/profile\/([^/]+)/)?.[1] || "Profil").slice(0, 30);
      const who = document.createElement("div");
      who.className = "apl-who";
      who.innerHTML = `<h2></h2><div class="apl-meta"></div><div class="apl-actions"></div>`;
      who.querySelector("h2").textContent = name;
      const meta = who.querySelector(".apl-meta");
      left.querySelectorAll("ul.user-status").forEach((ul) => meta.appendChild(ul));
      // user-status mélange statuts purs et liens de nav : on trie.
      // Statuts (sans lien) restent dans le hero, liens -> carte Navigation.
      const navItems = [];
      meta.querySelectorAll("li").forEach((li) => {
        if (li.querySelector("a[href]")) navItems.push(li);
      });
      // Badge en ligne : "Last Online Now" -> pastille verte
      const onlineLi = [...meta.querySelectorAll("li")].find((li) => /^last online/i.test((li.textContent || "").trim()));
      if (onlineLi && /now/i.test(onlineLi.textContent)) {
        const dot = document.createElement("span");
        dot.className = "apl-online";
        dot.textContent = "En ligne";
        who.querySelector("h2").appendChild(dot);
      }
      heroMain.appendChild(who);
      // Actions : listes + pages clés (hrefs stables, pas de classes fragiles)
      const actions = who.querySelector(".apl-actions");
      left.querySelectorAll("a[href]").forEach((a) => {
        if (/animelist\/[^/]+\/?$|mangalist\/[^/]+\/?$|\/statistics\/?$|\/history\/[^/]+\/?$|\/favorites\/?$/.test(a.href)) {
          a.classList.add("apl-btn");
          actions.appendChild(a);
        }
      });
      // Reste de la sidebar + liens triés -> carte Navigation
      if (left.textContent.trim() || navItems.length) {
        const [navCard, navBody] = card("Navigation");
        if (navItems.length) {
          const navList = document.createElement("ul");
          navList.className = "apl-navlist";
          navItems.forEach((li) => navList.appendChild(li));
          navBody.appendChild(navList);
        }
        if (left.textContent.trim()) navBody.appendChild(left);
        // La carte Navigation vit dans la colonne latérale (pas dans le hero) :
        // sinon sa hauteur étire le hero et laisse un grand vide sous l'avatar.
        colSide.appendChild(navCard);
      }

      // --- Colonne principale : bio + stats
      const bio = right.querySelector(".user-profile-about");
      if (bio && bio.textContent.trim()) {
        const [bioCard, bioBody] = card("À propos");
        bioBody.appendChild(bio);
        colMain.appendChild(bioCard);
      } else if (bio) { bio.remove(); }
      ["anime", "manga"].forEach((kind) => {
        const st = right.querySelector(`.stats.${kind}`);
        if (!st) return;
        const title = st.querySelector("h5")?.textContent.replace(/\s+/g, " ").trim() || `Stats ${kind}`;
        const link = st.querySelector("h5 a");
        const [stCard, stBody] = card(title.replace(/^All \w+ Stats\s*/, "").trim() || title, link || null);
        st.querySelector("h5")?.remove();
        stBody.appendChild(st);
        colMain.appendChild(stCard);
      });

      // --- Sections h5 génériques (updates + favoris, où qu'ils soient nichés) :
      // chaque h5 + ses siblings suivants (même parent) jusqu'au prochain h5
      const h5s = [...right.querySelectorAll("h5")].filter((h) => !h.closest(".stats"));
      h5s.forEach((h) => {
        const link = h.querySelector("a");
        const raw = h.textContent.replace(/\s+/g, " ").trim();
        const title = link ? raw.replace(link.textContent.trim(), "").trim() : raw;
        const isUpdates = /updates/i.test(title);
        const label = isUpdates
          ? (/manga/i.test(title) ? "Dernières mises à jour manga" : "Dernières mises à jour anime")
          : title;
        const nodes = [];
        let n = h.nextElementSibling;
        while (n && n.tagName !== "H5") {
          const nx = n.nextElementSibling;
          nodes.push(n);
          n = nx;
        }
        if (!nodes.length) { h.remove(); return; }
        const [c, body] = card(label, link);
        nodes.forEach((el) => body.appendChild(el));
        (isUpdates ? colSide : colMain).appendChild(c);
        h.remove();
      });
      // Orphelins restants (avant le 1er h5) -> carte simple s'ils ont du texte
      // (déjà déplacés ci-dessus si groupés ; sinon on les rapatrie en fin de colonne)
      [...right.children].forEach((el) => {
        if (el.textContent.trim()) {
          const [c, body] = card("Détails");
          body.appendChild(el);
          colMain.appendChild(c);
        } else el.remove();
      });

      // --- Swap : notre vue remplace le conteneur d'origine
      const container = document.querySelector("#content .content-container");
      container?.parentNode?.insertBefore(view, container);
      document.body.classList.add("myapple-profile");
    } catch {
      document.getElementById("myapple-profile")?.remove();
      document.body.classList.remove("myapple-profile");
    }
  }

  // Contenu MAL : on force l'affichage des images lazyload + on débloque le slider en grille
  function revealContent() {
    document.querySelectorAll("img.lazyload, img[data-src]").forEach((img) => {
      const src = img.getAttribute("data-src");
      if (src && !img.getAttribute("src")) img.setAttribute("src", src);
      img.style.opacity = "1";
      img.style.visibility = "visible";
      img.classList.add("myapple-revealed");
    });
    // Trailers : le visuel est dans data-bg, appliqué par le JS MAL au scroll.
    // En grille tout est visible d'un coup : on l'applique nous-mêmes en fallback.
    document.querySelectorAll("a[data-bg]").forEach((a) => {
      if (!a.style.backgroundImage) a.style.backgroundImage = `url("${a.getAttribute("data-bg")}")`;
    });
    // Le slider MAL calcule une largeur inline qui casse la grille → on la neutralise
    document.querySelectorAll("ul.widget-slide").forEach((ul) => {
      ul.style.width = "auto";
      ul.style.transform = "none";
    });
  }

  chrome.storage.onChanged.addListener((ch) => {
    if (ch[STATE_KEY]) {
      const s = { ...defaults, ...ch[STATE_KEY].newValue };
      applyTheme(s); togglePanel(s.panelOpen);
      const bar = document.getElementById("myapple-topbar");
      if (bar) bar.style.display = s.enabled ? "flex" : "none";
    }
  });

  // Barre discrète : s'efface au scroll bas, revient au scroll haut (rAF, pas de jank)
  function autoHideBar() {
    const bar = document.getElementById("myapple-topbar");
    if (!bar || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Le clavier ne doit jamais perdre la topbar : le focus la ré-affiche.
    bar.addEventListener("focusin", () => bar.classList.remove("hidden"));
    let last = window.scrollY, ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        bar.classList.toggle("hidden", y > 320 && y > last);
        last = y;
        ticking = false;
      });
    }, { passive: true });
  }

  (async () => {
    const s = await getState();
    applyTheme(s);
    if (!s.enabled) return;
    buildTopbar(); buildPanel(); buildFab(); togglePanel(s.panelOpen);
    revealContent(); buildProfileView();
    autoHideBar();
    new MutationObserver(revealContent).observe(document.documentElement, { childList: true, subtree: true });
    console.log("[myapplelist] Apple replacement actif");
  })();
})();
