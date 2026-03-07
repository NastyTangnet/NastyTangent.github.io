/* global localStorage */

const STORAGE_KEY = "coin_collection_export_v1";
const SPOT_KEY = "coin_collection_silver_spot_usd_per_oz_v1";

/** @type {Array<any>} */
let coins = [];
let silverSpotUSDPerOzt = 25.0;

const el = {
  subtitle: document.getElementById("subtitle"),
  fileInput: document.getElementById("fileInput"),
  clearBtn: document.getElementById("clearBtn"),
  exportBtn: document.getElementById("exportBtn"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  typeChips: document.getElementById("typeChips"),
  sortSelect: document.getElementById("sortSelect"),
  stats: document.getElementById("stats"),
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),

  dialog: document.getElementById("detailDialog"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  obvImg: document.getElementById("obvImg"),
  revImg: document.getElementById("revImg"),
  kvYear: document.getElementById("kvYear"),
  kvType: document.getElementById("kvType"),
  kvMint: document.getElementById("kvMint"),
  kvNotes: document.getElementById("kvNotes"),
  kvMelt: document.getElementById("kvMelt"),
  spotInput: document.getElementById("spotInput"),
};

const imgCache = new Map(); // key: `${id}|obv` / `${id}|rev` => dataURL

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function normalizeMint(m) {
  const t = safeText(m).trim();
  if (!t) return "P";
  const up = t.toUpperCase();
  if (up === "(P)" || up === "PHILADELPHIA" || up === "NO MINT MARK" || up === "(NO MINT MARK)") return "P";
  return up;
}

function year4(coinYear) {
  const digits = safeText(coinYear).replace(/\D/g, "");
  return digits.slice(0, 4);
}

function dupeKey(c) {
  return `${safeText(c.name).toLowerCase().trim()}|${year4(c.year)}|${normalizeMint(c.mint).toLowerCase()}`;
}

function parseCoins(json) {
  if (!Array.isArray(json)) throw new Error("Export file must be a JSON array.");
  // Minimal structural check; keep it permissive.
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

function getImageDataUrl(coin, side) {
  const key = `${coin.id}|${side}`;
  if (imgCache.has(key)) return imgCache.get(key);

  const raw = side === "obv" ? coin.obverseImageData : coin.reverseImageData;
  if (!raw || typeof raw !== "string") return null;

  // iOS JSON encodes Data as base64. In the app we store JPEGs.
  const url = `data:image/jpeg;base64,${raw}`;
  imgCache.set(key, url);
  return url;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const json = JSON.parse(raw);
    coins = parseCoins(json);
  } catch (e) {
    // ignore
  }

  try {
    const raw = localStorage.getItem(SPOT_KEY);
    if (!raw) return;
    const v = Number.parseFloat(String(raw));
    if (Number.isFinite(v) && v > 0) silverSpotUSDPerOzt = v;
  } catch (e) {
    // ignore
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
  } catch (e) {
    // ignore (storage might be full for huge image exports)
  }

  try {
    localStorage.setItem(SPOT_KEY, String(silverSpotUSDPerOzt));
  } catch (e) {
    // ignore
  }
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function uniqueTypes() {
  const set = new Set();
  for (const g of groupCoins()) {
    const t = safeText(g.type).trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function updateTypeFilterOptions() {
  const current = el.typeFilter.value;
  const types = uniqueTypes();
  el.typeFilter.innerHTML = `<option value="">All Types</option>` + types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  // restore if still valid
  if (types.includes(current)) el.typeFilter.value = current;

  renderTypeChips(types);
}

function renderTypeChips(types) {
  if (!el.typeChips) return;
  const current = el.typeFilter.value || "";
  el.typeChips.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = `chip ${current === "" ? "chip--active" : ""}`.trim();
  allBtn.type = "button";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    el.typeFilter.value = "";
    rerender();
  });
  el.typeChips.appendChild(allBtn);

  for (const t of types) {
    const b = document.createElement("button");
    b.className = `chip ${current === t ? "chip--active" : ""}`.trim();
    b.type = "button";
    b.textContent = t;
    b.title = `Filter: ${t}`;
    b.addEventListener("click", () => {
      el.typeFilter.value = t;
      rerender();
    });
    el.typeChips.appendChild(b);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sortCoins(list, mode) {
  const copy = [...list];
  const cmp = {
    yearAsc: (a, b) => year4(a.year).localeCompare(year4(b.year)) || a.name.localeCompare(b.name),
    yearDesc: (a, b) => year4(b.year).localeCompare(year4(a.year)) || a.name.localeCompare(b.name),
    nameAsc: (a, b) => a.name.localeCompare(b.name) || year4(a.year).localeCompare(year4(b.year)),
    nameDesc: (a, b) => b.name.localeCompare(a.name) || year4(a.year).localeCompare(year4(b.year)),
    typeAsc: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    mintAsc: (a, b) => normalizeMint(a.mint).localeCompare(normalizeMint(b.mint)) || year4(a.year).localeCompare(year4(b.year)),
  }[mode] || ((a, b) => a.name.localeCompare(b.name));
  copy.sort(cmp);
  return copy;
}

function filterCoins() {
  const q = el.searchInput.value.trim().toLowerCase();
  const type = el.typeFilter.value;

  return groupCoins().filter((g) => {
    if (type && g.type !== type) return false;
    if (!q) return true;
    // Search across the whole group.
    for (const c of g.coins) {
      const hay = `${c.name} ${c.year} ${c.type} ${c.mint} ${c.notes}`.toLowerCase();
      if (hay.includes(q)) return true;
    }
    return false;
  });
}

function computeStats(groupsVisible) {
  const groupsAll = groupCoins();

  const uniqueKeys = new Set(groupsAll.map((g) => g.key));
  const years = coins
    .map((c) => year4(c.year))
    .filter((y) => y.length === 4)
    .map((y) => parseInt(y, 10))
    .filter((n) => Number.isFinite(n));
  const oldest = years.length ? Math.min(...years) : null;
  const newest = years.length ? Math.max(...years) : null;

  const withImages = coins.filter((c) => (c.obverseImageData || c.reverseImageData)).length;
  const totalMelt = groupsAll.reduce((sum, g) => sum + meltValueForGroupUSD(g, silverSpotUSDPerOzt), 0);

  return {
    total: coins.length,
    totalVisible: groupsVisible.length,
    unique: uniqueKeys.size,
    dupes: groupsAll.filter((g) => g.count > 1).length,
    withImages,
    oldest,
    newest,
    totalMelt,
  };
}

function renderStats(groupsVisible) {
  const s = computeStats(groupsVisible);
  el.subtitle.textContent = coins.length ? `${s.total} coins • ${s.unique} unique` : "No data loaded";

  const pills = [
    `Loaded: ${s.total}`,
    `Showing: ${s.totalVisible}`,
    `Unique: ${s.unique}`,
    `Dupe groups: ${s.dupes}`,
    `With photos: ${s.withImages}`,
    `Total melt: ${formatUSD(s.totalMelt)}`,
  ];
  if (s.oldest !== null && s.newest !== null) pills.push(`Years: ${s.oldest}–${s.newest}`);

  el.stats.innerHTML = pills.map((p) => `<div class="pill">${escapeHtml(p)}</div>`).join("");
}

function renderGrid(groups) {
  el.grid.innerHTML = "";
  el.empty.hidden = coins.length !== 0;

  const frag = document.createDocumentFragment();
  for (const g of groups) {
    const c = g.rep;
    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${c.name} ${year4(c.year) || c.year}`);

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    if (g.count > 1) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = String(g.count);
      thumb.appendChild(badge);
    }

    const url = getImageDataUrl(c, "obv") || getImageDataUrl(c, "rev");
    if (url) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = url;
      img.alt = `${c.name} thumbnail`;
      thumb.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "thumb__placeholder";
      ph.textContent = "COIN";
      thumb.appendChild(ph);
    }

    const body = document.createElement("div");
    body.className = "card__body";

    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = c.name || "Coin";

    const meta = document.createElement("div");
    meta.className = "card__meta";
    const y = year4(c.year) || c.year || "—";
    const mint = normalizeMint(c.mint);
    meta.textContent = `${y}${mint === "P" ? "" : "-" + mint} • ${c.type || "—"}`;

    const priceRow = document.createElement("div");
    priceRow.className = "card__price";
    const melt = meltValueForGroupUSD(g, silverSpotUSDPerOzt);
    const isSilver = groupSilverOzt(g) > 0;
    priceRow.innerHTML = `${escapeHtml(formatUSD(melt))} <small>${isSilver ? "melt" : "no silver"}</small>`;

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(priceRow);

    card.appendChild(thumb);
    card.appendChild(body);

    card.addEventListener("click", () => openDetail(g));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(g);
      }
    });

    frag.appendChild(card);
  }
  el.grid.appendChild(frag);
}

function openDetail(group) {
  const c = group.rep;

  el.detailTitle.textContent = c.name || "Coin";
  const y = year4(c.year) || c.year || "—";
  const mint = normalizeMint(c.mint);
  el.detailSubtitle.textContent = `${y}${mint === "P" ? "" : "-" + mint} • ${c.type || "—"} • ${group.count} in group`;

  el.kvYear.textContent = y;
  el.kvType.textContent = c.type || "—";
  el.kvMint.textContent = mint;
  el.kvNotes.textContent = groupNotes(group);

  const obv = getImageDataUrl(c, "obv");
  const rev = getImageDataUrl(c, "rev");
  el.obvImg.src = obv || "";
  el.revImg.src = rev || "";
  el.obvImg.style.visibility = obv ? "visible" : "hidden";
  el.revImg.style.visibility = rev ? "visible" : "hidden";

  if (el.kvMelt) {
    const melt = meltValueForGroupUSD(group, silverSpotUSDPerOzt);
    const oz = groupSilverOzt(group);
    el.kvMelt.textContent = oz > 0 ? `${formatUSD(melt)}  (${oz.toFixed(4)} ozt Ag)` : "$0.00  (clad / no silver)";
  }

  el.dialog.showModal();
}

function closeDetail() {
  if (el.dialog.open) el.dialog.close();
}

function rerender() {
  updateTypeFilterOptions();
  const filteredGroups = filterCoins();
  const sortedGroups = sortGroups(filteredGroups, el.sortSelect.value);
  renderStats(sortedGroups);
  renderGrid(sortedGroups);
  el.exportBtn.disabled = coins.length === 0;
  el.clearBtn.disabled = coins.length === 0;
}

async function handleImport(file) {
  const text = await file.text();
  const json = JSON.parse(text);
  coins = parseCoins(json);
  imgCache.clear();
  saveToStorage();
  rerender();
}

function groupCoins() {
  /** @type {Record<string, any[]>} */
  const map = Object.create(null);
  for (const c of coins) {
    const k = dupeKey(c);
    if (!map[k]) map[k] = [];
    map[k].push(c);
  }

  const groups = [];
  for (const [key, list] of Object.entries(map)) {
    const rep = list.find((x) => x.obverseImageData || x.reverseImageData) || list[0];
    groups.push({
      key,
      coins: list,
      rep,
      name: safeText(rep?.name),
      year: safeText(rep?.year),
      type: safeText(rep?.type),
      mint: safeText(rep?.mint),
      count: list.length,
    });
  }
  return groups;
}

function groupNotes(group) {
  // If duplicates, show compact notes summary.
  const notes = group.coins.map((c) => safeText(c.notes).trim()).filter((n) => n);
  if (!notes.length) return "—";
  if (group.count === 1) return notes[0];
  const unique = Array.from(new Set(notes));
  if (unique.length === 1) return unique[0];
  return unique.slice(0, 6).map((n, i) => `#${i + 1}: ${n}`).join("\n");
}

function sortGroups(groups, mode) {
  const copy = [...groups];
  const cmp = {
    yearAsc: (a, b) => year4(a.year).localeCompare(year4(b.year)) || a.name.localeCompare(b.name),
    yearDesc: (a, b) => year4(b.year).localeCompare(year4(a.year)) || a.name.localeCompare(b.name),
    nameAsc: (a, b) => a.name.localeCompare(b.name) || year4(a.year).localeCompare(year4(b.year)),
    nameDesc: (a, b) => b.name.localeCompare(a.name) || year4(a.year).localeCompare(year4(b.year)),
    typeAsc: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    mintAsc: (a, b) => normalizeMint(a.mint).localeCompare(normalizeMint(b.mint)) || year4(a.year).localeCompare(year4(b.year)),
  }[mode] || ((a, b) => a.name.localeCompare(b.name));
  copy.sort(cmp);
  return copy;
}

function formatUSD(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function init() {
  loadFromStorage();
  updateTypeFilterOptions();
  if (el.spotInput) {
    el.spotInput.value = String(Number(silverSpotUSDPerOzt).toFixed(2));
  }

  el.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await handleImport(file);
      el.fileInput.value = "";
    } catch (err) {
      alert(`Could not import JSON: ${err?.message || err}`);
    }
  });

  el.clearBtn.addEventListener("click", () => {
    if (!confirm("Clear imported coin data from this browser?")) return;
    coins = [];
    imgCache.clear();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SPOT_KEY);
    rerender();
  });

  el.exportBtn.addEventListener("click", () => {
    if (!coins.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`CoinWebExport-${stamp}.json`, coins);
  });

  el.searchInput.addEventListener("input", () => rerender());
  el.typeFilter.addEventListener("change", () => rerender());
  el.sortSelect.addEventListener("change", () => rerender());
  if (el.spotInput) {
    el.spotInput.addEventListener("input", () => {
      const raw = safeText(el.spotInput.value).trim().replace(/[^0-9.]/g, "");
      const v = Number.parseFloat(raw);
      if (Number.isFinite(v) && v > 0) {
        silverSpotUSDPerOzt = v;
        saveToStorage();
        rerender();
      }
    });
  }

  el.closeDialogBtn.addEventListener("click", () => closeDetail());
  el.dialog.addEventListener("click", (e) => {
    // close if clicking the backdrop area
    const rect = el.dialog.getBoundingClientRect();
    const inDialog =
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
    if (!inDialog) closeDetail();
  });

  rerender();
}

init();

// --- Melt value helpers (silver only; gold excluded on purpose) ---

function silverOztForCoin(coin) {
  const name = safeText(coin.name).toLowerCase();
  const type = safeText(coin.type).toLowerCase();
  const y = parseInt(year4(coin.year) || "0", 10);

  // Dollars (silver)
  if (name.includes("morgan dollar") || name.includes("peace dollar")) return 0.77344; // 90% silver dollar

  // Half dollars
  if (name.includes("kennedy half dollar")) {
    if (y === 1964) return 0.36169; // 90%
    if (y >= 1965 && y <= 1970) return 0.14790; // 40%
    return 0;
  }
  if (name.includes("franklin half dollar") || name.includes("walking liberty half dollar") || name.includes("barber half dollar") || name.includes("liberty seated half dollar") || name.includes("capped bust half dollar") || name.includes("draped bust half dollar") || name.includes("flowing hair half dollar")) {
    return 0.36169; // 90% half
  }

  // Quarters
  if (name.includes("washington quarter") || name.includes("standing liberty quarter") || name.includes("barber quarter") || name.includes("liberty seated quarter") || name.includes("capped bust quarter") || name.includes("draped bust quarter")) {
    // Conservative: only silver through 1964 for Washington; earlier designs are silver by definition.
    if (name.includes("washington quarter")) return (y && y >= 1965) ? 0 : 0.18084;
    return 0.18084;
  }

  // Dimes
  if (name.includes("roosevelt dime")) return (y && y >= 1965) ? 0 : 0.07234;
  if (name.includes("mercury dime") || name.includes("barber dime") || name.includes("liberty seated dime") || name.includes("capped bust dime") || name.includes("draped bust dime")) return 0.07234;

  // War nickel
  if (name.includes("war nickel")) return 0.05626; // 35% silver (approx ASW)

  // If the type string explicitly says "silver", treat as unknown (no guess).
  if (type.includes("silver")) return 0;

  return 0;
}

function groupSilverOzt(group) {
  return group.coins.reduce((sum, c) => sum + silverOztForCoin(c), 0);
}

function meltValueForGroupUSD(group, spotUSDPerOzt) {
  const oz = groupSilverOzt(group);
  if (!Number.isFinite(oz) || oz <= 0) return 0;
  const spot = Number(spotUSDPerOzt);
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  return oz * spot;
}
