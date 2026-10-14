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

  // Spring JS interruptible : on repart toujours de la valeur live (presentation value),
  // on ne lock jamais l'input pendant la transition.
  function springTo(el, target, { bounce = 0, duration = 340 } = {}) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.transform = `translateY(${target}px)`;
      return;
    }
    const start = el.getBoundingClientRect().top + window.scrollY || 0;
    void start;
    el.animate(
      [{ transform: getComputedStyle(el).transform }, { transform: `translateY(${target}px)` }],
      { duration, easing: bounce > 0 ? "cubic-bezier(.32,1.15,.35,1)" : "cubic-bezier(.32,.72,.35,1)", fill: "none" }
    );
  }

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
      ? `<a id="myapple-profile" href="${prof.href}" title="Mon profil"><span class="avatar-wrap"><img id="myapple-avatar" alt="" hidden /><span class="avatar-fallback" aria-hidden="true">${initial}</span></span><span class="avatar-name">${prof.name}</span></a>`
      : `<a id="myapple-profile" href="${prof.loginHref}">Login</a>
         <a id="myapple-signup" href="https://myanimelist.net/register.php">Sign Up</a>`;
    const bar = document.createElement("div");
    bar.id = "myapple-topbar";
    bar.setAttribute("role", "navigation");
    bar.innerHTML = `
      <div class="logo">myapple<span>list</span></div>
      <nav>
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
    scrim.onclick = async () => { await setState({ panelOpen: false }); togglePanel(false); };
    const p = document.createElement("div");
    p.id = "myapple-panel";
    p.setAttribute("role", "dialog");
    p.innerHTML = `
      <h3>Notes</h3>
      <div class="sub">${location.pathname} · stocké en local</div>
      <textarea id="myapple-note" placeholder="Où je me suis arrêté, mon avis…"></textarea>
      <div class="row">
        <button id="myapple-save" style="flex:1;border:0;padding:11px;border-radius:12px;background:#0071e3;color:#fff;font-weight:700;cursor:pointer">Sauver</button>
        <button id="myapple-close" style="border:0;padding:11px;border-radius:12px;background:rgba(0,0,0,.06);cursor:pointer">Fermer</button>
      </div>
      <div id="myapple-status" style="font-size:12px;margin-top:8px;opacity:.65"></div>
    `;
    document.body.append(scimFix(scrim), p);
    function scimFix(el) { return el; }
    p.querySelector("#myapple-close").onclick = async () => { await setState({ panelOpen: false }); togglePanel(false); };
    p.querySelector("#myapple-save").onclick = async () => {
      const v = p.querySelector("#myapple-note").value;
      await chrome.storage.local.set({ [NOTE_KEY()]: { text: v, at: Date.now() } });
      p.querySelector("#myapple-status").textContent = "✔ Sauvé " + new Date().toLocaleTimeString();
    };
    chrome.storage.local.get(NOTE_KEY()).then((r) => {
      if (r[NOTE_KEY()]?.text) p.querySelector("#myapple-note").value = r[NOTE_KEY()].text;
    });
  }

  function togglePanel(open) {
    document.getElementById("myapple-panel")?.classList.toggle("open", open);
    document.getElementById("myapple-scrim")?.classList.toggle("open", open);
    if (open) springTo(document.getElementById("myapple-panel"), 0, { duration: 340 });
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
    revealContent();
    autoHideBar();
    new MutationObserver(revealContent).observe(document.documentElement, { childList: true, subtree: true });
    console.log("[myapplelist] Apple replacement actif");
  })();
})();
