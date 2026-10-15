// Vue Anime List / Manga List : EXTRACTION + RECONSTRUCTION (façon Profile).
// Consomme __myappleList (list-data.js). Aucun nœud MAL déplacé.
// Crée #myapple-list avec Hero (bannière floue + KPIs), barre de contrôle flottante
// (onglets statuts, recherche instantanée, filtres, tri, bascule grille/tableau),
// grille d'affiches Apple et modal détail.
(() => {
"use strict";

const root = typeof window !== "undefined" ? window : globalThis;

const STATUS_KEYS = [
  { id: 7, label: "Tous", code: "all" },
  { id: 1, label: "En cours", code: "watching" },
  { id: 2, label: "Terminés", code: "completed" },
  { id: 3, label: "En pause", code: "on_hold" },
  { id: 4, label: "Abandonnés", code: "dropped" },
  { id: 6, label: "À voir", code: "plantowatch" }, // label adapté pour manga via statutLabel
];

const BATCH_SIZE = 48;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class ListView {
  constructor(ctx) {
    this.ctx = ctx; // { kind: "anime" | "manga", user: string }
    this.items = [];
    this.filteredItems = [];
    this.renderedCount = 0;
    this.activeStatus = this.initialStatus();
    this.searchQuery = "";
    this.selectedType = "all";
    this.sortBy = "score"; // "score" | "title" | "updated" | "malScore" | "popularity" | "year" | "progress"
    this.sortDir = "desc"; // "asc" | "desc"
    this.viewMode = "grid"; // "grid" | "table"
    this.isOwnList = false;
    this.isLoading = true;
    this.counts = { 7: 0, 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
    this.stats = { total: 0, meanScore: 0, scoredCount: 0, totalWatched: 0, completedPct: 0 };
    this.observer = null;
    this.needsRefreshOnFocus = false;
    this.pending = new Set(); // ids en cours d'écriture (une écriture à la fois par entrée)
    this.toastTimer = null;
    this.dirty = new Map(); // id -> {fait, note, statut} : mutations optimistic pas encore absorbées par le serveur

    // Détection de retour sur l'onglet après modification sur MAL
    root.addEventListener("focus", () => {
      if (this.needsRefreshOnFocus) {
        this.needsRefreshOnFocus = false;
        this.reload(true);
      }
    });
  }

  initialStatus() {
    const params = new URLSearchParams(root.location?.search || "");
    const s = parseInt(params.get("status"), 10);
    return [1, 2, 3, 4, 6, 7].includes(s) ? s : 7;
  }

  async init() {
    if (document.getElementById("myapple-list")) return;
    this.isOwnList = document.body.classList.contains("ownlist") ||
      !!document.querySelector(".list-menu-float a.profile[href*='/" + encodeURIComponent(this.ctx.user) + "']");

    // Préférences popup (mode de vue par défaut). Défaut grille si illisible.
    try {
      const s = (await chrome?.storage?.local?.get("myapple_state_v1"))?.["myapple_state_v1"];
      if (s?.listView === "table") this.viewMode = "table";
    } catch { /* stockage indisponible : grille */ }

    // Marqueur global pour le CSS (masque le vieux chrome MAL)
    document.body.classList.add("myapple-list");

    this.container = el("div", "apl-list-root", null);
    this.container.id = "myapple-list";

    // Insérer proprement avant .list-container ou au début du body
    const malContainer = document.querySelector(".list-container") || document.getElementById("content");
    if (malContainer?.parentNode) {
      malContainer.parentNode.insertBefore(this.container, malContainer);
    } else {
      document.body.appendChild(this.container);
    }

    // Modal de détail (monté une seule fois dans le body)
    this.initModal();
    this.ensureToast();

    // 1. Rendu squelette initial immédiat
    this.renderSkeleton();

    // 2. Si table.list-table[data-items] a des données pré-existantes, affichage immédiat sans attendre le réseau !
    const initData = root.__myappleList?.readInitial(document);
    if (initData?.raw?.length) {
      const initialItems = initData.raw
        .map((r) => root.__myappleList.normalizeItem(r, this.ctx.kind))
        .filter(Boolean);
      if (initialItems.length) {
        this.updateData(initialItems, false);
      }
    }

    // 3. Chargement complet paginé / cache en arrière-plan
    this.loadData();
  }

  async loadData() {
    if (!root.__myappleList) return;
    try {
      const res = await root.__myappleList.loadList({
        kind: this.ctx.kind,
        user: this.ctx.user,
        onProgress: (p) => {
          this.updateLoadingProgress(p);
        },
      });
      this.isLoading = false;
      this.updateData(res.items, true);
    } catch (err) {
      this.isLoading = false;
      this.renderError(err);
    }
  }

  updateLoadingProgress(p) {
    const badge = this.container.querySelector(".apl-loading-badge");
    if (badge) {
      badge.textContent = `Chargement (${p.loaded}… / page ${p.pages + 1})`;
    }
  }

  updateData(items, isComplete) {
    this.items = items;
    this.absorbDirty();
    this.computeStats();
    this.applyFilters();
    this.renderFull();
    if (!isComplete) {
      const badge = this.container.querySelector(".apl-loading-badge");
      if (badge) badge.style.display = "inline-flex";
    }
  }

  // Les pages load.json qui arrivent APRÈS un +1/score optimiste contiennent encore
  // les anciennes valeurs serveur : on réapplique les mutations locales par-dessus.
  // Une entrée est oubliée dès que le serveur la reflète (convergence).
  absorbDirty() {
    if (!this.dirty.size) return;
    for (const [id, p] of this.dirty) {
      const it = this.items.find((x) => x.id === id);
      if (!it) continue;
      const cur = this.dirtySnapshot(it);
      if (this.sameSnapshot(cur, p)) {
        this.dirty.delete(id);
      } else {
        this.applySnapshot(it, p);
      }
    }
  }

  // Photo complète des champs éditables (optimiste) pour convergence/rollback.
  dirtySnapshot(it) {
    return {
      fait: it.progression.fait,
      volumesFait: it.progression.volumesFait ?? null,
      note: it.note,
      statut: it.statut,
      debutVu: it.debutVu ?? null,
      finVu: it.finVu ?? null,
      notes: it.notes ?? "",
      prioriteNum: it.prioriteNum ?? null,
      rewatches: it.rewatches ?? 0,
      isRewatch: !!it.isRewatch,
      tags: [...(it.tags || [])],
    };
  }

  sameSnapshot(a, b) {
    return a.fait === b.fait
      && (a.volumesFait ?? null) === (b.volumesFait ?? null)
      && a.note === b.note
      && a.statut === b.statut
      && (a.debutVu ?? null) === (b.debutVu ?? null)
      && (a.finVu ?? null) === (b.finVu ?? null)
      && (a.notes ?? "") === (b.notes ?? "")
      && (a.prioriteNum ?? null) === (b.prioriteNum ?? null)
      && (a.rewatches ?? 0) === (b.rewatches ?? 0)
      && !!a.isRewatch === !!b.isRewatch
      && (a.tags || []).join("\u0001") === (b.tags || []).join("\u0001");
  }

  applySnapshot(it, p) {
    it.progression.fait = p.fait;
    if (p.volumesFait !== undefined) it.progression.volumesFait = p.volumesFait;
    it.note = p.note;
    it.statut = p.statut;
    if (p.debutVu !== undefined) it.debutVu = p.debutVu;
    if (p.finVu !== undefined) it.finVu = p.finVu;
    if (p.notes !== undefined) it.notes = p.notes;
    if (p.prioriteNum !== undefined) it.prioriteNum = p.prioriteNum;
    if (p.rewatches !== undefined) it.rewatches = p.rewatches;
    if (p.isRewatch !== undefined) it.isRewatch = p.isRewatch;
    if (p.tags !== undefined) it.tags = [...p.tags];
  }

  computeStats() {
    const counts = { 7: this.items.length, 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
    let scoreSum = 0, scoredCount = 0, totalWatched = 0;

    for (const it of this.items) {
      if (counts[it.statut] !== undefined) counts[it.statut]++;
      if (it.note > 0) {
        scoreSum += it.note;
        scoredCount++;
      }
      if (it.progression?.fait) {
        totalWatched += it.progression.fait;
      }
    }

    const completed = counts[2] || 0;
    const completedPct = this.items.length ? Math.round((completed / this.items.length) * 100) : 0;
    const meanScore = scoredCount > 0 ? (scoreSum / scoredCount).toFixed(2) : "—";

    this.counts = counts;
    this.stats = {
      total: this.items.length,
      meanScore,
      scoredCount,
      totalWatched,
      completedPct,
    };
  }

  applyFilters() {
    let list = this.items;

    // 1. Statut
    if (this.activeStatus !== 7) {
      list = list.filter((it) => it.statut === this.activeStatus);
    }

    // 2. Recherche textuelle (titre, titreEn, tags, studios, genres)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter((it) => {
        if (it.titre?.toLowerCase().includes(q)) return true;
        if (it.titreEn?.toLowerCase().includes(q)) return true;
        if (it.studios?.some((s) => s.name?.toLowerCase().includes(q))) return true;
        if (it.genres?.some((g) => g.name?.toLowerCase().includes(q))) return true;
        if (it.tags?.some((t) => t.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    // 3. Type (Format: TV, Movie, etc.)
    if (this.selectedType !== "all") {
      list = list.filter((it) => (it.type || "").toUpperCase() === this.selectedType.toUpperCase());
    }

    // 4. Tri
    const mult = this.sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (this.sortBy) {
        case "title":
          return mult * a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" });
        case "score":
          if (a.note !== b.note) return mult * (a.note - b.note);
          return a.titre.localeCompare(b.titre);
        case "malScore":
          return mult * ((a.scoreMal || 0) - (b.scoreMal || 0));
        case "updated":
          return mult * ((a.majLe || 0) - (b.majLe || 0));
        case "popularity":
          return mult * ((a.popularite || 999999) - (b.popularite || 999999));
        case "year":
          return mult * ((a.annee || 0) - (b.annee || 0));
        case "progress": {
          const pa = a.progression?.fait || 0;
          const pb = b.progression?.fait || 0;
          return mult * (pa - pb);
        }
        default:
          return 0;
      }
    });

    this.filteredItems = list;
    this.renderedCount = 0;
  }

  async reload(force = true) {
    const btnRefresh = this.container.querySelector(".apl-refresh-btn");
    const badge = this.container.querySelector(".apl-loading-badge");
    if (btnRefresh) {
      btnRefresh.disabled = true;
      btnRefresh.classList.add("spinning");
    }
    if (badge) {
      badge.textContent = "Synchronisation en cours…";
      badge.style.display = "inline-flex";
    }
    try {
      const res = await root.__myappleList.loadList({
        kind: this.ctx.kind,
        user: this.ctx.user,
        force,
        onProgress: (p) => this.updateLoadingProgress(p),
      });
      this.isLoading = false;
      this.updateData(res.items, true);
      if (badge) {
        badge.textContent = "✔ Synchronisé";
        setTimeout(() => { if (badge) badge.style.display = "none"; }, 3000);
      }
    } catch (e) {
      if (badge) badge.textContent = "Erreur de synchro";
    } finally {
      if (btnRefresh) {
        btnRefresh.disabled = false;
        btnRefresh.classList.remove("spinning");
      }
    }
  }

  // Structure complète
  renderFull() {
    this.container.innerHTML = "";

    // Bannière floue d'ambiance
    const topItem = this.items.find((it) => it.note >= 9 && it.img) || this.items[0];
    const banner = el("div", "apl-list-banner", this.container);
    banner.setAttribute("aria-hidden", "true");
    if (topItem?.img) {
      banner.style.backgroundImage = `url("${topItem.img}")`;
    }

    // 1. Hero
    this.renderHero();

    // 2. Barre d'outils / Contrôles
    this.renderControls();

    // 3. Conteneur principal (Grille ou Tableau)
    this.viewContent = el("div", "apl-list-content", this.container);
    this.renderItemsBatch();

    // 4. Sentinelle de scroll infini
    this.setupInfiniteScroll();
  }

  renderHero() {
    const isAnime = this.ctx.kind === "anime";
    const kindLabel = isAnime ? "Anime List" : "Manga List";
    const otherKind = isAnime ? "manga" : "anime";
    const otherLabel = isAnime ? "Manga List" : "Anime List";

    const hero = el("section", "apl-list-hero", this.container);
    const main = el("div", "apl-list-hero-main", hero);

    // Identité utilisateur & titre
    const who = el("div", "apl-list-who", main);
    const titleRow = el("div", "apl-list-title-row", who);
    const h1 = el("h1", null, titleRow, `${this.ctx.user} · ${kindLabel}`);

    if (this.isOwnList) {
      el("span", "apl-badge-own", titleRow, "Ma liste");
    }

    // Switcher de listes (Anime <-> Manga)
    const switchers = el("div", "apl-list-switchers", who);
    const btnActive = el("a", "apl-pill-btn active", switchers, kindLabel);
    btnActive.href = `https://myanimelist.net/${this.ctx.kind}list/${encodeURIComponent(this.ctx.user)}`;

    const btnOther = el("a", "apl-pill-btn", switchers, otherLabel);
    btnOther.href = `https://myanimelist.net/${otherKind}list/${encodeURIComponent(this.ctx.user)}`;

    const btnProf = el("a", "apl-pill-btn apl-pill-ghost", switchers, "Profil ↗");
    btnProf.href = `https://myanimelist.net/profile/${encodeURIComponent(this.ctx.user)}`;

    // Bouton Actualiser propre
    const btnRefresh = el("button", "apl-pill-btn apl-pill-ghost apl-refresh-btn", switchers);
    btnRefresh.type = "button";
    btnRefresh.title = "Actualiser la liste (vide le cache et récupère les données à jour)";
    btnRefresh.innerHTML = `<span class="apl-refresh-icon" aria-hidden="true">↻</span> Actualiser`;
    btnRefresh.addEventListener("click", () => this.reload(true));

    const loadingBadge = el("span", "apl-loading-badge", switchers, "Chargement…");
    if (!this.isLoading) loadingBadge.style.display = "none";

    // KPIs Apple
    const kpis = el("div", "apl-list-kpis", hero);
    const kpi = (val, label) => {
      const k = el("div", "apl-list-kpi", kpis);
      el("b", null, k, String(val));
      el("span", null, k, label);
    };

    kpi(this.stats.total.toLocaleString("fr-FR"), isAnime ? "Animes" : "Mangas");
    kpi((this.counts[1] || 0).toLocaleString("fr-FR"), "En cours");
    kpi((this.counts[2] || 0).toLocaleString("fr-FR"), "Terminés");
    kpi(String(this.stats.meanScore).replace(".", ","), "Note moy.");

    const kpiProg = el("div", "apl-list-kpi apl-list-kpi-bar", kpis);
    el("b", null, kpiProg, `${this.stats.completedPct} %`);
    el("span", null, kpiProg, "Complétion");
    const bar = el("div", "apl-bar", kpiProg);
    el("i", null, bar).style.width = `${Math.min(100, this.stats.completedPct)}%`;
  }

  renderControls() {
    const isAnime = this.ctx.kind === "anime";
    const controls = el("div", "apl-list-controls", this.container);

    // Ligne 1 : Segmented Control (Onglets de Statut)
    const tabs = el("nav", "apl-status-tabs", controls);
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Filtrer par statut");

    STATUS_KEYS.forEach((s) => {
      let label = s.label;
      if (s.id === 6 && !isAnime) label = "À lire";

      const count = this.counts[s.id] ?? 0;
      const active = this.activeStatus === s.id;
      const btn = el("button", `apl-tab-btn ${active ? "active" : ""}`, tabs);
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(active));
      btn.innerHTML = `<span class="tab-label">${escapeHtml(label)}</span><span class="tab-count">${count}</span>`;

      btn.addEventListener("click", () => {
        if (this.activeStatus === s.id) return;
        this.activeStatus = s.id;
        tabs.querySelectorAll(".apl-tab-btn").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");

        // Sync URL query sans recharger la page
        const u = new URL(location.href);
        if (s.id === 7) u.searchParams.delete("status");
        else u.searchParams.set("status", String(s.id));
        history.replaceState(null, "", u.toString());

        this.applyFilters();
        this.renderItemsBatch(true);
      });
    });

    // Ligne 2 : Recherche & Filtres rapides
    const bar = el("div", "apl-filter-bar", controls);

    // Champ recherche Apple
    const searchBox = el("div", "apl-search-box", bar);
    searchBox.innerHTML = `
      <span class="apl-search-icon" aria-hidden="true">🔍</span>
      <input type="search" id="myapple-list-search" class="apl-search-input"
             placeholder="Rechercher par titre, studio, genre…" value="${escapeHtml(this.searchQuery)}" />
      <button type="button" class="apl-search-clear" aria-label="Effacer la recherche" ${this.searchQuery ? "" : "hidden"}>✕</button>
    `;

    const input = searchBox.querySelector("input");
    const clearBtn = searchBox.querySelector(".apl-search-clear");

    input.addEventListener("input", () => {
      this.searchQuery = input.value.trim();
      clearBtn.hidden = !this.searchQuery;
      this.applyFilters();
      this.renderItemsBatch(true);
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      this.searchQuery = "";
      clearBtn.hidden = true;
      input.focus();
      this.applyFilters();
      this.renderItemsBatch(true);
    });

    // Dropdown Type / Format
    const typeWrap = el("div", "apl-select-wrap", bar);
    const types = isAnime
      ? ["all", "TV", "Movie", "OVA", "Special", "ONA"]
      : ["all", "Manga", "Novel", "One-shot", "Doujinshi", "Manhwa", "Manhua"];
    const typeSelect = el("select", "apl-select", typeWrap);
    typeSelect.setAttribute("aria-label", "Filtrer par type de média");
    types.forEach((t) => {
      const opt = el("option", null, typeSelect, t === "all" ? "Tous formats" : t);
      opt.value = t;
      if (this.selectedType === t) opt.selected = true;
    });
    typeSelect.addEventListener("change", () => {
      this.selectedType = typeSelect.value;
      this.applyFilters();
      this.renderItemsBatch(true);
    });

    // Dropdown Tri
    const sortWrap = el("div", "apl-select-wrap", bar);
    const sortSelect = el("select", "apl-select", sortWrap);
    sortSelect.setAttribute("aria-label", "Trier les résultats");
    const sortOptions = [
      { id: "score", label: "Note personnelle" },
      { id: "title", label: "Titre (A → Z)" },
      { id: "updated", label: "Récemment mis à jour" },
      { id: "malScore", label: "Score MyAnimeList" },
      { id: "popularity", label: "Popularité" },
      { id: "year", label: "Année de sortie" },
      { id: "progress", label: "Progression" },
    ];
    sortOptions.forEach((o) => {
      const opt = el("option", null, sortSelect, o.label);
      opt.value = o.id;
      if (this.sortBy === o.id) opt.selected = true;
    });
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value;
      this.applyFilters();
      this.renderItemsBatch(true);
    });

    // Bouton Sens de tri (↑ / ↓)
    const dirBtn = el("button", "apl-icon-btn", bar);
    dirBtn.type = "button";
    dirBtn.setAttribute("aria-label", this.sortDir === "desc" ? "Ordre décroissant" : "Ordre croissant");
    dirBtn.title = this.sortDir === "desc" ? "Décroissant (cliquer pour inverser)" : "Croissant (cliquer pour inverser)";
    dirBtn.textContent = this.sortDir === "desc" ? "↓" : "↑";
    dirBtn.addEventListener("click", () => {
      this.sortDir = this.sortDir === "desc" ? "asc" : "desc";
      dirBtn.textContent = this.sortDir === "desc" ? "↓" : "↑";
      this.applyFilters();
      this.renderItemsBatch(true);
    });

    // Bascule Vue Grille / Tableau (boutons mémorisés pour la bascule live depuis le popup)
    const viewGroup = el("div", "apl-btn-group", bar);
    const gridBtn = el("button", `apl-icon-btn ${this.viewMode === "grid" ? "active" : ""}`, viewGroup);
    gridBtn.type = "button";
    gridBtn.title = "Vue Grille d'affiches";
    gridBtn.setAttribute("aria-label", "Vue Grille");
    gridBtn.textContent = "⊞";

    const tableBtn = el("button", `apl-icon-btn ${this.viewMode === "table" ? "active" : ""}`, viewGroup);
    tableBtn.type = "button";
    tableBtn.title = "Vue Tableau compact";
    tableBtn.setAttribute("aria-label", "Vue Tableau");
    tableBtn.textContent = "☰";
    this.gridBtn = gridBtn;
    this.tableBtn = tableBtn;

    gridBtn.addEventListener("click", () => this.setViewMode("grid"));
    tableBtn.addEventListener("click", () => this.setViewMode("table"));

    // Compteur de résultats
    this.countIndicator = el("div", "apl-filter-count", bar);
    this.updateCountIndicator();
  }

  // Bascule grille/tableau sans rechargement (clic local ou popup via content.js).
  // Conserve filtres, recherche et scroll ; seul le conteneur d'items est reconstruit.
  setViewMode(mode) {
    const next = mode === "table" ? "table" : "grid";
    if (this.viewMode === next || !this.viewContent) return;
    this.viewMode = next;
    this.gridBtn?.classList.toggle("active", next === "grid");
    this.tableBtn?.classList.toggle("active", next === "table");
    this.renderItemsBatch(true);
  }

  updateCountIndicator() {
    if (!this.countIndicator) return;
    const n = this.filteredItems.length;
    const total = this.items.length;
    this.countIndicator.textContent = `${n} entrée${n > 1 ? "s" : ""}${n !== total ? ` sur ${total}` : ""}`;
  }

  // Rendu par lots (virtualisation légère / performance)
  renderItemsBatch(reset = false) {
    if (reset) {
      this.renderedCount = 0;
      this.viewContent.innerHTML = "";
      this.updateCountIndicator();
    }

    if (!this.filteredItems.length) {
      this.renderEmptyState();
      return;
    }

    // Vue Grille ou Tableau
    if (this.viewMode === "grid") {
      let grid = this.viewContent.querySelector(".apl-poster-grid");
      if (!grid) {
        this.viewContent.innerHTML = "";
        grid = el("div", "apl-poster-grid", this.viewContent);
      }
      const nextBatch = this.filteredItems.slice(this.renderedCount, this.renderedCount + BATCH_SIZE);
      nextBatch.forEach((item) => {
        grid.appendChild(this.buildPosterCard(item));
      });
      this.renderedCount += nextBatch.length;
    } else {
      let table = this.viewContent.querySelector(".apl-table");
      if (!table) {
        this.viewContent.innerHTML = "";
        const wrap = el("div", "apl-table-wrap", this.viewContent);
        table = el("table", "apl-table", wrap);
        table.innerHTML = `
          <thead>
            <tr>
              <th class="th-img">Affiche</th>
              <th class="th-title">Titre & Détails</th>
              <th class="th-score">Note</th>
              <th class="th-progress">Progression</th>
              <th class="th-type">Format</th>
              <th class="th-status">Statut</th>
              <th class="th-mal">Score MAL</th>
              ${this.canEdit() ? '<th class="th-actions">Actions</th>' : ''}
            </tr>
          </thead>
          <tbody></tbody>
        `;
      }
      const tbody = table.querySelector("tbody");
      const nextBatch = this.filteredItems.slice(this.renderedCount, this.renderedCount + BATCH_SIZE);
      nextBatch.forEach((item) => {
        tbody.appendChild(this.buildTableRow(item));
      });
      this.renderedCount += nextBatch.length;
    }
  }

  setupInfiniteScroll() {
    if (this.sentinel) this.sentinel.remove();
    this.sentinel = el("div", "apl-scroll-sentinel", this.container);
    if (this.observer) this.observer.disconnect();

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (this.renderedCount < this.filteredItems.length) {
          this.renderItemsBatch(false);
        }
      }
    }, { rootMargin: "600px 0px" });

    this.observer.observe(this.sentinel);
  }

  // --- Carte Affiche (Grid Card) ---
  buildPosterCard(item) {
    // st-N porté par la carte : la barre de progression prend la couleur du statut en CSS pur.
    const card = el("article", `apl-card apl-poster-card st-${item.statut}`, null);
    card.dataset.entryId = String(item.id);
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${item.titre}, note ${item.note || "non noté"}`);
    if (this.pending.has(item.id)) card.classList.add("apl-pending");

    const progressPct = root.__myappleList?.progressPct(item.progression) ?? 0;
    const progressText = root.__myappleList?.formatProgression(item.progression) ?? "";
    const statusText = root.__myappleList?.statutLabel(this.ctx.kind, item.statut);

    // Conteneur affiche
    const poster = el("div", "apl-poster-thumb", card);

    // Image
    const img = el("img", null, poster);
    img.src = item.img || "https://cdn.myanimelist.net/images/qm_50.gif";
    img.alt = "";
    img.loading = "lazy";
    img.onload = () => img.classList.add("loaded");
    if (img.complete) img.classList.add("loaded");

    // Badge Note (bouton d'édition rapide sur sa propre liste, simple pastille sinon)
    poster.appendChild(this.scoreBadgeNode(item));

    // Pastille Statut
    const statusDot = el("span", `apl-status-dot st-${item.statut}`, poster);
    statusDot.title = statusText;

    // Boutons d'action (edit + delete) - seulement sur sa propre liste
    if (this.canEdit()) {
      const actions = el("div", "apl-card-actions", poster);
      const editBtn = el("button", "apl-card-action-btn edit-btn", actions, "✎");
      editBtn.type = "button";
      editBtn.title = "Modifier cette entrée";
      editBtn.setAttribute("aria-label", `Modifier ${item.titre}`);
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openEditModal(item);
      });

      const deleteBtn = el("button", "apl-card-action-btn delete-btn", actions, "🗑");
      deleteBtn.type = "button";
      deleteBtn.title = "Supprimer de la liste";
      deleteBtn.setAttribute("aria-label", `Supprimer ${item.titre} de la liste`);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openDeleteConfirm(item);
      });
    }

    // Barre de progression au bas de l'affiche
    if (progressPct > 0) {
      const pbar = el("div", "apl-card-progress", poster);
      el("i", null, pbar).style.width = `${progressPct}%`;
    }

    // Informations sous l'affiche
    const info = el("div", "apl-card-info", card);
    const title = el("h3", "apl-card-title", info, item.titre);
    title.title = item.titre;

    const meta = el("div", "apl-card-meta", info);
    const typeYear = [item.type, item.annee].filter(Boolean).join(" · ");
    if (typeYear) el("span", "apl-card-sub", meta, typeYear);

    const progRow = el("div", "apl-card-prog-row", info);
    const progLeft = el("span", "apl-prog-left", progRow);
    el("span", "apl-card-prog", progLeft, progressText);
    if (this.canEdit() && root.__myappleList?.canQuickPlus(item)) {
      progLeft.appendChild(this.plusButton(item));
    }

    if (item.scoreMal) {
      el("span", "apl-card-mal", progRow, `MAL ${item.scoreMal.toFixed(1)}`);
    }

    // Clic / Entrée : ouvre la modal de détail. Les contrôles inline (+1, note)
    // gèrent leurs propres événements : la carte les ignore.
    const open = () => this.openModal(item);
    card.addEventListener("click", (e) => {
      if (e.target.closest("button, select, input, a")) return;
      open();
    });
    card.addEventListener("keydown", (e) => {
      if (e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    return card;
  }

  // --- Ligne Tableau (Table Row) ---
  buildTableRow(item) {
    // st-N porté par la ligne : barre de progression + pastille colorées en CSS pur.
    const tr = el("tr", `apl-table-row st-${item.statut}`, null);
    tr.dataset.entryId = String(item.id);
    tr.setAttribute("tabindex", "0");
    tr.setAttribute("role", "button");
    if (this.pending.has(item.id)) tr.classList.add("apl-pending");

    const progressPct = root.__myappleList?.progressPct(item.progression) ?? 0;
    const progressText = root.__myappleList?.formatProgression(item.progression) ?? "";
    const statusText = root.__myappleList?.statutLabel(this.ctx.kind, item.statut);

    // 1. Affiche
    const tdImg = el("td", "td-img", tr);
    const im = el("img", null, tdImg);
    im.src = item.img || "https://cdn.myanimelist.net/images/qm_50.gif";
    im.alt = "";
    im.loading = "lazy";
    im.onload = () => im.classList.add("loaded");
    if (im.complete) im.classList.add("loaded");

    // 2. Titre & Genres
    const tdTitle = el("td", "td-title", tr);
    const a = el("span", "apl-title-text", tdTitle, item.titre);
    if (item.titreEn && item.titreEn !== item.titre) {
      el("span", "apl-title-en", tdTitle, item.titreEn);
    }
    if (item.genres?.length) {
      const tags = el("div", "apl-table-tags", tdTitle);
      item.genres.slice(0, 3).forEach((g) => {
        el("span", "apl-tag", tags, g.name);
      });
    }

    // 3. Note (micro-stepper −/+ sur sa propre liste, pastille seule sinon)
    const tdScore = el("td", "td-score", tr);
    if (this.canEdit()) {
      const stepper = el("span", "apl-score-stepper", tdScore);
      const minus = el("button", "apl-step-btn", stepper, "−");
      minus.type = "button";
      minus.setAttribute("aria-label", `Baisser ma note pour ${item.titre}`);
      const sc = el("span", `apl-table-score ${item.note >= 8 ? "high" : ""}`, stepper);
      sc.innerHTML = `<span class="star">★</span> ${item.note > 0 ? item.note : "—"}`;
      const plus = el("button", "apl-step-btn", stepper, "+");
      plus.type = "button";
      plus.setAttribute("aria-label", `Augmenter ma note pour ${item.titre}`);
      if (this.pending.has(item.id)) { minus.disabled = true; plus.disabled = true; }
      minus.addEventListener("click", (e) => { e.stopPropagation(); this.applyScore(item, item.note - 1); });
      plus.addEventListener("click", (e) => { e.stopPropagation(); this.applyScore(item, (item.note || 0) + 1); });
    } else {
      const scoreVal = item.note > 0 ? item.note : "—";
      const sc = el("span", `apl-table-score ${item.note >= 8 ? "high" : ""}`, tdScore);
      sc.innerHTML = `<span class="star">★</span> ${scoreVal}`;
    }

    // 4. Progression (+1 inline sur sa propre liste quand il reste à voir/lire)
    const tdProg = el("td", "td-progress", tr);
    const progWrap = el("div", "apl-prog-wrap", tdProg);
    el("div", "apl-prog-label", progWrap, progressText);
    if (this.canEdit() && root.__myappleList?.canQuickPlus(item)) {
      progWrap.appendChild(this.plusButton(item));
    }
    if (progressPct > 0) {
      const b = el("div", "apl-bar apl-table-bar", tdProg);
      el("i", null, b).style.width = `${progressPct}%`;
    }

    // 5. Type
    const tdType = el("td", "td-type", tr);
    el("span", "apl-type-pill", tdType, item.type || "—");

    // 6. Statut
    const tdStat = el("td", "td-status", tr);
    const stPill = el("span", `apl-status-pill st-${item.statut}`, tdStat, statusText);

    // 7. MAL Score
    const tdMal = el("td", "td-mal", tr);
    tdMal.textContent = item.scoreMal ? item.scoreMal.toFixed(2) : "—";

    // 8. Actions (edit + delete) - seulement sur sa propre liste
    if (this.canEdit()) {
      const tdActions = el("td", "td-actions", tr);
      const actions = el("div", "apl-table-actions", tdActions);
      const editBtn = el("button", "apl-table-action-btn edit-btn", actions, "✎");
      editBtn.type = "button";
      editBtn.title = "Modifier cette entrée";
      editBtn.setAttribute("aria-label", `Modifier ${item.titre}`);
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openEditModal(item);
      });

      const deleteBtn = el("button", "apl-table-action-btn delete-btn", actions, "🗑");
      deleteBtn.type = "button";
      deleteBtn.title = "Supprimer de la liste";
      deleteBtn.setAttribute("aria-label", `Supprimer ${item.titre} de la liste`);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openDeleteConfirm(item);
      });
    }

    const open = () => this.openModal(item);
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, select, input, a")) return;
      open();
    });
    tr.addEventListener("keydown", (e) => {
      if (e.target !== tr) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    return tr;
  }

  // --- Actions rapides inline (+1 / note) : optimistic update + rollback ---
  // Écriture réservée à sa propre liste (et à la présence de la couche updateEntry).
  canEdit() {
    return this.isOwnList && !!root.__myappleList?.updateEntry;
  }

  plusButton(item) {
    const b = el("button", "apl-plus-btn", null);
    b.type = "button";
    const unit = item.kind === "manga" ? "chapitre" : "épisode";
    b.setAttribute("aria-label", `${unit} suivant pour ${item.titre} (actuellement ${item.progression.fait})`);
    b.textContent = "+1";
    if (this.pending.has(item.id)) b.disabled = true;
    b.addEventListener("click", (e) => { e.stopPropagation(); this.quickPlus(item); });
    return b;
  }

  // Badge note de la carte : bouton d'édition sur sa liste, pastille seule sinon.
  scoreBadgeNode(item) {
    const scoreVal = item.note > 0 ? item.note : "—";
    const b = el(this.canEdit() ? "button" : "span", `apl-badge-score ${item.note >= 8 ? "high" : ""}`, null);
    if (this.canEdit()) {
      b.type = "button";
      b.setAttribute("aria-label", `Ma note : ${item.note > 0 ? `${item.note} sur 10` : "non notée"}. Activer pour modifier.`);
      b.addEventListener("click", (e) => { e.stopPropagation(); this.openScoreEditor(b, item); });
    }
    b.innerHTML = `<span class="star">★</span> ${scoreVal}`;
    return b;
  }

  // Drop-down compact 0–10 posé sur l'affiche (Échap ou sortie sans choix = annulation).
  openScoreEditor(anchor, item) {
    const thumb = anchor.parentElement;
    if (!thumb || thumb.querySelector(".apl-score-select")) return;
    const sel = document.createElement("select");
    sel.className = "apl-score-select";
    sel.setAttribute("aria-label", `Note pour ${item.titre} (0 = non noté)`);
    const opt0 = document.createElement("option");
    opt0.value = "0";
    opt0.textContent = "— Non noté";
    sel.appendChild(opt0);
    for (let n = 1; n <= 10; n++) {
      const o = document.createElement("option");
      o.value = String(n);
      o.textContent = String(n);
      if (item.note === n) o.selected = true;
      sel.appendChild(o);
    }
    if (item.note === 0) opt0.selected = true;
    let saved = false;
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", () => {
      saved = true;
      this.applyScore(item, parseInt(sel.value, 10));
    });
    sel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        this.refreshItem(item);
        this.focusBadge(item);
      }
    });
    sel.addEventListener("blur", () => { if (!saved) this.refreshItem(item); });
    anchor.replaceWith(sel);
    sel.focus({ preventScroll: true });
  }

  focusBadge(item) {
    const node = this.viewContent?.querySelector(`[data-entry-id="${item.id}"] .apl-badge-score`);
    node?.focus?.({ preventScroll: true });
  }

  // +1 optimiste : UI d'abord, réseau ensuite, rollback + toast en cas d'échec.
  async quickPlus(item) {
    const L = root.__myappleList;
    if (!L || this.pending.has(item.id)) return;
    const target = L.nextProgress(item);
    const snap = { fait: item.progression.fait, statut: item.statut };
    this.pending.add(item.id);
    this.applyLocal(item, { fait: target.fait, statut: target.statut });
    try {
      const fields = item.kind === "manga"
        ? { status: target.statut, chapters: target.fait, volumes: item.progression.volumesFait ?? 0 }
        : { status: target.statut, episodes: target.fait };
      await L.updateEntry({ kind: item.kind, id: item.id, fields });
      await L.dropCacheFor(item.kind, this.ctx.user);
      if (target.completed) this.showToast(`« ${item.titre} » terminé — statut mis à jour`, "info");
    } catch (e) {
      this.applyLocal(item, snap);
      this.showToast(`Mise à jour refusée (${this.shortErr(e)})`, "error");
    } finally {
      this.pending.delete(item.id);
      this.refreshItem(item);
    }
  }

  // Note optimiste (0 = non noté, clamp 0–10 côté données).
  async applyScore(item, score) {
    const L = root.__myappleList;
    const next = Math.max(0, Math.min(10, Math.trunc(score)));
    if (!L || next === item.note || this.pending.has(item.id)) return;
    const snap = { note: item.note };
    this.pending.add(item.id);
    this.applyLocal(item, { note: next });
    try {
      await L.updateEntry({ kind: item.kind, id: item.id, fields: { status: item.statut, score: next } });
      await L.dropCacheFor(item.kind, this.ctx.user);
    } catch (e) {
      this.applyLocal(item, snap);
      this.showToast(`Note non enregistrée (${this.shortErr(e)})`, "error");
    } finally {
      this.pending.delete(item.id);
      this.refreshItem(item);
    }
  }

  // Mutation locale + rafraîchit ciblé (jamais de full re-render : recherche, focus et scroll intacts).
  applyLocal(item, patch) {
    if (patch.fait != null) item.progression.fait = patch.fait;
    if (patch.note != null) item.note = patch.note;
    if (patch.statut != null) item.statut = patch.statut;
    this.dirty.set(item.id, { fait: item.progression.fait, note: item.note, statut: item.statut });
    this.computeStats();
    this.updateCountsUI();
    // Changement de statut sous un filtre de statut actif (succès comme rollback) :
    // l'entrée peut quitter ou rejoindre sa catégorie -> re-synchronise la liste.
    if (patch.statut != null && this.activeStatus !== 7) {
      this.applyFilters();
      this.renderItemsBatch(true);
      return;
    }
    this.refreshItem(item);
  }

  // Reconstruit la carte / ligne d'une entrée via ses builders (pastille, barre, compteurs).
  refreshItem(item) {
    if (!this.viewContent) return;
    this.viewContent.querySelectorAll(`[data-entry-id="${item.id}"]`).forEach((old) => {
      const hadFocus = old.contains(document.activeElement);
      const fresh = old.tagName === "TR" ? this.buildTableRow(item) : this.buildPosterCard(item);
      old.replaceWith(fresh);
      if (hadFocus) {
        fresh.querySelector(".apl-plus-btn, .apl-step-btn, .apl-badge-score")?.focus({ preventScroll: true });
      }
    });
  }

  // Compteurs d'onglets + KPIs du hero, sans toucher aux contrôles.
  updateCountsUI() {
    // Ordre renderHero : total, en cours, terminés, note moy., complétion.
    const counts = this.container.querySelectorAll(".apl-tab-btn .tab-count");
    STATUS_KEYS.forEach((s, i) => { if (counts[i]) counts[i].textContent = String(this.counts[s.id] ?? 0); });
    const kpis = this.container.querySelectorAll(".apl-list-kpi > b");
    if (kpis.length >= 5) {
      kpis[0].textContent = this.stats.total.toLocaleString("fr-FR");
      kpis[1].textContent = (this.counts[1] || 0).toLocaleString("fr-FR");
      kpis[2].textContent = (this.counts[2] || 0).toLocaleString("fr-FR");
      kpis[3].textContent = String(this.stats.meanScore).replace(".", ",");
      kpis[4].textContent = `${this.stats.completedPct} %`;
    }
    const bar = this.container.querySelector(".apl-list-kpi-bar .apl-bar > i");
    if (bar) bar.style.width = `${Math.min(100, this.stats.completedPct)}%`;
  }

  shortErr(e) {
    if (!e) return "erreur réseau";
    if (e.code === "auth") return "session expirée, reconnecte-toi";
    if (e.code === "csrf") return "recharge la page et réessaie";
    if (e.code === "aborted") return "délai dépassé";
    return e.code === "mal" && e.message ? e.message : "erreur réseau";
  }

  ensureToast() {
    if (document.getElementById("myapple-toast")) return;
    const t = el("div", "apl-toast", document.body);
    t.id = "myapple-toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
  }

  showToast(msg, kind = "info") {
    this.ensureToast();
    const t = document.getElementById("myapple-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("error", kind === "error");
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove("show"), kind === "error" ? 5000 : 3500);
  }

  // --- Modal de Détail Apple ---
  initModal() {
    let scrim = document.getElementById("myapple-list-scrim");
    if (!scrim) {
      scrim = el("div", null, document.body);
      scrim.id = "myapple-list-scrim";
      scrim.className = "apl-modal-scrim";
    }

    let modal = document.getElementById("myapple-list-modal");
    if (!modal) {
      modal = el("div", null, document.body);
      modal.id = "myapple-list-modal";
      modal.className = "apl-modal-dialog";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-hidden", "true");
    }

    this.modalScrim = scrim;
    this.modalDialog = modal;

    const close = () => this.closeModal();
    scrim.onclick = close;

    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open")) {
        close();
      }
    });
  }

  openModal(item) {
    if (!this.modalDialog) return;
    const isAnime = this.ctx.kind === "anime";
    const statusText = root.__myappleList?.statutLabel(this.ctx.kind, item.statut);
    const progressText = root.__myappleList?.formatProgression(item.progression) ?? "";
    const malUrl = item.url ? (item.url.startsWith("http") ? item.url : `https://myanimelist.net${item.url}`) : "";
    const editUrl = this.isOwnList ? `https://myanimelist.net/ownlist/${this.ctx.kind}/${item.id}/edit` : null;

    const genresList = item.genres?.map((g) => g.name).join(", ") || "—";
    const studiosList = item.studios?.map((s) => s.name).join(", ") || "—";

    this.modalDialog.innerHTML = `
      <button type="button" class="apl-modal-close" aria-label="Fermer la fiche">✕</button>
      <div class="apl-modal-header">
        <div class="apl-modal-cover-wrap">
          <img src="${escapeHtml(item.img)}" alt="" class="apl-modal-cover" />
        </div>
        <div class="apl-modal-hero-info">
          <div class="apl-modal-status-badge st-${item.statut}">${escapeHtml(statusText)}</div>
          <h2 class="apl-modal-title">${escapeHtml(item.titre)}</h2>
          ${item.titreEn && item.titreEn !== item.titre ? `<div class="apl-modal-sub">${escapeHtml(item.titreEn)}</div>` : ""}
          <div class="apl-modal-quick-meta">
            <span>${escapeHtml(item.type || "—")}</span>
            ${item.annee ? `<span>${item.annee}</span>` : ""}
            ${item.saison ? `<span>${escapeHtml(item.saison.nom)} ${item.saison.annee}</span>` : ""}
            ${item.scoreMal ? `<span>Score MAL <b>${item.scoreMal.toFixed(2)}</b></span>` : ""}
          </div>
          <div class="apl-modal-rating-row">
            <span class="apl-modal-rating-pill">Note perso : <b>${item.note > 0 ? item.note + " / 10" : "Non noté"}</b></span>
            <span class="apl-modal-prog-pill">Progression : <b>${escapeHtml(progressText)}</b></span>
          </div>
        </div>
      </div>
      <div class="apl-modal-body">
        <div class="apl-modal-grid">
          <div class="apl-modal-item">
            <label>Genres</label>
            <div>${escapeHtml(genresList)}</div>
          </div>
          <div class="apl-modal-item">
            <label>${isAnime ? "Studios" : "Magazines"}</label>
            <div>${escapeHtml(studiosList)}</div>
          </div>
          ${item.debutVu || item.finVu ? `
          <div class="apl-modal-item">
            <label>Dates de lecture / visionnage</label>
            <div>${escapeHtml(item.debutVu || "—")} → ${escapeHtml(item.finVu || "—")}</div>
          </div>` : ""}
          ${item.popularite ? `
          <div class="apl-modal-item">
            <label>Popularité</label>
            <div>#${item.popularite.toLocaleString("fr-FR")} (${(item.members || 0).toLocaleString("fr-FR")} membres)</div>
          </div>` : ""}
        </div>
        ${item.notes ? `
        <div class="apl-modal-notes-box">
          <label>Mes notes personnelles</label>
          <p>${escapeHtml(item.notes)}</p>
        </div>` : ""}
        <div class="apl-modal-actions">
          ${malUrl ? `<a href="${escapeHtml(malUrl)}" target="_blank" rel="noopener" class="apl-btn apl-btn-primary">Fiche MyAnimeList ↗</a>` : ""}
          ${editUrl ? `<a href="${escapeHtml(editUrl)}" target="_blank" rel="noopener" class="apl-btn apl-btn-secondary apl-modal-edit-btn">Modifier mon entrée ✎</a>` : ""}
        </div>
      </div>
    `;

    const editBtn = this.modalDialog.querySelector(".apl-modal-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        this.needsRefreshOnFocus = true;
      });
    }

    this.modalDialog.querySelector(".apl-modal-close").onclick = () => this.closeModal();

    this.modalScrim.classList.add("open");
    this.modalDialog.classList.add("open");
    this.modalDialog.setAttribute("aria-hidden", "false");
    this.modalDialog.querySelector(".apl-modal-close")?.focus();
  }

  closeModal() {
    if (!this.modalDialog) return;
    this.modalScrim.classList.remove("open");
    this.modalDialog.classList.remove("open");
    this.modalDialog.setAttribute("aria-hidden", "true");
  }

  // --- Edit Modal / Drawer ---
  initEditModal() {
    let scrim = document.getElementById("myapple-edit-scrim");
    if (!scrim) {
      scrim = el("div", null, document.body);
      scrim.id = "myapple-edit-scrim";
      scrim.className = "apl-edit-modal-scrim";
    }

    let drawer = document.getElementById("myapple-edit-drawer");
    if (!drawer) {
      drawer = el("div", null, document.body);
      drawer.id = "myapple-edit-drawer";
      drawer.className = "apl-edit-drawer";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-modal", "true");
      drawer.setAttribute("aria-hidden", "true");
    }

    this.editScrim = scrim;
    this.editDrawer = drawer;

    const close = () => this.closeEditModal();
    scrim.onclick = close;

    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("open")) {
        close();
      }
    });
  }

  openEditModal(item) {
    if (!this.editDrawer) this.initEditModal();

    const isAnime = this.ctx.kind === "anime";
    const statusOptions = isAnime
      ? [
          { id: 1, label: "En cours" },
          { id: 2, label: "Terminé" },
          { id: 3, label: "En pause" },
          { id: 4, label: "Abandonné" },
          { id: 6, label: "À voir" },
        ]
      : [
          { id: 1, label: "En cours" },
          { id: 2, label: "Terminé" },
          { id: 3, label: "En pause" },
          { id: 4, label: "Abandonné" },
          { id: 6, label: "À lire" },
        ];

    const scoreOptions = Array.from({ length: 11 }, (_, i) => ({ value: i, label: i === 0 ? "— Non noté" : String(i) }));
    const priorityOptions = [
      { value: 0, label: "Basse" },
      { value: 1, label: "Normale" },
      { value: 2, label: "Haute" },
    ];

    this.editDrawer.innerHTML = `
      <div class="apl-edit-header">
        <h2 class="apl-edit-title">Modifier mon entrée</h2>
        <button type="button" class="apl-edit-close" aria-label="Fermer">✕</button>
      </div>
      <div class="apl-edit-body">
        <div class="apl-edit-section">
          <div class="apl-edit-section-title">Statut & Note</div>
          <div class="apl-edit-row">
            <div class="apl-edit-field">
              <label for="edit-status">Statut</label>
              <select id="edit-status">
                ${statusOptions.map((s) => `<option value="${s.id}" ${item.statut === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </div>
            <div class="apl-edit-field">
              <label for="edit-score">Note (0-10)</label>
              <select id="edit-score">
                ${scoreOptions.map((s) => `<option value="${s.value}" ${item.note === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div class="apl-edit-section">
          <div class="apl-edit-section-title">Progression</div>
          <div class="apl-edit-row">
            <div class="apl-edit-field">
              <label for="edit-progress">${isAnime ? "Épisodes vus" : "Chapitres lus"}</label>
              <input type="number" id="edit-progress" min="0" value="${item.progression?.fait || 0}" />
            </div>
            ${!isAnime ? `
            <div class="apl-edit-field">
              <label for="edit-volumes">Volumes lus</label>
              <input type="number" id="edit-volumes" min="0" value="${item.progression?.volumesFait || 0}" />
            </div>
            ` : ""}
          </div>
          <div class="apl-edit-field">
            <label for="edit-rewatch">Re-visions / Re-lectures</label>
            <input type="number" id="edit-rewatch" min="0" value="${item.rewatches || 0}" />
          </div>
        </div>

        <div class="apl-edit-section">
          <div class="apl-edit-section-title">Dates</div>
          <div class="apl-edit-row">
            <div class="apl-edit-field">
              <label for="edit-start">Date de début</label>
              <input type="date" id="edit-start" value="${item.debutVu || ""}" />
            </div>
            <div class="apl-edit-field">
              <label for="edit-finish">Date de fin</label>
              <input type="date" id="edit-finish" value="${item.finVu || ""}" />
            </div>
          </div>
        </div>

        <div class="apl-edit-section">
          <div class="apl-edit-section-title">Priorité</div>
          <div class="apl-edit-field">
            <label for="edit-priority">Priorité</label>
            <select id="edit-priority">
              ${priorityOptions.map((p) => `<option value="${p.value}" ${(item.prioriteNum ?? 1) === p.value ? "selected" : ""}>${p.label}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="apl-edit-section">
          <div class="apl-edit-section-title">Notes personnelles</div>
          <div class="apl-edit-field">
            <label for="edit-notes">Commentaire</label>
            <textarea id="edit-notes" placeholder="Vos notes personnelles...">${item.notes || ""}</textarea>
          </div>
        </div>
      </div>
      <div class="apl-edit-footer">
        <button type="button" class="apl-btn apl-btn-secondary" id="edit-cancel">Annuler</button>
        <button type="button" class="apl-btn apl-btn-primary" id="edit-save">
          <span class="apl-edit-btn-text">Enregistrer</span>
        </button>
      </div>
    `;

    const closeBtn = this.editDrawer.querySelector(".apl-edit-close");
    const cancelBtn = this.editDrawer.querySelector("#edit-cancel");
    const saveBtn = this.editDrawer.querySelector("#edit-save");

    closeBtn.onclick = () => this.closeEditModal();
    cancelBtn.onclick = () => this.closeEditModal();

    saveBtn.onclick = () => this.saveEdit(item);

    this.editScrim.classList.add("open");
    this.editDrawer.classList.add("open");
    this.editDrawer.setAttribute("aria-hidden", "false");
    closeBtn.focus();
  }

  closeEditModal() {
    if (!this.editDrawer) return;
    this.editScrim.classList.remove("open");
    this.editDrawer.classList.remove("open");
    this.editDrawer.setAttribute("aria-hidden", "true");
  }

  async saveEdit(item) {
    const L = root.__myappleList;
    if (!L || this.pending.has(item.id)) return;

    const status = parseInt(this.editDrawer.querySelector("#edit-status").value, 10);
    const score = parseInt(this.editDrawer.querySelector("#edit-score").value, 10);
    const progress = parseInt(this.editDrawer.querySelector("#edit-progress").value, 10) || 0;
    const volumes = this.ctx.kind === "manga" ? (parseInt(this.editDrawer.querySelector("#edit-volumes").value, 10) || 0) : 0;
    const rewatch = parseInt(this.editDrawer.querySelector("#edit-rewatch").value, 10) || 0;
    const start = this.editDrawer.querySelector("#edit-start").value || null;
    const finish = this.editDrawer.querySelector("#edit-finish").value || null;
    const priority = parseInt(this.editDrawer.querySelector("#edit-priority").value, 10);
    const notes = this.editDrawer.querySelector("#edit-notes").value || "";

    const snap = this.dirtySnapshot(item);
    this.pending.add(item.id);

    const saveBtn = this.editDrawer.querySelector("#edit-save");
    const originalText = saveBtn.querySelector(".apl-edit-btn-text").textContent;
    saveBtn.querySelector(".apl-edit-btn-text").textContent = "Enregistrement...";
    saveBtn.disabled = true;

    this.applyLocal(item, {
      fait: progress,
      volumesFait: this.ctx.kind === "manga" ? volumes : undefined,
      note: score,
      statut: status,
      debutVu: start,
      finVu: finish,
      rewatches: rewatch,
      prioriteNum: priority,
      notes,
    });

    try {
      const fields = this.ctx.kind === "manga"
        ? { status, score, chapters: progress, volumes, rewatch: rewatch > 0 ? rewatch : undefined, start_date: start, finish_date: finish, priority, comments: notes }
        : { status, score, episodes: progress, rewatch: rewatch > 0 ? rewatch : undefined, start_date: start, finish_date: finish, priority, comments: notes };

      await L.updateEntry({ kind: item.kind, id: item.id, fields });
      await L.dropCacheFor(item.kind, this.ctx.user);
      this.showToast("Entrée mise à jour", "info");
      this.closeEditModal();
    } catch (e) {
      this.applyLocal(item, snap);
      this.showToast(`Erreur de mise à jour (${this.shortErr(e)})`, "error");
    } finally {
      this.pending.delete(item.id);
      this.refreshItem(item);
      saveBtn.querySelector(".apl-edit-btn-text").textContent = originalText;
      saveBtn.disabled = false;
    }
  }

  // --- Delete Confirmation Modal ---
  initDeleteModal() {
    let scrim = document.getElementById("myapple-confirm-scrim");
    if (!scrim) {
      scrim = el("div", null, document.body);
      scrim.id = "myapple-confirm-scrim";
      scrim.className = "apl-confirm-scrim";
    }

    let dialog = document.getElementById("myapple-confirm-dialog");
    if (!dialog) {
      dialog = el("div", null, document.body);
      dialog.id = "myapple-confirm-dialog";
      dialog.className = "apl-confirm-dialog";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-hidden", "true");
    }

    this.deleteScrim = scrim;
    this.deleteDialog = dialog;

    scrim.onclick = () => this.closeDeleteModal();

    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dialog.classList.contains("open")) {
        this.closeDeleteModal();
      }
    });
  }

  openDeleteConfirm(item) {
    if (!this.deleteDialog) this.initDeleteModal();

    this.deleteDialog.innerHTML = `
      <h3 class="apl-confirm-title">Supprimer de votre liste ?</h3>
      <p class="apl-confirm-message">Cette action est irréversible. Voulez-vous vraiment supprimer cette entrée de votre liste ?</p>
      <div class="apl-confirm-item">
        <img src="${escapeHtml(item.img)}" alt="" />
        <span class="apl-confirm-item-title">${escapeHtml(item.titre)}</span>
      </div>
      <div class="apl-confirm-actions">
        <button type="button" class="apl-btn apl-btn-secondary" id="delete-cancel">Annuler</button>
        <button type="button" class="apl-btn apl-btn-danger" id="delete-confirm">Supprimer</button>
      </div>
    `;

    const cancelBtn = this.deleteDialog.querySelector("#delete-cancel");
    const confirmBtn = this.deleteDialog.querySelector("#delete-confirm");

    cancelBtn.onclick = () => this.closeDeleteModal();
    confirmBtn.onclick = () => this.deleteEntry(item);

    this.deleteScrim.classList.add("open");
    this.deleteDialog.classList.add("open");
    this.deleteDialog.setAttribute("aria-hidden", "false");
    cancelBtn.focus();
  }

  closeDeleteModal() {
    if (!this.deleteDialog) return;
    this.deleteScrim.classList.remove("open");
    this.deleteDialog.classList.remove("open");
    this.deleteDialog.setAttribute("aria-hidden", "true");
  }

  async deleteEntry(item) {
    const L = root.__myappleList;
    if (!L || this.pending.has(item.id)) return;

    this.pending.add(item.id);

    const confirmBtn = this.deleteDialog.querySelector("#delete-confirm");
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = "Suppression...";
    confirmBtn.disabled = true;

    try {
      await L.deleteEntry({ kind: item.kind, id: item.id });
      await L.dropCacheFor(item.kind, this.ctx.user);

      this.items = this.items.filter((it) => it.id !== item.id);
      this.computeStats();
      this.applyFilters();
      this.renderItemsBatch(true);
      this.updateCountsUI();

      this.showToast(`« ${item.titre} » supprimé de votre liste`, "info");
      this.closeDeleteModal();
    } catch (e) {
      this.showToast(`Erreur de suppression (${this.shortErr(e)})`, "error");
    } finally {
      this.pending.delete(item.id);
      confirmBtn.textContent = originalText;
      confirmBtn.disabled = false;
    }
  }

  // --- États particuliers (Squelette & Vide) ---
  renderSkeleton() {
    this.container.innerHTML = `
      <section class="apl-list-hero apl-skeleton">
        <div class="apl-skel-title"></div>
        <div class="apl-skel-kpis">
          <div class="apl-skel-box"></div>
          <div class="apl-skel-box"></div>
          <div class="apl-skel-box"></div>
          <div class="apl-skel-box"></div>
        </div>
      </section>
      <div class="apl-poster-grid apl-skel-grid">
        ${Array.from({ length: 12 }).map(() => '<div class="apl-card apl-skel-card"></div>').join("")}
      </div>
    `;
  }

  renderEmptyState() {
    const isSearching = !!this.searchQuery;
    this.viewContent.innerHTML = `
      <div class="apl-empty-state">
        <div class="apl-empty-icon">${isSearching ? "🔍" : "📭"}</div>
        <h3>${isSearching ? "Aucun résultat trouvé" : "Aucun titre dans cette catégorie"}</h3>
        <p class="apl-muted">
          ${isSearching
            ? `Aucun titre ne correspond à « ${escapeHtml(this.searchQuery)} » avec les filtres actuels.`
            : "Il n'y a pour l'instant aucun élément avec ce statut."}
        </p>
        ${isSearching ? '<button type="button" class="apl-btn apl-btn-secondary apl-reset-btn">Réinitialiser les filtres</button>' : ""}
      </div>
    `;

    const resetBtn = this.viewContent.querySelector(".apl-reset-btn");
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.searchQuery = "";
        this.selectedType = "all";
        this.activeStatus = 7;
        const input = document.getElementById("myapple-list-search");
        if (input) input.value = "";
        this.applyFilters();
        this.renderFull();
      };
    }
  }

  renderError(err) {
    const isPrivate = err?.code === "private";
    this.container.innerHTML = `
      <div class="apl-empty-state apl-error-state">
        <div class="apl-empty-icon">${isPrivate ? "🔒" : "⚠️"}</div>
        <h3>${isPrivate ? "Cette liste est privée" : "Impossible de charger la liste"}</h3>
        <p class="apl-muted">
          ${isPrivate
            ? `L'utilisateur ${escapeHtml(this.ctx.user)} a restreint l'accès à sa liste.`
            : `Une erreur est survenue lors de la récupération (${escapeHtml(err.message || "erreur réseau")}).`}
        </p>
        <a href="https://myanimelist.net/profile/${encodeURIComponent(this.ctx.user)}" class="apl-btn apl-btn-primary">Retour au profil</a>
      </div>
    `;
  }
}

function buildListView() {
  if (document.getElementById("myapple-list")) return;
  const ctx = root.__myappleList?.kindFromPath(root.location?.pathname);
  if (!ctx || !["anime", "manga"].includes(ctx.kind)) return;

  const view = new ListView(ctx);
  view.init();
  root.__myappleListView.currentView = view;
}

root.__myappleListView = {
  ListView,
  buildListView,
  currentView: null,
  refresh: () => root.__myappleListView.currentView?.reload(true),
};
})();
