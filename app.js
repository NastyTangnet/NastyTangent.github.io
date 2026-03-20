/* Simple dropdown-based coin browser.
 *
 * Data source priority:
 * 1) `coins.json` served from this folder (GitHub Pages)
 * 2) LocalStorage (if you imported a file previously)
 */

const BASE = new URL("./", window.location.href);

const STORAGE_KEY = "jpcc_coins_v2";

let coins = [];
let groups = []; // grouped by name+year+mint
let series = []; // grouped by coin.name

const els = {
  subtitle: document.getElementById("subtitle"),
  meta: document.getElementById("meta"),
  seriesGrid: document.getElementById("seriesGrid"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),

  reloadBtn: document.getElementById("reloadBtn"),
  fileInput: document.getElementById("fileInput"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),

  sortSelect: document.getElementById("sortSelect"),
  searchInput: document.getElementById("searchInput"),

  imageDialog: document.getElementById("imageDialog"),
  imgFull: document.getElementById("imgFull"),
  imgTitle: document.getElementById("imgTitle"),
  closeImageBtn: document.getElementById("closeImageBtn"),
};

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function year4(coinYear) {
  const digits = safeText(coinYear).replace(/\D/g, "");
  return digits.slice(0, 4);
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

function fileImageUrl(coin, side) {
  // App uploads:
  // `coin-images/<coinId>/obv.jpg` and `rev.jpg` (lowercased uuid folder)
  const id = safeText(coin.id).toLowerCase();
  if (!id) return null;
  const name = side === "rev" ? "rev.jpg" : "obv.jpg";
  return new URL(`coin-images/${id}/${name}`, BASE).toString();
}

function bestImageUrl(coin, side) {
  // Prefer real uploaded files, then embedded thumbs (if present), otherwise null.
  return fileImageUrl(coin, side) || embeddedDataUrl(coin, side) || null;
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

function buildSeries(groupsArr) {
  const map = new Map();
  for (const g of groupsArr) {
    const name = safeText(g.name).trim() || "(Untitled)";
    const existing = map.get(name);
    if (existing) existing.groups.push(g);
    else map.set(name, { name, groups: [g] });
  }

  const out = [];
  for (const s of map.values()) {
    const qty = s.groups.reduce((sum, g) => sum + g.qty, 0);
    const years = s.groups.map((g) => safeText(g.year)).filter(Boolean);
    const minYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) <= 0 ? a : b)) : "";
    const maxYear = years.length ? years.reduce((a, b) => (a.localeCompare(b) >= 0 ? a : b)) : "";
    out.push({
      name: s.name,
      qty,
      minYear,
      maxYear,
      groups: s.groups,
    });
  }
  return out;
}

function setLoading(visible, text) {
  if (!els.loadingOverlay) return;
  if (typeof text === "string" && els.loadingText) els.loadingText.textContent = text;
  if (visible) els.loadingOverlay.classList.remove("loading--hidden");
  else els.loadingOverlay.classList.add("loading--hidden");
}

function applyFilters() {
  const q = safeText(els.searchInput.value).trim().toLowerCase();

  let filtered = series;
  if (q) {
    filtered = filtered.filter((s) => {
      const hay = `${s.name} ${safeText(s.minYear)} ${safeText(s.maxYear)} ${s.groups
        .map((g) => `${g.year} ${g.mint} ${g.type} ${safeText(g.notes)}`)
        .join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  filtered = sortSeries(filtered);
  renderSeries(filtered);

  const totalCoins = coins.length;
  const shownCoins = filtered.reduce((sum, s) => sum + s.qty, 0);
  els.meta.textContent = `Showing ${filtered.length} type box(es), ${shownCoins} coin(s)`;
  els.subtitle.textContent = `${totalCoins} coins • ${series.length} types`;
}

function sortSeries(arr) {
  const mode = els.sortSelect.value;
  const out = [...arr];
  out.sort((a, b) => {
    switch (mode) {
      case "nameDesc":
        return b.name.localeCompare(a.name);
      case "qtyAsc":
        return a.qty - b.qty || a.name.localeCompare(b.name);
      case "qtyDesc":
        return b.qty - a.qty || a.name.localeCompare(b.name);
      case "yearOldest":
        return safeText(a.minYear).localeCompare(safeText(b.minYear)) || b.qty - a.qty || a.name.localeCompare(b.name);
      case "yearNewest":
        return safeText(b.maxYear).localeCompare(safeText(a.maxYear)) || b.qty - a.qty || a.name.localeCompare(b.name);
      case "nameAsc":
      default:
        return a.name.localeCompare(b.name);
    }
  });
  return out;
}

function makeThumb(coin) {
  const wrap = document.createElement("div");
  wrap.className = "thumb";

  const img = document.createElement("img");
  img.alt = "Obverse";
  img.loading = "lazy";
  img.decoding = "async";

  // Lazy load only when visible.
  const url = bestImageUrl(coin, "obv");
  if (url) {
    img.dataset.src = url;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      // Fallback to embedded if file 404s (or vice versa).
      const fallback = embeddedDataUrl(coin, "obv");
      if (fallback && img.src !== fallback) img.src = fallback;
    });
    observeLazyImage(img);
  } else {
    img.style.display = "none";
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
          if (src && !el.src) el.src = `${src}?v=${Date.now()}`;
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

function renderSeries(arr) {
  els.seriesGrid.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const s of arr) {
    const details = document.createElement("details");
    details.className = "series";

    const summary = document.createElement("summary");
    summary.className = "series__summary";

    // Use the first group’s first coin as a "cover".
    const repCoin = s.groups[0] && s.groups[0].items[0] ? s.groups[0].items[0] : null;
    if (repCoin) summary.appendChild(makeThumb(repCoin));

    const main = document.createElement("div");
    main.className = "series__main";

    const title = document.createElement("div");
    title.className = "series__title";
    title.textContent = s.name || "(Untitled)";

    const sub = document.createElement("div");
    sub.className = "series__sub";

    const years = document.createElement("span");
    years.className = "pill";
    years.textContent = s.minYear && s.maxYear ? `${s.minYear}–${s.maxYear}` : "—";

    const q = document.createElement("span");
    q.className = "pill qty";
    q.textContent = `x${s.qty}`;

    sub.appendChild(years);
    sub.appendChild(q);

    main.appendChild(title);
    main.appendChild(sub);
    summary.appendChild(main);

    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "series__body";

    const coinGrid = document.createElement("div");
    coinGrid.className = "coinGrid";

    // Sort groups inside a series by year desc, then mint.
    const groupsSorted = [...s.groups].sort((a, b) => safeText(b.year).localeCompare(safeText(a.year)) || safeText(a.mint).localeCompare(safeText(b.mint)));

    for (const g of groupsSorted) {
      const rep = g.items[0];

      const coinDetails = document.createElement("details");
      coinDetails.className = "coin";

      const coinSummary = document.createElement("summary");
      coinSummary.className = "coin__summary";

      coinSummary.appendChild(makeThumb(rep));

      const cm = document.createElement("div");
      cm.className = "coin__meta";

      const ct = document.createElement("div");
      ct.className = "coin__title";
      ct.textContent = `${safeText(g.year) || "—"}${mintSuffix(g.mint)}`;

      const cs = document.createElement("div");
      cs.className = "coin__sub";

      const p1 = document.createElement("span");
      p1.className = "pill";
      p1.textContent = safeText(g.type) || "—";

      const p2 = document.createElement("span");
      p2.className = "pill qty";
      p2.textContent = `x${g.qty}`;

      cs.appendChild(p1);
      cs.appendChild(p2);

      cm.appendChild(ct);
      cm.appendChild(cs);
      coinSummary.appendChild(cm);

      coinDetails.appendChild(coinSummary);

      const coinBody = document.createElement("div");
      coinBody.className = "coin__body";

      const photos = document.createElement("div");
      photos.className = "photos";

      for (const side of ["obv", "rev"]) {
        const wrap = document.createElement("div");
        wrap.className = "photo";
        const lbl = document.createElement("div");
        lbl.className = "photo__label";
        lbl.textContent = side === "rev" ? "Reverse" : "Obverse";
        wrap.appendChild(lbl);

        const img = document.createElement("img");
        img.alt = side === "rev" ? "Reverse" : "Obverse";
        img.loading = "lazy";
        img.decoding = "async";
        const url = bestImageUrl(rep, side);
        if (url) {
          img.dataset.src = url;
          observeLazyImage(img);
          img.addEventListener("click", () => {
            const real = img.src || `${url}?v=${Date.now()}`;
            openImage(`${s.name} • ${safeText(g.year)}${mintSuffix(g.mint)} • ${side === "rev" ? "Reverse" : "Obverse"}`, real);
          });
          img.addEventListener("error", () => {
            const fallback = embeddedDataUrl(rep, side);
            if (fallback && img.src !== fallback) img.src = fallback;
          });
        }
        wrap.appendChild(img);
        photos.appendChild(wrap);
      }

      coinBody.appendChild(photos);

      const notes = safeText(rep.notes).trim();
      if (notes) {
        const kv = document.createElement("div");
        kv.className = "kv";
        const kk = document.createElement("div");
        kk.className = "kv__k";
        kk.textContent = "Notes";
        const vv = document.createElement("div");
        vv.className = "kv__v notes";
        vv.textContent = notes;
        kv.appendChild(kk);
        kv.appendChild(vv);
        coinBody.appendChild(kv);
      }

      coinDetails.appendChild(coinBody);
      coinGrid.appendChild(coinDetails);
    }

    body.appendChild(coinGrid);
    details.appendChild(body);

    frag.appendChild(details);
  }

  els.seriesGrid.appendChild(frag);
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

async function fetchCoinsJSON() {
  const url = new URL(`coins.json?v=${Date.now()}`, BASE);
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Could not fetch coins.json (${resp.status}).`);
  const json = await resp.json();
  return parseCoins(json);
}

async function load() {
  setLoading(true, "Fetching coins.json");
  els.subtitle.textContent = "Loading…";
  els.meta.textContent = "—";

  // Prefer server coins.json.
  let loaded = null;
  try {
    setLoading(true, "Fetching coins.json from GitHub Pages");
    loaded = await fetchCoinsJSON();
  } catch (e) {
    setLoading(true, "Using saved data (offline)");
    loaded = loadFromStorage();
  }

  coins = loaded || [];
  groups = buildGroups(coins);
  series = buildSeries(groups);
  applyFilters();
  setLoading(false);
}

// Events
els.reloadBtn.addEventListener("click", async () => {
  await load();
});

els.fileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    coins = parseCoins(JSON.parse(text));
    saveToStorage();
    groups = buildGroups(coins);
    refreshSelects();
    applyFilters();
  } catch (e) {
    alert(`Import failed: ${e.message || e}`);
  } finally {
    els.fileInput.value = "";
  }
});

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

els.clearBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  coins = [];
  groups = [];
  series = [];
  applyFilters();
});

els.sortSelect.addEventListener("change", applyFilters);
els.searchInput.addEventListener("input", () => {
  // Small debounce for typing.
  clearTimeout(window.__qTimer);
  window.__qTimer = setTimeout(applyFilters, 90);
});

els.closeImageBtn.addEventListener("click", () => {
  els.imgFull.src = "";
  els.imageDialog.close();
});

// Kick off
load();
