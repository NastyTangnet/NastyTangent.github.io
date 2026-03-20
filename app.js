/* Simple dropdown-based coin browser.
 *
 * Data source priority:
 * 1) `coins.json` served from this folder (GitHub Pages)
 * 2) LocalStorage (if you imported a file previously)
 */

const BASE = new URL("./", window.location.href);

// Important for GitHub Pages: avoid aggressive cache-busting on *images*.
// Using `?v=${Date.now()}` on hundreds of requests can look like a scrape and may trigger throttling.
// We only cache-bust `coins.json` when the user explicitly taps Reload.
let coinsCacheBust = "";

function pagesRootURL() {
  // GitHub Pages for project sites is typically:
  //   https://<user>.github.io/<repo>/
  // with our site at:
  //   https://<user>.github.io/<repo>/Website/
  //
  // We derive the repo root from the first path segment so image URLs work
  // regardless of whether you're currently on `/Website/` or a hash route.
  const parts = safeText(window.location.pathname).split("/").filter(Boolean);
  const isGitHubPages = safeText(window.location.hostname).endsWith(".github.io");
  if (isGitHubPages && parts.length) return new URL(`/${parts[0]}/`, window.location.origin);
  return new URL("/", window.location.origin);
}

// Optional: a single-file BU cover sprite for your denomination icons.
// If present, it greatly reduces requests (1 SVG file instead of many images).
let buSpriteChecked = false;
let buSpriteOk = false;

const STORAGE_KEY = "jpcc_coins_v2";

let coins = [];
let groups = []; // grouped by name+year+mint
let sections = []; // grouped by coin.type (each contains series rows)
let currentTypeTitle = null;

const els = {
  subtitle: document.getElementById("subtitle"),
  meta: document.getElementById("meta"),
  typeGrid: document.getElementById("typeGrid"),
  homeView: document.getElementById("homeView"),
  typeView: document.getElementById("typeView"),
  typeBackBtn: document.getElementById("typeBackBtn"),
  typeViewTitle: document.getElementById("typeViewTitle"),
  typeViewSub: document.getElementById("typeViewSub"),
  typeViewIcon: document.getElementById("typeViewIcon"),
  typeViewList: document.getElementById("typeViewList"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
  loadingPct: document.getElementById("loadingPct"),
  loadingBarFill: document.getElementById("loadingBarFill"),

  reloadBtn: document.getElementById("reloadBtn"),
  fileInput: document.getElementById("fileInput"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),

  searchInput: document.getElementById("searchInput"),

  imageDialog: document.getElementById("imageDialog"),
  imgFull: document.getElementById("imgFull"),
  imgTitle: document.getElementById("imgTitle"),
  closeImageBtn: document.getElementById("closeImageBtn"),

  layerDialog: document.getElementById("layerDialog"),
  layerBackBtn: document.getElementById("layerBackBtn"),
  layerCloseBtn: document.getElementById("layerCloseBtn"),
  layerTitle: document.getElementById("layerTitle"),
  layerSub: document.getElementById("layerSub"),
  layerList: document.getElementById("layerList"),
  layerDetail: document.getElementById("layerDetail"),
  detailObvBtn: document.getElementById("detailObvBtn"),
  detailRevBtn: document.getElementById("detailRevBtn"),
  detailObvImg: document.getElementById("detailObvImg"),
  detailRevImg: document.getElementById("detailRevImg"),
  detailYear: document.getElementById("detailYear"),
  detailType: document.getElementById("detailType"),
  detailMint: document.getElementById("detailMint"),
  detailNotes: document.getElementById("detailNotes"),

  detailDupes: document.getElementById("detailDupes"),
  detailDupesTitle: document.getElementById("detailDupesTitle"),
  detailDupesList: document.getElementById("detailDupesList"),
};

let layerState = {
  mode: "list", // "list" | "detail"
  series: null,
  group: null,
  coinId: null, // selected coin within group
};

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

const DEBUG = new URLSearchParams(window.location.search).has("debug");
if (DEBUG) {
  // Handy in DevTools: `__cc_debug.repoRoot`, `__cc_debug.base`, etc.
  window.__cc_debug = {
    href: window.location.href,
    pathname: window.location.pathname,
    base: BASE.toString(),
    repoRoot: pagesRootURL().toString(),
    pagesRootURL,
    imageUrlCandidates,
  };
  console.log("[cc] debug", window.__cc_debug);
}

function escapeHtml(s) {
  return safeText(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRouteTypeFromHash() {
  const h = safeText(window.location.hash || "");
  if (!h.startsWith("#type=")) return null;
  try {
    return decodeURIComponent(h.slice("#type=".length)).trim() || null;
  } catch {
    return null;
  }
}

function setRouteToHome() {
  if (window.location.hash) window.location.hash = "";
  currentTypeTitle = null;
}

function setRouteToType(title) {
  const t = safeText(title).trim();
  if (!t) return;
  window.location.hash = `#type=${encodeURIComponent(t)}`;
}

function sectionKey(title) {
  return safeText(title).toLowerCase().replaceAll(" ", "_");
}

function buSpriteUrl() {
  return new URL("assets/covers/bu-covers.svg", BASE).toString();
}

function ensureBuSpriteChecked() {
  if (buSpriteChecked) return;
  buSpriteChecked = true;

  // Disabled: always prefer PNG covers over an SVG sprite.
  // (User explicitly requested "no SVG".)
  buSpriteOk = false;
}

function makeBuSpriteIcon(title) {
  if (!buSpriteOk) return null;
  const k = sectionKey(title);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";

  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  // External sprite reference. Supported in modern browsers on GitHub Pages.
  use.setAttribute("href", `${buSpriteUrl()}#${k}`);

  svg.appendChild(use);
  return svg;
}

function year4(coinYear) {
  const digits = safeText(coinYear).replace(/\D/g, "");
  return digits.slice(0, 4);
}

function yearSortKey(v) {
  const digits = safeText(v).replace(/\D/g, "");
  const n = digits ? Number.parseInt(digits.slice(0, 4), 10) : NaN;
  return Number.isFinite(n) ? n : 99999;
}

function normalizeMint(m) {
  const t = safeText(m).trim();
  if (!t) return "P";
  const up = t.toUpperCase();
  if (up === "(P)" || up === "PHILADELPHIA" || up === "NO MINT MARK" || up === "(NO MINT MARK)") return "P";
  if (up === "DENVER") return "D";
  if (up === "SAN FRANCISCO") return "S";
  if (up === "WEST POINT") return "W";
  if (up === "NEW ORLEANS") return "O";
  if (up === "CARSON CITY" || up === "CARSON") return "CC";
  return up;
}

function mintSuffix(mint) {
  const mark = normalizeMint(mint);
  if (!mark || mark === "P") return "";
  return `-${mark}`;
}

function groupKey(c) {
  return `${safeText(c.name).toLowerCase().trim()}|${year4(c.year)}|${normalizeMint(c.mint).toLowerCase()}`;
}

function parseCoins(json) {
  if (!Array.isArray(json)) throw new Error("coins.json must be a JSON array.");
  return json.map((c) => ({
    id: safeText(c.id || ""),
    name: safeText(c.name),
    year: safeText(c.year),
    type: safeText(c.type),
    mint: safeText(c.mint),
    notes: safeText(c.notes),
    obverseImageData: c.obverseImageData ?? null,
    reverseImageData: c.reverseImageData ?? null,
  }));
}

function embeddedDataUrl(coin, side) {
  const raw = side === "rev" ? coin.reverseImageData : coin.obverseImageData;
  if (!raw || typeof raw !== "string") return null;
  return `data:image/jpeg;base64,${raw}`;
}

function imageUrlCandidates(coin, side) {
  // We try multiple patterns because your repo may contain either:
  // - `NastyTangent.github/coin-images/<uuid-lower>/obv.jpg` (nested folder layout at repo root)
  // - `coin-images/<uuid-lower>/obv.jpg` (repo-root layout)
  // - Flat zip exports like `coin-images/<UUID>-obv.jpg`
  const rawID = safeText(coin.id);
  const lower = rawID.toLowerCase();
  const upper = rawID.toUpperCase();
  const sideFile = side === "rev" ? "rev.jpg" : "obv.jpg";
  const sideTag = side === "rev" ? "rev" : "obv";

  const out = [];

  const repoRoot = pagesRootURL();

  // Repo-root (preferred for GitHub Pages): images live under `NastyTangent.github/coin-images`.
  if (lower) out.push(new URL(`NastyTangent.github/coin-images/${lower}/${sideFile}`, repoRoot).toString());
  if (upper && upper !== lower) out.push(new URL(`NastyTangent.github/coin-images/${upper}/${sideFile}`, repoRoot).toString());

  // Repo-root: images live directly under `coin-images/` at the repo root.
  if (lower) out.push(new URL(`coin-images/${lower}/${sideFile}`, repoRoot).toString());
  if (upper && upper !== lower) out.push(new URL(`coin-images/${upper}/${sideFile}`, repoRoot).toString());

  // Folder-based (alternate): images live alongside the current page (e.g. inside `/Website/coin-images/`).
  if (lower) out.push(new URL(`coin-images/${lower}/${sideFile}`, BASE).toString());
  if (upper && upper !== lower) out.push(new URL(`coin-images/${upper}/${sideFile}`, BASE).toString());

  // Flat files (zip-style)
  if (upper) out.push(new URL(`NastyTangent.github/coin-images/${upper}-${sideTag}.jpg`, repoRoot).toString());
  if (lower && lower !== upper) out.push(new URL(`NastyTangent.github/coin-images/${lower}-${sideTag}.jpg`, repoRoot).toString());
  if (upper) out.push(new URL(`coin-images/${upper}-${sideTag}.jpg`, repoRoot).toString());
  if (lower && lower !== upper) out.push(new URL(`coin-images/${lower}-${sideTag}.jpg`, repoRoot).toString());
  if (upper) out.push(new URL(`coin-images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (lower && lower !== upper) out.push(new URL(`coin-images/${lower}-${sideTag}.jpg`, BASE).toString());

  // If you kept an `images/` folder inside coin-images or at site root
  if (upper) out.push(new URL(`NastyTangent.github/coin-images/images/${upper}-${sideTag}.jpg`, repoRoot).toString());
  if (upper) out.push(new URL(`coin-images/images/${upper}-${sideTag}.jpg`, repoRoot).toString());
  if (upper) out.push(new URL(`coin-images/images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (upper) out.push(new URL(`images/${upper}-${sideTag}.jpg`, BASE).toString());

  // De-dupe while preserving order.
  return [...new Set(out)];
}

function bestImageUrl(coin, side) {
  // Prefer file images (first candidate), then embedded thumbs (if present), otherwise null.
  const candidates = imageUrlCandidates(coin, side);
  if (candidates.length) return candidates[0];
  return embeddedDataUrl(coin, side) || null;
}

function buildGroups(coinsArr) {
  const map = new Map();
  for (const c of coinsArr) {
    const k = groupKey(c);
    const existing = map.get(k);
    if (existing) existing.items.push(c);
    else map.set(k, { key: k, items: [c] });
  }
  const out = [];
  for (const g of map.values()) {
    const rep = g.items[0];
    out.push({
      key: g.key,
      name: rep.name,
      year: year4(rep.year),
      type: rep.type,
      mint: normalizeMint(rep.mint),
      notes: rep.notes,
      qty: g.items.length,
      items: g.items,
    });
  }
  return out;
}

const SECTION_ORDER = ["Dollar", "Penny", "Commemoratives", "Nickel", "Dime", "Quarter", "Half Dollar"];

function typeSectionTitle(typeRaw) {
  const t = safeText(typeRaw).trim();
  if (!t) return "Other";
  const low = t.toLowerCase();

  // Normalize to your preferred buckets.
  if (low.includes("commemor")) return "Commemoratives";
  if (low.includes("half") && low.includes("dollar")) return "Half Dollar";
  if (low.includes("dollar")) return "Dollar";
  if (low.includes("quarter")) return "Quarter";
  if (low.includes("dime")) return "Dime";
  if (low.includes("nickel")) return "Nickel";
  if (low.includes("cent") || low.includes("penny")) return "Penny";

  // Otherwise keep the original type (Title Case-ish).
  return t;
}

function sectionOrderIndex(title) {
  const i = SECTION_ORDER.indexOf(title);
  return i === -1 ? 999 : i;
}

function coverCandidatesForSectionTitle(title) {
  const key = sectionKey(title);
  // Covers: only use PNGs (no SVG fallback).
  return [new URL(`assets/covers/${key}.png`, BASE).toString()];
}

function rangeText(minYear, maxYear) {
  const a = safeText(minYear).trim();
  const b = safeText(maxYear).trim();
  if (!a && !b) return "";
  if (a && !b) return `(${a})`;
  if (!a && b) return `(${b})`;
  if (a === b) return `(${a})`;
  return `(${a}-${b})`;
}

function buildSections(groupsArr) {
  const byType = new Map(); // title -> { title, qty, repCoin, seriesMap }

  for (const g of groupsArr) {
    const title = typeSectionTitle(g.type);
    const existing = byType.get(title);
    const sec =
      existing ||
      (() => {
        const created = { title, qty: 0, repCoin: g.items && g.items[0] ? g.items[0] : null, seriesMap: new Map() };
        byType.set(title, created);
        return created;
      })();

    sec.qty += g.qty;
    if (!sec.repCoin && g.items && g.items[0]) sec.repCoin = g.items[0];

    const seriesName = safeText(g.name).trim() || "(Untitled)";
    const sExisting = sec.seriesMap.get(seriesName);
    if (sExisting) sExisting.groups.push(g);
    else sec.seriesMap.set(seriesName, { name: seriesName, groups: [g] });
  }

  const out = [];
  for (const sec of byType.values()) {
    const seriesOut = [];
    for (const s of sec.seriesMap.values()) {
      const qty = s.groups.reduce((sum, g) => sum + g.qty, 0);
      const years = s.groups.map((g) => safeText(g.year)).filter(Boolean);
      const minYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) <= 0 ? a : b)) : "";
      const maxYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) >= 0 ? a : b)) : "";
      seriesOut.push({
        name: s.name,
        qty,
        minYear,
        maxYear,
        groups: s.groups,
        sectionTitle: sec.title,
      });
    }

    // Oldest -> newest: sort series by their earliest year, then name.
    seriesOut.sort((a, b) => yearSortKey(a.minYear) - yearSortKey(b.minYear) || a.name.localeCompare(b.name));
    out.push({
      title: sec.title,
      qty: sec.qty,
      repCoin: sec.repCoin,
      series: seriesOut,
    });
  }

  out.sort((a, b) => sectionOrderIndex(a.title) - sectionOrderIndex(b.title) || a.title.localeCompare(b.title));
  return out;
}

function setLoading(visible, text) {
  if (!els.loadingOverlay) return;
  if (typeof text === "string" && els.loadingText) els.loadingText.textContent = text;
  if (visible) els.loadingOverlay.classList.remove("loading--hidden");
  else els.loadingOverlay.classList.add("loading--hidden");
}

function setLoadingProgress(pct, text) {
  const p = Number.isFinite(pct) ? Math.min(1, Math.max(0, pct)) : 0;
  if (typeof text === "string" && els.loadingText) els.loadingText.textContent = text;
  if (els.loadingPct) els.loadingPct.textContent = `${Math.round(p * 100)}%`;

  if (els.loadingBarFill) {
    // Switch to determinate mode once we're updating by percent.
    els.loadingBarFill.classList.remove("is-indeterminate");
    const w = Math.max(2, Math.round(p * 100));
    els.loadingBarFill.style.width = `${w}%`;
  }
}

function applyFilters() {
  ensureBuSpriteChecked();
  const q = safeText(els.searchInput.value).trim().toLowerCase();

  let filteredSections = sections;
  if (q) {
    filteredSections = sections
      .map((sec) => {
        const titleHit = safeText(sec.title).toLowerCase().includes(q);
        if (titleHit) return sec;
        const matchingSeries = sec.series.filter((s) => {
          const hay = `${s.name} ${safeText(s.minYear)} ${safeText(s.maxYear)} ${s.groups
            .map((g) => `${g.year} ${g.mint} ${g.type} ${safeText(g.notes)}`)
            .join(" ")}`.toLowerCase();
          return hay.includes(q);
        });
        if (!matchingSeries.length) return null;
        return { ...sec, series: matchingSeries };
      })
      .filter(Boolean);
  }

  const routeType = getRouteTypeFromHash();
  currentTypeTitle = routeType;

  if (currentTypeTitle) {
    const sec = filteredSections.find((s) => s.title === currentTypeTitle) || sections.find((s) => s.title === currentTypeTitle);
    renderTypeView(sec || null, q);
  } else {
    renderHomeView(filteredSections);
  }

  const totalCoins = coins.length;
  const shownCoins = filteredSections.reduce((sum, sec) => sum + sec.qty, 0);
  const shownSeries = filteredSections.reduce((sum, sec) => sum + sec.series.length, 0);
  els.meta.textContent = `Showing ${filteredSections.length} section(s), ${shownSeries} series, ${shownCoins} coin(s)`;
  els.subtitle.textContent = `${totalCoins} coins • ${sections.length} sections`;
}

function renderHomeView(arr) {
  if (els.homeView) els.homeView.hidden = false;
  if (els.typeView) els.typeView.hidden = true;
  renderTypeGrid(arr);
}

function setIconFromCandidates(hostEl, candidates, embedded) {
  hostEl.innerHTML = "";
  hostEl.classList.remove("is-missing");

  const first = (candidates && candidates.length ? candidates[0] : null) || embedded;
  if (!first) {
    hostEl.classList.add("is-missing");
    return;
  }

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = first;
  img.addEventListener("error", () => {
    const next = candidates ? candidates.find((u) => u && img.src.indexOf(u) === -1) : null;
    if (next) {
      img.src = next;
      return;
    }
    if (embedded && img.src !== embedded) {
      img.src = embedded;
      return;
    }
    img.removeAttribute("src");
    img.style.display = "none";
    hostEl.classList.add("is-missing");
  });
  hostEl.appendChild(img);
}

function renderTypeView(sec, qLower) {
  if (!els.typeView) return;
  if (els.homeView) els.homeView.hidden = true;
  els.typeView.hidden = false;

  const title = sec ? sec.title : safeText(currentTypeTitle) || "—";
  const seriesArr = sec ? sec.series : [];
  const qty = sec ? sec.qty : 0;
  const years = seriesArr.map((s) => safeText(s.minYear)).concat(seriesArr.map((s) => safeText(s.maxYear))).filter(Boolean);
  const minYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) <= 0 ? a : b)) : "";
  const maxYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) >= 0 ? a : b)) : "";
  const yr = minYear && maxYear ? `${minYear}–${maxYear}` : "—";

  if (els.typeViewTitle) els.typeViewTitle.textContent = title;
  if (els.typeViewSub) els.typeViewSub.textContent = `${yr} • ${qty} coin(s)`;

  if (els.typeViewIcon) {
    // Prefer one-file BU sprite if present; else cover images; else your coin photos.
    const buIcon = makeBuSpriteIcon(title);
    if (buIcon) {
      els.typeViewIcon.innerHTML = "";
      els.typeViewIcon.classList.remove("is-missing");
      els.typeViewIcon.appendChild(buIcon);
    } else {
      const coverCandidates = coverCandidatesForSectionTitle(title);
      const rep = sec && sec.repCoin ? sec.repCoin : null;
      const photoCandidates = rep ? imageUrlCandidates(rep, "obv") : [];
      const embedded = rep ? embeddedDataUrl(rep, "obv") : null;
      setIconFromCandidates(els.typeViewIcon, [...coverCandidates, ...photoCandidates], embedded);
    }
  }

  if (!els.typeViewList) return;
  els.typeViewList.innerHTML = "";

  if (!sec) {
    const empty = document.createElement("div");
    empty.style.padding = "14px";
    empty.style.color = "rgba(17, 19, 24, 0.60)";
    empty.style.fontWeight = "750";
    empty.textContent = "No coins found for this type.";
    els.typeViewList.appendChild(empty);
    return;
  }

  // Already filtered by applyFilters when q is present, but keep it safe.
  const listArr = qLower ? seriesArr.filter((s) => safeText(s.name).toLowerCase().includes(qLower)) : seriesArr;

  for (const s of listArr) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "typeViewRow";

    const left = document.createElement("div");
    left.className = "typeViewRow__name";
    const range = rangeText(s.minYear, s.maxYear);
    left.innerHTML = `${escapeHtml(s.name)} <span class="typeViewRow__range">${escapeHtml(range)}</span>`;

    const right = document.createElement("div");
    right.className = "typeViewRow__qty";
    right.textContent = `x${Number(s.qty || 0)}`;

    row.appendChild(left);
    row.appendChild(right);
    row.addEventListener("click", () => openLayerForSeries(s));
    els.typeViewList.appendChild(row);
  }
}

function makeThumb(coin) {
  const wrap = document.createElement("div");
  wrap.className = "thumb";

  const img = document.createElement("img");
  img.alt = "Obverse";
  img.loading = "lazy";
  img.decoding = "async";

  // Lazy load only when visible.
  const candidates = imageUrlCandidates(coin, "obv");
  const embedded = embeddedDataUrl(coin, "obv");

  if (candidates.length || embedded) {
    img.dataset.src = candidates[0] || embedded;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      // Try next candidate(s), then embedded.
      const next = candidates.find((u) => u && img.src.indexOf(u) === -1);
      if (next) {
        img.src = next;
        return;
      }
      if (embedded && img.src !== embedded) {
        img.src = embedded;
        return;
      }

      // No fallback: hide the broken-image icon.
      img.removeAttribute("src");
      img.style.display = "none";
      wrap.classList.add("is-missing");
    });
    observeLazyImage(img);
  } else {
    img.style.display = "none";
    wrap.classList.add("is-missing");
  }

  wrap.appendChild(img);
  return wrap;
}

function observeLazyImage(img) {
  if (!img.dataset.src) return;
  if (!window.__lazyIO) {
    window.__lazyIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          const src = el.dataset.src;
          if (src && !el.src) el.src = src;
          window.__lazyIO.unobserve(el);
        }
      },
      { rootMargin: "300px" }
    );
  }
  window.__lazyIO.observe(img);
}

function openImage(title, src) {
  els.imgTitle.textContent = title;
  els.imgFull.src = src;
  if (typeof els.imageDialog.showModal === "function") els.imageDialog.showModal();
  else els.imageDialog.setAttribute("open", "open");
}

function openLayerForSeries(s) {
  if (!els.layerDialog) return;
  layerState = { mode: "list", series: s, group: null, coinId: null };
  renderLayer();

  if (typeof els.layerDialog.showModal === "function") els.layerDialog.showModal();
  else els.layerDialog.setAttribute("open", "open");
}

function renderLayer() {
  const s = layerState.series;
  if (!s) return;

  const yearsText = s.minYear && s.maxYear ? `${s.minYear}–${s.maxYear}` : "—";

  if (layerState.mode === "list") {
    els.layerBackBtn.textContent = "Back";
    els.layerTitle.textContent = s.name || "(Untitled)";
    els.layerSub.textContent = `${yearsText} • ${s.qty} coin(s)`;
    els.layerList.hidden = false;
    if (els.layerDetail) els.layerDetail.hidden = true;

    renderLayerList(s);
    return;
  }

  // detail
  const g = layerState.group;
  if (!g) return;
  const yearText = safeText(g.year) ? `${safeText(g.year)}${mintSuffix(g.mint)}` : "—";
  els.layerBackBtn.textContent = "Back";
  els.layerTitle.textContent = s.name || "(Untitled)";
  els.layerSub.textContent = `${yearText} • x${g.qty}`;
  els.layerList.hidden = true;
  if (els.layerDetail) els.layerDetail.hidden = false;

  renderLayerDetail(s, g);
}

function renderLayerList(s) {
  els.layerList.innerHTML = "";
  const frag = document.createDocumentFragment();
  const groupsSorted = [...s.groups].sort(
    // Oldest -> newest: year asc, then mint asc.
    (a, b) => safeText(a.year).localeCompare(safeText(b.year)) || safeText(a.mint).localeCompare(safeText(b.mint))
  );

  for (const g of groupsSorted) {
    const rep = g.items[0];
    const card = document.createElement("div");
    card.className = "groupCard";

    const head = document.createElement("div");
    head.className = "groupCard__head";
    head.appendChild(makeThumb(rep));

    const meta = document.createElement("div");
    meta.className = "groupCard__meta";

    const title = document.createElement("div");
    title.className = "groupCard__title";
    title.textContent = `${safeText(g.year) || "—"}${mintSuffix(g.mint)}`;

    const sub = document.createElement("div");
    sub.className = "groupCard__sub";

    const p1 = document.createElement("span");
    p1.className = "pill";
    p1.textContent = safeText(g.type) || "—";

    const p2 = document.createElement("span");
    p2.className = "pill qty";
    p2.textContent = `x${g.qty}`;

    sub.appendChild(p1);
    sub.appendChild(p2);

    meta.appendChild(title);
    meta.appendChild(sub);
    head.appendChild(meta);
    card.appendChild(head);

    head.addEventListener("click", () => {
      const firstCoin = g.items && g.items[0] ? g.items[0] : null;
      layerState = { mode: "detail", series: s, group: g, coinId: firstCoin ? safeText(firstCoin.id) : null };
      renderLayer();
    });

    frag.appendChild(card);
  }

  els.layerList.appendChild(frag);
}

function renderLayerDetail(s, g) {
  const rep = (g.items || []).find((c) => safeText(c.id) && safeText(c.id) === safeText(layerState.coinId)) || g.items[0];
  const yearText = safeText(g.year) ? `${safeText(g.year)}${mintSuffix(g.mint)}` : "—";

  els.detailYear.textContent = yearText;
  els.detailType.textContent = safeText(g.type) || "—";
  els.detailMint.textContent = safeText(g.mint) || "—";
  els.detailNotes.textContent = safeText(rep && rep.notes).trim() || "—";

  const setImg = (imgEl, candidates, embedded) => {
    const tile = imgEl.closest(".photoTile");
    const markMissing = () => {
      imgEl.onerror = null;
      imgEl.removeAttribute("src");
      imgEl.style.display = "none";
      if (tile) tile.classList.add("is-missing");
    };

    imgEl.onerror = null;
    imgEl.removeAttribute("src");

    if ((!candidates || !candidates.length) && !embedded) {
      markMissing();
      return;
    }

    if (tile) tile.classList.remove("is-missing");
    imgEl.style.display = "block";

    const first = candidates && candidates.length ? candidates[0] : embedded;
    if (first) imgEl.src = first;

    imgEl.onerror = () => {
      const srcNow = imgEl.src || "";
      const next = candidates ? candidates.find((u) => u && srcNow.indexOf(u) === -1) : null;
      if (next) {
        imgEl.src = next;
        return;
      }
      if (embedded && srcNow !== embedded) {
        imgEl.src = embedded;
        return;
      }
      markMissing();
    };
  };

  setImg(els.detailObvImg, rep ? imageUrlCandidates(rep, "obv") : [], rep ? embeddedDataUrl(rep, "obv") : null);
  setImg(els.detailRevImg, rep ? imageUrlCandidates(rep, "rev") : [], rep ? embeddedDataUrl(rep, "rev") : null);

  els.detailObvBtn.onclick = () => {
    if (els.detailObvImg.src) openImage(`${s.name} • ${yearText} • Obverse`, els.detailObvImg.src);
  };
  els.detailRevBtn.onclick = () => {
    if (els.detailRevImg.src) openImage(`${s.name} • ${yearText} • Reverse`, els.detailRevImg.src);
  };

  // Duplicates list (when multiple coins share the same name+year+mint).
  const items = Array.isArray(g.items) ? g.items : [];
  if (els.detailDupes && els.detailDupesList && els.detailDupesTitle) {
    if (items.length <= 1) {
      els.detailDupes.hidden = true;
      els.detailDupesList.innerHTML = "";
    } else {
      els.detailDupes.hidden = false;
      els.detailDupesTitle.textContent = `Duplicates (x${items.length})`;
      els.detailDupesList.innerHTML = "";

      const sorted = [...items].sort((a, b) => safeText(a.id).localeCompare(safeText(b.id)));
      sorted.forEach((c, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dupeRow";
        if (safeText(c.id) === safeText(layerState.coinId)) btn.classList.add("is-active");

        const thumb = document.createElement("div");
        thumb.className = "dupeThumb";
        const img = document.createElement("img");
        img.alt = "Obverse";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        const cand = imageUrlCandidates(c, "obv");
        const emb = embeddedDataUrl(c, "obv");
        img.src = cand[0] || emb || "";
        img.onerror = () => {
          const next = cand.find((u) => u && img.src.indexOf(u) === -1);
          if (next) img.src = next;
          else if (emb && img.src !== emb) img.src = emb;
        };
        if (img.src) thumb.appendChild(img);
        btn.appendChild(thumb);

        const meta = document.createElement("div");
        meta.className = "dupeMeta";

        const top = document.createElement("div");
        top.className = "dupeMeta__top";
        const iEl = document.createElement("div");
        iEl.className = "dupeMeta__idx";
        iEl.textContent = `#${idx + 1}`;
        const idEl = document.createElement("div");
        idEl.className = "dupeMeta__id";
        idEl.textContent = safeText(c.id);
        top.appendChild(iEl);
        top.appendChild(idEl);

        const notes = document.createElement("div");
        notes.className = "dupeMeta__notes";
        notes.textContent = safeText(c.notes).trim() || "(no notes)";

        meta.appendChild(top);
        meta.appendChild(notes);
        btn.appendChild(meta);

        btn.addEventListener("click", () => {
          layerState.coinId = safeText(c.id) || null;
          renderLayerDetail(s, g);
        });

        els.detailDupesList.appendChild(btn);
      });
    }
  }
}

function renderTypeGrid(arr) {
  if (!els.typeGrid) return;
  els.typeGrid.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const sec of arr) {
    const card = document.createElement("section");
    card.className = "typeCard";
    card.addEventListener("click", () => setRouteToType(sec.title));

    const head = document.createElement("div");
    head.className = "typeCard__head";

    const title = document.createElement("h2");
    title.className = "typeCard__title";
    title.textContent = sec.title || "Other";

    const icon = document.createElement("div");
    icon.className = "typeCard__icon";

    const buIcon = makeBuSpriteIcon(sec.title);
    if (buIcon) {
      icon.appendChild(buIcon);
    } else {
      const rep = sec.repCoin;
      const coverCandidates = coverCandidatesForSectionTitle(sec.title);
      const photoCandidates = rep ? imageUrlCandidates(rep, "obv") : [];
      const embedded = rep ? embeddedDataUrl(rep, "obv") : null;

      const candidates = [...coverCandidates, ...photoCandidates].filter(Boolean);
      const first = candidates[0] || embedded;

      if (!first) {
        icon.classList.add("is-missing");
      } else {
        const img = document.createElement("img");
        img.alt = `${sec.title} cover`;
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = first;

        img.addEventListener("error", () => {
          const next = candidates.find((u) => u && img.src.indexOf(u) === -1);
          if (next) {
            img.src = next;
            return;
          }
          if (embedded && img.src !== embedded) {
            img.src = embedded;
            return;
          }
          img.removeAttribute("src");
          img.style.display = "none";
          icon.classList.add("is-missing");
        });

        icon.appendChild(img);
      }
    }

    head.appendChild(title);
    head.appendChild(icon);
    card.appendChild(head);

    const rule = document.createElement("div");
    rule.className = "typeCard__rule";
    card.appendChild(rule);

    const list = document.createElement("ul");
    list.className = "typeCard__list";

    for (const s of sec.series) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "typeItem";
      btn.addEventListener("click", (ev) => {
        // Don't also trigger the section navigation.
        ev.stopPropagation();
      });

      const range = rangeText(s.minYear, s.maxYear);
      btn.innerHTML = `${escapeHtml(s.name)} <span class="typeItem__range">${escapeHtml(range)}</span> <span class="typeItem__qty">x${Number(
        s.qty || 0
      )}</span>`;

      btn.addEventListener("click", () => openLayerForSeries(s));
      li.appendChild(btn);
      list.appendChild(li);
    }

    card.appendChild(list);
    frag.appendChild(card);
  }

  els.typeGrid.appendChild(frag);
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
  } catch (e) {
    // ignore
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw);
    return parseCoins(json);
  } catch (e) {
    return null;
  }
}

async function fetchCoinsJSON(onProgress) {
  const url = new URL(`coins.json${coinsCacheBust}`, BASE);
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Could not fetch coins.json (${resp.status}).`);

  const lenHeader = resp.headers.get("content-length");
  const total = lenHeader ? Number.parseInt(lenHeader, 10) : 0;

  if (!resp.body || !Number.isFinite(total) || total <= 0) {
    // Indeterminate load (no length). Keep the animated bar.
    const json = await resp.json();
    if (typeof onProgress === "function") onProgress(1);
    return parseCoins(json);
  }

  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (typeof onProgress === "function") onProgress(received / total);
  }

  const all = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(all);
  const json = JSON.parse(text);
  if (typeof onProgress === "function") onProgress(1);
  return parseCoins(json);
}

async function load() {
  setLoading(true, "Fetching coins.json");
  if (els.loadingBarFill) {
    els.loadingBarFill.classList.add("is-indeterminate");
    els.loadingBarFill.style.width = "";
  }
  if (els.loadingPct) els.loadingPct.textContent = "0%";
  els.subtitle.textContent = "Loading…";
  els.meta.textContent = "—";

  // Prefer server coins.json.
  let loaded = null;
  try {
    setLoading(true, "Fetching coins.json from GitHub Pages");
    loaded = await fetchCoinsJSON((p) => setLoadingProgress(p, "Loading coins.json…"));
  } catch (e) {
    setLoading(true, "Using saved data (offline)");
    loaded = loadFromStorage();
  }

  coins = loaded || [];
  groups = buildGroups(coins);
  sections = buildSections(groups);
  applyFilters();
  setLoadingProgress(1, "Done");
  // Let the bar reach 100% before fading out.
  setTimeout(() => {
    setLoading(false);
    setTimeout(() => {
      if (els.loadingOverlay) els.loadingOverlay.remove();
    }, 240);
  }, 260);
}

// Events
if (els.reloadBtn) {
  els.reloadBtn.addEventListener("click", async () => {
    // Cache-bust only the JSON fetch, not every image.
    coinsCacheBust = `?v=${Date.now()}`;
    try {
      await load();
    } finally {
      coinsCacheBust = "";
    }
  });
}

if (els.fileInput) {
  els.fileInput.addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      coins = parseCoins(JSON.parse(text));
      saveToStorage();
      groups = buildGroups(coins);
      sections = buildSections(groups);
      applyFilters();
    } catch (e) {
      alert(`Import failed: ${e.message || e}`);
    } finally {
      els.fileInput.value = "";
    }
  });
}

if (els.exportBtn) {
  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(coins, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "coins-export.json";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  });
}

if (els.clearBtn) {
  els.clearBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    coins = [];
    groups = [];
    sections = [];
    applyFilters();
  });
}

if (els.searchInput) {
  els.searchInput.addEventListener("input", () => {
    // Small debounce for typing.
    clearTimeout(window.__qTimer);
    window.__qTimer = setTimeout(applyFilters, 90);
  });
}

els.closeImageBtn.addEventListener("click", () => {
  els.imgFull.src = "";
  els.imageDialog.close();
});

els.typeBackBtn.addEventListener("click", () => {
  setRouteToHome();
  applyFilters();
});

els.layerBackBtn.addEventListener("click", () => {
  // If we're on the detail screen, go back to the list. Otherwise close.
  if (layerState.mode === "detail") {
    layerState = { mode: "list", series: layerState.series, group: null };
    renderLayer();
  } else {
    els.layerDialog.close();
  }
});

els.layerCloseBtn.addEventListener("click", () => {
  els.layerDialog.close();
});

window.addEventListener("hashchange", () => {
  applyFilters();
});

// Kick off
load();
