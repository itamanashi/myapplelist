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

  // Profil MAL : on ne cherche QUE dans le header (pas dans les news, sinon on attrape un auteur)
  function detectProfile() {
    const scope = document.getElementById("headerSmall") || document.getElementById("header-menu") || document;
    const useScope = scope === document ? document : scope;
    const profileLink = useScope.querySelector('a[href*="/profile/"]');
    if (profileLink && useScope !== document) {
      return { mode: "user", name: (profileLink.textContent || "Profil").trim().slice(0, 20), href: profileLink.href };
    }
    // Invité : Login / Sign Up réels du header
    const loginA = (document.getElementById("headerSmall") || document).querySelector('a[href*="login.php"]');
    return { mode: "guest", loginHref: loginA ? loginA.href : "https://myanimelist.net/login.php" };
  }

  function buildTopbar() {
    if (document.getElementById("myapple-topbar")) return;
    const prof = detectProfile();
    const profHtml = prof.mode === "user"
      ? `<a id="myapple-profile" href="${prof.href}" title="Mon profil">👤 ${prof.name}</a>`
      : `<a id="myapple-profile" href="${prof.loginHref}">Login</a>
         <a id="myapple-signup" href="https://myanimelist.net/register.php">Sign Up</a>`;
    const bar = document.createElement("div");
    bar.id = "myapple-topbar";
    bar.setAttribute("role", "navigation");
    bar.innerHTML = `
      <div class="logo">myapple<span>list</span></div>
      <nav>
        <a href="https://myanimelist.net/anime/season">Season</a>
        <a href="https://myanimelist.net/topanime.php">Top</a>
        <a href="https://myanimelist.net/forum/">Forum</a>
      </nav>
      <input id="myapple-q" placeholder="Rechercher…" aria-label="Rechercher un anime" />
      <button id="myapple-go" class="ghost">↗</button>
      <button id="myapple-notes">Notes</button>
      <span id="myapple-account">${profHtml}</span>
    `;
    document.body.appendChild(bar);
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
    bar.querySelector("#myapple-notes").onclick = async () => {
      const s = await getState();
      const n = await setState({ panelOpen: !s.panelOpen });
      togglePanel(n.panelOpen);
    };
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
