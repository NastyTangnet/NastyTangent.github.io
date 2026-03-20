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
  loadingPct: document.getElementById("loadingPct"),
  loadingBarFill: document.getElementById("loadingBarFill"),

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
};

let layerState = {
  mode: "list", // "list" | "detail"
  series: null,
  group: null,
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

function imageUrlCandidates(coin, side) {
  // We try multiple patterns because your repo may contain either:
  // - `NastyTangent.github/coin-images/<uuid-lower>/obv.jpg` (current app uploader)
  // - `NastyTangent.github/coin-images/<uuid-upper>/obv.jpg`
  // - `NastyTangent.github/coin-images/<UUID>-obv.jpg` (older zip exports)
  // - `NastyTangent.github/coin-images/images/<UUID>-obv.jpg` (if you kept the "images/" folder)
  //
  // Older layouts may also have `coin-images/...` at repo root, so we try both.
  const rawID = safeText(coin.id);
  const lower = rawID.toLowerCase();
  const upper = rawID.toUpperCase();
  const sideFile = side === "rev" ? "rev.jpg" : "obv.jpg";
  const sideTag = side === "rev" ? "rev" : "obv";

  const out = [];

  // Folder-based (preferred)
  if (lower) out.push(new URL(`NastyTangent.github/coin-images/${lower}/${sideFile}`, BASE).toString());
  if (upper && upper !== lower) out.push(new URL(`NastyTangent.github/coin-images/${upper}/${sideFile}`, BASE).toString());
  if (lower) out.push(new URL(`coin-images/${lower}/${sideFile}`, BASE).toString());
  if (upper && upper !== lower) out.push(new URL(`coin-images/${upper}/${sideFile}`, BASE).toString());

  // Flat files (zip-style)
  if (upper) out.push(new URL(`NastyTangent.github/coin-images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (lower && lower !== upper) out.push(new URL(`NastyTangent.github/coin-images/${lower}-${sideTag}.jpg`, BASE).toString());
  if (upper) out.push(new URL(`coin-images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (lower && lower !== upper) out.push(new URL(`coin-images/${lower}-${sideTag}.jpg`, BASE).toString());

  // If you kept an `images/` folder inside coin-images or at site root
  if (upper) out.push(new URL(`NastyTangent.github/coin-images/images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (upper) out.push(new URL(`coin-images/images/${upper}-${sideTag}.jpg`, BASE).toString());
  if (upper) out.push(new URL(`images/${upper}-${sideTag}.jpg`, BASE).toString());

  // Repo-root fallback (if you moved coin-images outside the site folder)
  if (lower) out.push(new URL(`../coin-images/${lower}/${sideFile}`, BASE).toString());
  if (upper) out.push(new URL(`../coin-images/${upper}/${sideFile}`, BASE).toString());

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
  const candidates = imageUrlCandidates(coin, "obv");
  const embedded = embeddedDataUrl(coin, "obv");

  if (candidates.length || embedded) {
    img.dataset.src = candidates[0] || embedded;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      // Try next candidate(s), then embedded.
      const next = candidates.find((u) => u && img.src.indexOf(u) === -1);
      if (next) {
        img.src = `${next}?v=${Date.now()}`;
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

function openLayerForSeries(s) {
  if (!els.layerDialog) return;
  layerState = { mode: "list", series: s, group: null };
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
    (a, b) => safeText(b.year).localeCompare(safeText(a.year)) || safeText(a.mint).localeCompare(safeText(b.mint))
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
      layerState = { mode: "detail", series: s, group: g };
      renderLayer();
    });

    frag.appendChild(card);
  }

  els.layerList.appendChild(frag);
}

function renderLayerDetail(s, g) {
  const rep = g.items[0];
  const yearText = safeText(g.year) ? `${safeText(g.year)}${mintSuffix(g.mint)}` : "—";

  els.detailYear.textContent = yearText;
  els.detailType.textContent = safeText(g.type) || "—";
  els.detailMint.textContent = safeText(g.mint) || "—";
  els.detailNotes.textContent = safeText(rep.notes).trim() || "—";

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
    if (first) imgEl.src = `${first}?v=${Date.now()}`;

    imgEl.onerror = () => {
      const srcNow = imgEl.src || "";
      const next = candidates ? candidates.find((u) => u && srcNow.indexOf(u) === -1) : null;
      if (next) {
        imgEl.src = `${next}?v=${Date.now()}`;
        return;
      }
      if (embedded && srcNow !== embedded) {
        imgEl.src = embedded;
        return;
      }
      markMissing();
    };
  };

  setImg(els.detailObvImg, imageUrlCandidates(rep, "obv"), embeddedDataUrl(rep, "obv"));
  setImg(els.detailRevImg, imageUrlCandidates(rep, "rev"), embeddedDataUrl(rep, "rev"));

  els.detailObvBtn.onclick = () => {
    if (els.detailObvImg.src) openImage(`${s.name} • ${yearText} • Obverse`, els.detailObvImg.src);
  };
  els.detailRevBtn.onclick = () => {
    if (els.detailRevImg.src) openImage(`${s.name} • ${yearText} • Reverse`, els.detailRevImg.src);
  };
}

function renderSeries(arr) {
  els.seriesGrid.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const s of arr) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seriesCard";

    // Use the first group’s first coin as a "cover".
    const repCoin = s.groups[0] && s.groups[0].items[0] ? s.groups[0].items[0] : null;
    if (repCoin) btn.appendChild(makeThumb(repCoin));

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
    btn.appendChild(main);

    btn.addEventListener("click", () => {
      openLayerForSeries(s);
    });

    frag.appendChild(btn);
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

async function fetchCoinsJSON(onProgress) {
  const url = new URL(`coins.json?v=${Date.now()}`, BASE);
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
  series = buildSeries(groups);
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
    series = buildSeries(groups);
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

// Kick off
load();
