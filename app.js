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

const els = {
  subtitle: document.getElementById("subtitle"),
  meta: document.getElementById("meta"),
  list: document.getElementById("list"),

  reloadBtn: document.getElementById("reloadBtn"),
  fileInput: document.getElementById("fileInput"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),

  typeSelect: document.getElementById("typeSelect"),
  nameSelect: document.getElementById("nameSelect"),
  yearSelect: document.getElementById("yearSelect"),
  mintSelect: document.getElementById("mintSelect"),
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

function setOptions(selectEl, values, placeholder) {
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }

  // Preserve selection if possible.
  if ([...selectEl.options].some((o) => o.value === prev)) {
    selectEl.value = prev;
  }
}

function refreshSelects() {
  const types = [...new Set(groups.map((g) => safeText(g.type).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const names = [...new Set(groups.map((g) => safeText(g.name).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(groups.map((g) => safeText(g.year).trim()).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const mints = [...new Set(groups.map((g) => safeText(g.mint).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  setOptions(els.typeSelect, types, "All");
  setOptions(els.nameSelect, names, "All");
  setOptions(els.yearSelect, years, "All");
  setOptions(els.mintSelect, mints, "All");
}

function applyFilters() {
  const type = els.typeSelect.value;
  const name = els.nameSelect.value;
  const year = els.yearSelect.value;
  const mint = els.mintSelect.value;
  const q = safeText(els.searchInput.value).trim().toLowerCase();

  let filtered = groups;
  if (type) filtered = filtered.filter((g) => g.type === type);
  if (name) filtered = filtered.filter((g) => g.name === name);
  if (year) filtered = filtered.filter((g) => safeText(g.year) === year);
  if (mint) filtered = filtered.filter((g) => safeText(g.mint) === mint);
  if (q) {
    filtered = filtered.filter((g) => {
      const hay = `${g.name} ${g.year} ${g.type} ${g.mint} ${safeText(g.notes)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  filtered = sortGroups(filtered);
  render(filtered);

  const totalCoins = coins.length;
  const shownCoins = filtered.reduce((sum, g) => sum + g.qty, 0);
  els.meta.textContent = `Showing ${filtered.length} group(s), ${shownCoins} coin(s)`;
  els.subtitle.textContent = `${totalCoins} coins • ${groups.length} unique groups`;
}

function sortGroups(arr) {
  const mode = els.sortSelect.value;
  const out = [...arr];
  out.sort((a, b) => {
    switch (mode) {
      case "yearAsc":
        return safeText(a.year).localeCompare(safeText(b.year)) || a.name.localeCompare(b.name);
      case "yearDesc":
        return safeText(b.year).localeCompare(safeText(a.year)) || a.name.localeCompare(b.name);
      case "nameDesc":
        return b.name.localeCompare(a.name) || safeText(b.year).localeCompare(safeText(a.year));
      case "qtyAsc":
        return a.qty - b.qty || a.name.localeCompare(b.name);
      case "qtyDesc":
        return b.qty - a.qty || a.name.localeCompare(b.name);
      case "nameAsc":
      default:
        return a.name.localeCompare(b.name) || safeText(b.year).localeCompare(safeText(a.year));
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

function render(arr) {
  els.list.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of arr) {
    const rep = g.items[0];

    const details = document.createElement("details");
    details.className = "group";

    const summary = document.createElement("summary");
    summary.className = "group__summary";

    summary.appendChild(makeThumb(rep));

    const main = document.createElement("div");
    main.className = "rowMain";

    const title = document.createElement("div");
    title.className = "rowTitle";
    title.textContent = g.name || "(Untitled)";

    const sub = document.createElement("div");
    sub.className = "rowSub";

    const y = document.createElement("span");
    y.className = "pill";
    y.textContent = `${g.year || "—"}${mintSuffix(g.mint)}`;

    const t = document.createElement("span");
    t.className = "pill";
    t.textContent = g.type || "—";

    const q = document.createElement("span");
    q.className = "pill qty";
    q.textContent = `x${g.qty}`;

    sub.appendChild(y);
    sub.appendChild(t);
    sub.appendChild(q);

    main.appendChild(title);
    main.appendChild(sub);
    summary.appendChild(main);

    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "group__body";

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
          openImage(`${g.name} • ${side === "rev" ? "Reverse" : "Obverse"}`, real);
        });
        img.addEventListener("error", () => {
          const fallback = embeddedDataUrl(rep, side);
          if (fallback && img.src !== fallback) img.src = fallback;
        });
      }
      wrap.appendChild(img);
      photos.appendChild(wrap);
    }

    body.appendChild(photos);

    const kv = document.createElement("div");
    kv.className = "kv";

    const rows = [
      ["Year", safeText(g.year) ? `${safeText(g.year)}${mintSuffix(g.mint)}` : "—"],
      ["Type", safeText(g.type) || "—"],
      ["Mint", safeText(g.mint) || "—"],
      ["Notes", safeText(rep.notes).trim() || "—"],
    ];

    for (const [k, v] of rows) {
      const kk = document.createElement("div");
      kk.className = "kv__k";
      kk.textContent = k;
      const vv = document.createElement("div");
      vv.className = "kv__v" + (k === "Notes" ? " notes" : "");
      vv.textContent = v;
      kv.appendChild(kk);
      kv.appendChild(vv);
    }

    body.appendChild(kv);
    details.appendChild(body);

    frag.appendChild(details);
  }

  els.list.appendChild(frag);
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
  els.subtitle.textContent = "Loading…";
  els.meta.textContent = "—";

  // Prefer server coins.json.
  let loaded = null;
  try {
    loaded = await fetchCoinsJSON();
  } catch (e) {
    loaded = loadFromStorage();
  }

  coins = loaded || [];
  groups = buildGroups(coins);
  refreshSelects();
  applyFilters();
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
  refreshSelects();
  applyFilters();
});

for (const el of [els.typeSelect, els.nameSelect, els.yearSelect, els.mintSelect, els.sortSelect]) {
  el.addEventListener("change", applyFilters);
}
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

