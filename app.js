/* global localStorage */

const STORAGE_KEY = "coin_collection_export_v1";
const SPOT_KEY = "coin_collection_silver_spot_usd_per_oz_v1";
const VIEW_KEY = "coin_web_active_view_v1";
const OVERRIDES_KEY = "coin_web_silver_overrides_v1";
const CHART_RANGE_KEY = "coin_web_chart_range_v1";

// Resolve asset paths relative to app.js (not the current page URL).
// This avoids path confusion on GitHub Pages (Project Pages often live under `/REPO_NAME/`).
const ASSET_BASE = (() => {
  try {
    if (document.currentScript && document.currentScript.src) {
      return new URL(".", document.currentScript.src);
    }
  } catch (e) {
    // ignore
  }
  return new URL(".", window.location.href);
})();

/** @type {Array<any>} */
let coins = [];
let silverSpotUSDPerOzt = 25.0;
let spotMeta = null; // { updatedAt, source }
let spotHistory = []; // [{ t: ISO string, usdPerOzt: number }]
let activeView = "vault"; // vault | num | table
let chartRange = "24h"; // 24h | 7d | 30d

/** @type {Record<string, {isSilver?: boolean, aswPerCoin?: number}>} */
let silverOverrides = Object.create(null);

let lastSpotFetchDebug = null; // { url, ok, status, error }
let lastHistoryFetchDebug = null; // { url, ok, status, error, points }

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
  tbody: document.getElementById("tbody"),
  empty: document.getElementById("empty"),

  dialog: document.getElementById("detailDialog"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  kvYear: document.getElementById("kvYear"),
  kvType: document.getElementById("kvType"),
  kvMint: document.getElementById("kvMint"),
  kvNotes: document.getElementById("kvNotes"),
  kvMelt: document.getElementById("kvMelt"),
  spotInput: document.getElementById("spotInput"),
  spotLiveBtn: document.getElementById("spotLiveBtn"),

  tabVault: document.getElementById("tabVault"),
  tabNum: document.getElementById("tabNum"),
  tabTable: document.getElementById("tabTable"),
  vaultView: document.getElementById("vaultView"),
  numismaticView: document.getElementById("numismaticView"),
  tableView: document.getElementById("tableView"),
  silverTools: document.getElementById("silverTools"),
  sortTools: document.getElementById("sortTools"),

  spotMeta: document.getElementById("spotMeta"),
  spotBig: document.getElementById("spotBig"),
  spotUpdated: document.getElementById("spotUpdated"),
  spotChart: document.getElementById("spotChart"),
  range24: document.getElementById("range24"),
  range7: document.getElementById("range7"),
  range30: document.getElementById("range30"),
  vaultStats: document.getElementById("vaultStats"),
  vaultSections: document.getElementById("vaultSections"),
  numStats: document.getElementById("numStats"),
  numGrid: document.getElementById("numGrid"),

  detailObvBtn: document.getElementById("detailObvBtn"),
  detailRevBtn: document.getElementById("detailRevBtn"),
  detailObvImg: document.getElementById("detailObvImg"),
  detailRevImg: document.getElementById("detailRevImg"),

  imageDialog: document.getElementById("imageDialog"),
  imgTitle: document.getElementById("imgTitle"),
  imgFull: document.getElementById("imgFull"),
  closeImageBtn: document.getElementById("closeImageBtn"),
};

// Map normalized series name -> BU example image path (optional).
// We "hotlink" public-domain / freely-licensed images from Wikimedia Commons so you
// don't have to commit a huge image set to GitHub.
function commonsFile(filename) {
  // Wikimedia redirects this to the actual CDN file URL.
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

const BU_EXAMPLES = {
  // Dollars (non-gold)
  "liberty seated dollar": commonsFile("Liberty Seated dollar obverse.jpg"),
  "trade dollar": commonsFile("1883 trade dollar obverse.jpg"),
  "morgan dollar": commonsFile("Morgan Dollar 1880S Obverse.png"),
  "peace dollar": commonsFile("Peace_Dollar_1922_Obverse.png"),
  "ike dollar": commonsFile("1974S Eisenhower Obverse.jpg"),

  // Half Dollars
  "capped bust half dollar": commonsFile("1834 Bust half dollar obverse.jpg"),
  "liberty seated half dollar": commonsFile("United States Seated Liberty half dollar obverse.jpg"),
  "barber half dollar": commonsFile("1894-O Barber half Dollar obverse.jpg"),
  "walking liberty half dollar": commonsFile("Walking Liberty Half Dollar 1945D Obverse.png"),
  "franklin half dollar": commonsFile("Franklin HalfObverse.png"),
  "kennedy half dollar": commonsFile("US 50 Cent Obv.png"),
  "half dollar": commonsFile("US 50 Cent Obv.png"),

  // Quarters
  "capped bust quarter": commonsFile("1819 quarter dollar obv.jpg"),
  "liberty seated quarter": commonsFile("1854 quarter obverse.jpg"),
  "barber quarter": commonsFile("1914 Barber Quarter NGC AU58 Obverse.png"),
  "standing liberty quarter": commonsFile("Standing Liberty Quarter Type2m 1926 Obverse.png"),
  "washington quarter": commonsFile("Washington Quarter Silver 1944S Obverse.png"),
  "quarter": commonsFile("Washington Quarter Silver 1944S Obverse.png"),

  // Dimes
  "capped bust dime": commonsFile("Capped Bust dime.jpg"),
  "liberty seated dime": commonsFile("Seated liberty dime.jpg"),
  "barber dime": commonsFile("1914 Barber Dime NGC MS64plus Obverse.png"),
  "mercury dime": commonsFile("1945 Mercury Dime Obverse.png"),
  "roosevelt dime": commonsFile("1996-S dime obverse.jpg"),
  "dime": commonsFile("1996-S dime obverse.jpg"),

  // Nickels
  "shield nickel": commonsFile("Shield nickel obverse.png"),
  "liberty nickel": commonsFile("Liberty Head Nickel 1883 NoCents Obverse.png"),
  "buffalo nickel": commonsFile("Buffalo Nickel 1913 Type 1 Obverse.png"),
  "jefferson nickel": commonsFile("Jefferson-Nickel-crop.png"),
  "war nickel": commonsFile("1945-P-Jefferson-War-Nickel-Obverse.JPG"),
  "nickel": commonsFile("Jefferson-Nickel-crop.png"),

  // Cents (large + small)
  "coronet head cent": commonsFile("1837_cent_obv.jpg"),
  "braided hair cent": commonsFile("1839 Braided Hair cent obverse.jpg"),
  "flying eagle cent": commonsFile("1857.Eagle.Cent.obverse.jpg"),
  "indian cent": commonsFile("1859 Indian Head cent obverse.png"),
  "lincoln cent (wheat reverse)": commonsFile("2010_cent_obverse.png"),
  "lincoln cent (modern)": commonsFile("2010_cent_obverse.png"),
  "cent": commonsFile("2010_cent_obverse.png"),

  // Other (non-gold)
  "two cent": commonsFile("1865 Two Cent Obverse.png"),
  "three cent silver": commonsFile("3 cent piece Ag obverse.jpg"),
  "three cent nickel": commonsFile("3 cent piece Ni obverse.jpg"),
  "twenty cent": commonsFile("Obverse of 1875 United States 20c coin.jpg"),

  // Half dimes
  "capped bust half dime": commonsFile("1829 half dime obv.jpg"),
  "liberty seated half dime": commonsFile("1857 seated liberty half dime obverse.jpg"),
};

function embeddedImageURL(coin, side) {
  const raw = getImageDataUrl(coin, side === "rev" ? "rev" : "obv");
  return raw || null;
}

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
  // Deprecated: website is now "basic info only" and uses BU example images instead of user photos.
  // Kept for backward compatibility if you import an older export that still has base64 images.
  const raw = side === "obv" ? coin.obverseImageData : coin.reverseImageData;
  if (!raw || typeof raw !== "string") return null;
  return `data:image/jpeg;base64,${raw}`;
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

  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw === "vault" || raw === "num" || raw === "table") activeView = raw;
  } catch (e) {
    // ignore
  }

  try {
    const raw = localStorage.getItem(CHART_RANGE_KEY);
    if (raw === "24h" || raw === "7d" || raw === "30d") chartRange = raw;
  } catch (e) {
    // ignore
  }

  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return;
    const json = JSON.parse(raw);
    if (json && typeof json === "object") silverOverrides = json;
  } catch (e) {
    // ignore
  }
}

async function fetchLiveSilverSpotUSDPerOzt() {
  // We intentionally do not call GoldAPI directly from the browser, because it would expose your API key.
  // Instead, we read `spot.json` (kept up-to-date by a GitHub Action using a GitHub Secret).
  try {
    const url = new URL(`spot.json?ts=${Date.now()}`, ASSET_BASE);
    const resp = await fetch(url, { cache: "no-store" });
    lastSpotFetchDebug = { url: url.toString(), ok: resp.ok, status: resp.status, error: "" };
    if (!resp.ok) return null;
    const json = await resp.json();
    const v = Number(json && json.usdPerOzt);
    if (!Number.isFinite(v) || v <= 0) {
      lastSpotFetchDebug = { url: url.toString(), ok: false, status: resp.status, error: "Invalid usdPerOzt in JSON." };
      return null;
    }
    spotMeta = {
      updatedAt: safeText(json && json.updatedAt),
      source: safeText(json && json.source),
    };
    return v;
  } catch (e) {
    lastSpotFetchDebug = { url: new URL("spot.json", ASSET_BASE).toString(), ok: false, status: 0, error: safeText(e && e.message) || String(e) };
    return null;
  }
}

async function applyLiveSpotIfAvailable() {
  const v = await fetchLiveSilverSpotUSDPerOzt();
  if (!v) return false;
  silverSpotUSDPerOzt = v;
  if (el.spotInput) el.spotInput.value = v.toFixed(2);
  saveToStorage();
  renderSpotHeader();
  return true;
}

async function loadSpotHistoryIfPresent() {
  try {
    const url = new URL(`spot_history.json?ts=${Date.now()}`, ASSET_BASE);
    const resp = await fetch(url, { cache: "no-store" });
    lastHistoryFetchDebug = { url: url.toString(), ok: resp.ok, status: resp.status, error: "", points: 0 };
    if (!resp.ok) return false;
    const json = await resp.json();
    if (!Array.isArray(json)) {
      lastHistoryFetchDebug = { url: url.toString(), ok: false, status: resp.status, error: "History JSON is not an array.", points: 0 };
      return false;
    }
    spotHistory = json
      .map((p) => ({ t: safeText(p && p.t), usdPerOzt: Number(p && p.usdPerOzt) }))
      .filter((p) => p.t && Number.isFinite(p.usdPerOzt) && p.usdPerOzt > 0)
      .slice(-8000);
    lastHistoryFetchDebug = { url: url.toString(), ok: true, status: resp.status, error: "", points: spotHistory.length };
    return true;
  } catch (e) {
    lastHistoryFetchDebug = { url: new URL("spot_history.json", ASSET_BASE).toString(), ok: false, status: 0, error: safeText(e && e.message) || String(e), points: 0 };
    return false;
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

  try {
    localStorage.setItem(VIEW_KEY, activeView);
  } catch (e) {
    // ignore
  }

  try {
    localStorage.setItem(CHART_RANGE_KEY, chartRange);
  } catch (e) {
    // ignore
  }

  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(silverOverrides));
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

function setActiveView(next) {
  if (next !== "vault" && next !== "num" && next !== "table") return;
  activeView = next;
  if (el.tabVault) el.tabVault.setAttribute("aria-selected", String(next === "vault"));
  if (el.tabNum) el.tabNum.setAttribute("aria-selected", String(next === "num"));
  if (el.tabTable) el.tabTable.setAttribute("aria-selected", String(next === "table"));

  if (el.vaultView) el.vaultView.classList.toggle("view--active", next === "vault");
  if (el.numismaticView) el.numismaticView.classList.toggle("view--active", next === "num");
  if (el.tableView) el.tableView.classList.toggle("view--active", next === "table");

  if (el.sortTools) el.sortTools.style.display = next === "table" ? "block" : "none";

  saveToStorage();
  rerender();
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

function overrideForGroupKey(key) {
  const v = silverOverrides[key];
  if (!v || typeof v !== "object") return null;
  return v;
}

function setOverrideForGroupKey(key, patch) {
  const prev = overrideForGroupKey(key) || {};
  silverOverrides[key] = { ...prev, ...patch };
  const cur = silverOverrides[key];
  const empty =
    (cur.isSilver === undefined || cur.isSilver === null) &&
    (cur.aswPerCoin === undefined || cur.aswPerCoin === null || cur.aswPerCoin === "");
  if (empty) delete silverOverrides[key];
  saveToStorage();
}

function groupSilverOztWithOverride(group) {
  const ov = overrideForGroupKey(group.key);
  if (ov && ov.isSilver === false) return 0;
  const per = ov && Number.isFinite(Number(ov.aswPerCoin)) ? Number(ov.aswPerCoin) : null;
  if (per !== null) return Math.max(0, per) * group.count;
  return groupSilverOzt(group);
}

function meltValueForGroupUSDWithOverride(group, spotUSDPerOzt) {
  const oz = groupSilverOztWithOverride(group);
  if (!Number.isFinite(oz) || oz <= 0) return 0;
  const spot = Number(spotUSDPerOzt);
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  return oz * spot;
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

  const totalMelt = groupsAll.reduce((sum, g) => sum + meltValueForGroupUSDWithOverride(g, silverSpotUSDPerOzt), 0);

  return {
    total: coins.length,
    totalVisible: groupsVisible.length,
    unique: uniqueKeys.size,
    dupes: groupsAll.filter((g) => g.count > 1).length,
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
    `Total melt: ${formatUSD(s.totalMelt)}`,
  ];
  if (s.oldest !== null && s.newest !== null) pills.push(`Years: ${s.oldest}–${s.newest}`);

  el.stats.innerHTML = pills.map((p) => `<div class="pill">${escapeHtml(p)}</div>`).join("");
}

function renderGrid(groups) {
  if (!el.tbody) return;
  el.tbody.innerHTML = "";
  el.empty.hidden = coins.length !== 0;

  const frag = document.createDocumentFragment();
  for (const g of groups) {
    const c = g.rep;
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");

    const y = year4(c.year) || c.year || "—";
    const mint = normalizeMint(c.mint);
    const qty = g.count;
    const melt = meltValueForGroupUSDWithOverride(g, silverSpotUSDPerOzt);
    const notes = groupNotes(g);

    const buTd = document.createElement("td");
    const bu = document.createElement("div");
    bu.className = "buThumb";
    const obvUrl = embeddedImageURL(c, "obv");
    if (obvUrl) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = obvUrl;
      img.alt = `${c.name} obverse`;
      img.addEventListener("error", () => {
        img.remove();
        bu.textContent = "—";
      }, { once: true });
      bu.appendChild(img);
    } else {
      bu.textContent = "—";
    }
    buTd.appendChild(bu);

    tr.appendChild(buTd);
    tr.appendChild(tdText(c.name || "Coin"));
    tr.appendChild(tdText(y));
    tr.appendChild(tdText(mint));
    tr.appendChild(tdText(c.type || "—"));
    tr.appendChild(tdText(String(qty), "right"));
    tr.appendChild(tdText(formatUSD(melt), "right"));
    tr.appendChild(tdText(notes, "notes"));

    tr.addEventListener("click", () => openDetail(g));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(g);
      }
    });

    frag.appendChild(tr);
  }
  el.tbody.appendChild(frag);
}

function openDetail(group) {
  const c = group.rep;

  el.detailTitle.textContent = c.name || "Coin";
  const y = year4(c.year) || c.year || "—";
  const mint = normalizeMint(c.mint);
  el.detailSubtitle.textContent = `${y}${mint === "P" ? "" : "-" + mint} • ${c.type || "—"} • ${group.count} in group`;

  // Photos (no BU fallback)
  const idCoin = c || (group.coins?.[0] || null);
  const obvThumb = idCoin ? embeddedImageURL(idCoin, "obv") : null;
  const revThumb = idCoin ? embeddedImageURL(idCoin, "rev") : null;
  // Full viewer uses the same embedded thumbnail image (still useful for quick inspection).
  const obvFull = obvThumb;
  const revFull = revThumb;

  if (el.detailObvImg) {
    el.detailObvImg.src = obvThumb || "";
    el.detailObvImg.style.visibility = obvThumb ? "visible" : "hidden";
  }
  if (el.detailRevImg) {
    el.detailRevImg.src = revThumb || "";
    el.detailRevImg.style.visibility = revThumb ? "visible" : "hidden";
  }
  if (el.detailObvBtn) {
    el.detailObvBtn.disabled = !obvFull;
    el.detailObvBtn.onclick = () => openImageViewer(`${c.name || "Coin"} – Obverse`, obvFull);
  }
  if (el.detailRevBtn) {
    el.detailRevBtn.disabled = !revFull;
    el.detailRevBtn.onclick = () => openImageViewer(`${c.name || "Coin"} – Reverse`, revFull);
  }

  el.kvYear.textContent = y;
  el.kvType.textContent = c.type || "—";
  el.kvMint.textContent = mint;
  el.kvNotes.textContent = groupNotes(group);

  if (el.kvMelt) {
    const melt = meltValueForGroupUSDWithOverride(group, silverSpotUSDPerOzt);
    const oz = groupSilverOztWithOverride(group);
    el.kvMelt.textContent = oz > 0 ? `${formatUSD(melt)}  (${oz.toFixed(4)} ozt Ag)` : "$0.00  (clad / no silver)";
  }

  el.dialog.showModal();
}

function openImageViewer(title, url) {
  if (!el.imageDialog || !el.imgFull) return;
  el.imgTitle.textContent = title || "Photo";
  el.imgFull.src = url || "";
  el.imageDialog.showModal();
}

function closeImageViewer() {
  if (el.imageDialog && el.imageDialog.open) el.imageDialog.close();
}

function closeDetail() {
  if (el.dialog.open) el.dialog.close();
}

function rerender() {
  updateTypeFilterOptions();
  const filteredGroups = filterCoins();
  const sortedGroups = sortGroups(filteredGroups, el.sortSelect?.value || "yearAsc");
  renderStats(sortedGroups);

  if (activeView === "vault") {
    renderSpotHeader();
    renderChart();
    renderVault(sortedGroups);
  } else if (activeView === "num") {
    renderSpotHeader();
    renderChart();
    renderNumismatic(sortedGroups);
  } else {
    renderSpotHeader();
    renderChart();
    renderGrid(sortedGroups);
  }

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
    qtyDesc: (a, b) => (b.count - a.count) || a.name.localeCompare(b.name),
    meltDesc: (a, b) => (meltValueForGroupUSDWithOverride(b, silverSpotUSDPerOzt) - meltValueForGroupUSDWithOverride(a, silverSpotUSDPerOzt)) || a.name.localeCompare(b.name),
  }[mode] || ((a, b) => a.name.localeCompare(b.name));
  copy.sort(cmp);
  return copy;
}

function formatUSD(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function renderSpotHeader() {
  const v = Number(silverSpotUSDPerOzt);
  const spotText = Number.isFinite(v) && v > 0 ? formatUSD(v) : "$—";
  if (el.spotBig) el.spotBig.textContent = spotText;

  const updated = spotMeta && spotMeta.updatedAt ? spotMeta.updatedAt : "";
  const source = spotMeta && spotMeta.source ? spotMeta.source : "";
  const metaLine = updated ? `Updated: ${updated}${source ? " • " + source : ""}` : (source || "—");
  if (el.spotUpdated) el.spotUpdated.textContent = metaLine;
  if (el.spotMeta) {
    // Helpful debug line so you don't need DevTools on iPhone.
    const live = lastSpotFetchDebug
      ? `Live: ${lastSpotFetchDebug.ok ? "OK" : "FAIL"} (${lastSpotFetchDebug.status || "—"})`
      : "Live: —";
    const hist = lastHistoryFetchDebug
      ? `History: ${lastHistoryFetchDebug.ok ? "OK" : "FAIL"} (${lastHistoryFetchDebug.points || 0})`
      : "History: —";
    el.spotMeta.textContent = `${metaLine}  •  ${live}  •  ${hist}`;
  }
}

function setChartRange(next) {
  if (next !== "24h" && next !== "7d" && next !== "30d") return;
  chartRange = next;
  if (el.range24) el.range24.setAttribute("aria-selected", String(next === "24h"));
  if (el.range7) el.range7.setAttribute("aria-selected", String(next === "7d"));
  if (el.range30) el.range30.setAttribute("aria-selected", String(next === "30d"));
  saveToStorage();
  rerender();
}

function chartPointsForRange() {
  if (!spotHistory.length) return [];
  const now = Date.now();
  const ms = chartRange === "24h" ? 24 * 3600 * 1000 : (chartRange === "7d" ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000);
  const cutoff = now - ms;
  return spotHistory
    .map((p) => ({ t: Date.parse(p.t), v: Number(p.usdPerOzt) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0 && p.t >= cutoff)
    .sort((a, b) => a.t - b.t);
}

function renderChart() {
  const canvas = el.spotChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pts = chartPointsForRange();
  if (pts.length < 2) {
    ctx.fillStyle = "rgba(234,240,255,0.65)";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
    const hint = lastHistoryFetchDebug && !lastHistoryFetchDebug.ok
      ? `History fetch failed (${lastHistoryFetchDebug.status || "—"}).`
      : "No history yet (run the Action a few times).";
    ctx.fillText(hint, 16, 34);
    return;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const pad = Math.max(0.05, (max - min) * 0.12);
  min -= pad;
  max += pad;

  const left = 48;
  const right = 14;
  const top = 14;
  const bottom = 22;
  const iw = w - left - right;
  const ih = h - top - bottom;

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (ih * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + iw, y);
    ctx.stroke();
  }

  // y labels
  ctx.fillStyle = "rgba(234,240,255,0.55)";
  ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const v = max - ((max - min) * i) / 4;
    const y = top + (ih * i) / 4;
    ctx.fillText(`$${v.toFixed(2)}`, 10, y + 4);
  }

  // line
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const xt = (t) => left + ((t - t0) / (t1 - t0)) * iw;
  const yv = (v) => top + (1 - (v - min) / (max - min)) * ih;

  ctx.strokeStyle = "rgba(109,225,255,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xt(pts[0].t), yv(pts[0].v));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(xt(pts[i].t), yv(pts[i].v));
  ctx.stroke();

  // last point
  const last = pts[pts.length - 1];
  ctx.fillStyle = "rgba(255,221,133,0.95)";
  ctx.beginPath();
  ctx.arc(xt(last.t), yv(last.v), 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderPills(targetEl, pills) {
  if (!targetEl) return;
  targetEl.innerHTML = pills.map((p) => `<div class="pill">${escapeHtml(p)}</div>`).join("");
}

function renderVault(groupsVisible) {
  if (!el.vaultSections) return;

  const seriesMap = new Map(); // name -> [groups]
  for (const g of groupsVisible) {
    const ov = overrideForGroupKey(g.key);
    const oz = groupSilverOztWithOverride(g);
    const isSilver = (ov && ov.isSilver === true) || oz > 0;
    if (!isSilver) continue;
    const name = safeText(g.name) || "Coin";
    if (!seriesMap.has(name)) seriesMap.set(name, []);
    seriesMap.get(name).push(g);
  }

  // Stats
  let totalOz = 0;
  let totalMelt = 0;
  let totalCoins = 0;
  for (const [, list] of seriesMap.entries()) {
    for (const g of list) {
      totalCoins += g.count;
      const oz = groupSilverOztWithOverride(g);
      totalOz += oz;
      totalMelt += meltValueForGroupUSDWithOverride(g, silverSpotUSDPerOzt);
    }
  }
  renderPills(el.vaultStats, [
    `Silver coins: ${totalCoins}`,
    `Total ASW: ${totalOz.toFixed(4)} ozt`,
    `Total melt: ${formatUSD(totalMelt)}`,
  ]);

  // Sections
  const names = Array.from(seriesMap.keys()).sort((a, b) => a.localeCompare(b));
  el.vaultSections.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const name of names) {
    const groups = seriesMap.get(name).slice().sort((a, b) => (year4(a.year) || "").localeCompare(year4(b.year) || ""));
    const section = document.createElement("div");
    section.className = "vaultSection";

    const head = document.createElement("div");
    head.className = "vaultSection__head";

    const title = document.createElement("div");
    title.className = "vaultSection__title";
    title.textContent = name;

    let secCoins = 0;
    let secOz = 0;
    let secMelt = 0;
    for (const g of groups) {
      secCoins += g.count;
      secOz += groupSilverOztWithOverride(g);
      secMelt += meltValueForGroupUSDWithOverride(g, silverSpotUSDPerOzt);
    }
    const sub = document.createElement("div");
    sub.className = "vaultSection__sub";
    sub.textContent = `${secCoins} coins • ${secOz.toFixed(4)} ozt • ${formatUSD(secMelt)}`;

    head.appendChild(title);
    head.appendChild(sub);
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "trayGrid";

    for (const g of groups) {
      const tray = document.createElement("div");
      tray.className = "tray";

      const top = document.createElement("div");
      top.className = "tray__top";

      const thumb = document.createElement("div");
      thumb.className = "tray__thumb";
      const repCoin = g.rep || g.coins?.[0];
      const obv = repCoin ? embeddedImageURL(repCoin, "obv") : null;
      if (obv) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = obv;
        img.alt = `${name} obverse`;
        img.addEventListener("error", () => {
          img.remove();
          thumb.textContent = "—";
        }, { once: true });
        thumb.appendChild(img);
      } else {
        thumb.textContent = "—";
      }

      const block = document.createElement("div");
      const y = year4(g.year) || g.year || "—";
      const mint = normalizeMint(g.mint);
      const ym = `${y}${mint === "P" ? "" : "-" + mint}`;

      const tTitle = document.createElement("div");
      tTitle.className = "tray__title";
      tTitle.textContent = ym;
      const tMeta = document.createElement("div");
      tMeta.className = "tray__meta";
      tMeta.textContent = `${g.count} coin${g.count === 1 ? "" : "s"}`;

      block.appendChild(tTitle);
      block.appendChild(tMeta);

      top.appendChild(thumb);
      top.appendChild(block);
      tray.appendChild(top);

      const oz = groupSilverOztWithOverride(g);
      const melt = meltValueForGroupUSDWithOverride(g, silverSpotUSDPerOzt);

      const stats = document.createElement("div");
      stats.className = "tray__stats";
      stats.appendChild(miniStat("Qty", String(g.count)));
      stats.appendChild(miniStat("ASW", `${oz.toFixed(4)} ozt`));
      stats.appendChild(miniStat("Melt", formatUSD(melt)));
      tray.appendChild(stats);

      // Overrides
      const list = document.createElement("div");
      list.className = "tray__list";

      const row = document.createElement("div");
      row.className = "slotRow";

      const label = document.createElement("div");
      label.className = "slotRow__label";
      label.textContent = "Override";

      const controls = document.createElement("div");
      controls.className = "slotRow__controls";

      const ov = overrideForGroupKey(g.key) || {};
      const isSilver = ov.isSilver;

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = isSilver === true;
      chk.addEventListener("change", () => {
        setOverrideForGroupKey(g.key, { isSilver: chk.checked ? true : undefined });
        rerender();
      });

      const chkWrap = document.createElement("label");
      chkWrap.className = "toggle";
      chkWrap.title = "Force this group to count as silver (even if the estimator thinks it's clad).";
      chkWrap.appendChild(chk);
      chkWrap.appendChild(document.createTextNode("Force silver"));

      const input = document.createElement("input");
      input.className = "smallInput";
      input.placeholder = "ASW/coin";
      input.inputMode = "decimal";
      input.value = Number.isFinite(Number(ov.aswPerCoin)) ? String(Number(ov.aswPerCoin)) : "";
      input.title = "Override ASW per coin (ozt). Example: 0.36169";
      input.addEventListener("change", () => {
        const raw = safeText(input.value).trim().replace(/[^0-9.]/g, "");
        const v = raw ? Number.parseFloat(raw) : NaN;
        setOverrideForGroupKey(g.key, { aswPerCoin: Number.isFinite(v) ? v : undefined });
        rerender();
      });

      const excl = document.createElement("button");
      excl.type = "button";
      excl.className = "pillBtn";
      excl.textContent = "Exclude";
      excl.title = "Force this group to be treated as non-silver.";
      excl.addEventListener("click", () => {
        setOverrideForGroupKey(g.key, { isSilver: false });
        rerender();
      });

      controls.appendChild(chkWrap);
      controls.appendChild(input);
      controls.appendChild(excl);

      row.appendChild(label);
      row.appendChild(controls);
      list.appendChild(row);

      tray.appendChild(list);

      grid.appendChild(tray);
    }

    section.appendChild(grid);
    frag.appendChild(section);
  }

  el.vaultSections.appendChild(frag);
}

function miniStat(k, v) {
  const el2 = document.createElement("div");
  el2.className = "miniStat";
  const kk = document.createElement("div");
  kk.className = "miniStat__k";
  kk.textContent = k;
  const vv = document.createElement("div");
  vv.className = "miniStat__v";
  vv.textContent = v;
  el2.appendChild(kk);
  el2.appendChild(vv);
  return el2;
}

function renderNumismatic(groupsVisible) {
  if (!el.numGrid) return;
  const seriesMap = new Map(); // name -> {count, groups}
  for (const g of groupsVisible) {
    const ov = overrideForGroupKey(g.key);
    const oz = groupSilverOztWithOverride(g);
    const isSilver = (ov && ov.isSilver === true) || oz > 0;
    if (isSilver) continue;
    const name = safeText(g.name) || "Coin";
    const cur = seriesMap.get(name) || { count: 0, groups: [] };
    cur.count += g.count;
    cur.groups.push(g);
    seriesMap.set(name, cur);
  }

  const total = Array.from(seriesMap.values()).reduce((s, x) => s + x.count, 0);
  renderPills(el.numStats, [
    `Non-silver coins: ${total}`,
    `Series: ${seriesMap.size}`,
  ]);

  el.numGrid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const names = Array.from(seriesMap.keys()).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const it = seriesMap.get(name);
    const card = document.createElement("div");
    card.className = "numCard";

    const top = document.createElement("div");
    top.className = "numCard__top";

    const thumb = document.createElement("div");
    thumb.className = "tray__thumb";
    const rep = it.groups[0]?.rep || it.groups[0]?.coins?.[0];
    const obv = rep ? embeddedImageURL(rep, "obv") : null;
    if (obv) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = obv;
      img.alt = `${name} obverse`;
      img.addEventListener("error", () => {
        img.remove();
        thumb.textContent = "—";
      }, { once: true });
      thumb.appendChild(img);
    } else {
      thumb.textContent = "—";
    }

    const block = document.createElement("div");
    const t = document.createElement("div");
    t.className = "numCard__title";
    t.textContent = name;
    const meta = document.createElement("div");
    meta.className = "numCard__meta";
    meta.textContent = `${it.count} coin${it.count === 1 ? "" : "s"}`;
    block.appendChild(t);
    block.appendChild(meta);

    top.appendChild(thumb);
    top.appendChild(block);
    card.appendChild(top);

    frag.appendChild(card);
  }
  el.numGrid.appendChild(frag);
}

async function tryLoadDefaultCoinsJson() {
  // If the repo includes `coins.json`, prefer it (keeps GitHub Pages always up-to-date).
  // We bypass caches to reduce "stale data" surprises.
  try {
    const url = new URL(`coins.json?v=${Date.now()}`, ASSET_BASE);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return false;
    const json = await res.json();
    coins = parseCoins(json);
    saveToStorage();
    return true;
  } catch (e) {
    return false;
  }
}

async function init() {
  loadFromStorage();
  // These depend on files committed to the site (and GitHub Actions for live updates).
  // If they fail, the app still works with manual spot input.
  const liveOk = await applyLiveSpotIfAvailable();
  const histOk = await loadSpotHistoryIfPresent();
  if (!liveOk && el.spotMeta) el.spotMeta.textContent = "Live price unavailable (missing spot.json or Action not running).";
  if (!histOk && el.spotUpdated) {
    // Keep whatever spot header says; chart will show its own message.
  }
  updateTypeFilterOptions();
  if (el.spotInput) {
    el.spotInput.value = String(Number(silverSpotUSDPerOzt).toFixed(2));
  }
  setChartRange(chartRange);

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
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SPOT_KEY);
    localStorage.removeItem(VIEW_KEY);
    localStorage.removeItem(CHART_RANGE_KEY);
    localStorage.removeItem(OVERRIDES_KEY);
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

  if (el.spotLiveBtn) {
    el.spotLiveBtn.addEventListener("click", async () => {
      el.spotLiveBtn.disabled = true;
      const prev = el.spotLiveBtn.textContent;
      el.spotLiveBtn.textContent = "…";
      try {
        const ok = await applyLiveSpotIfAvailable();
        rerender();
        el.spotLiveBtn.textContent = ok ? "Live" : "No data";
      } finally {
        setTimeout(() => {
          el.spotLiveBtn.disabled = false;
          el.spotLiveBtn.textContent = prev || "Live";
        }, 900);
      }
    });
  }

  if (el.tabVault) el.tabVault.addEventListener("click", () => setActiveView("vault"));
  if (el.tabNum) el.tabNum.addEventListener("click", () => setActiveView("num"));
  if (el.tabTable) el.tabTable.addEventListener("click", () => setActiveView("table"));

  if (el.range24) el.range24.addEventListener("click", () => setChartRange("24h"));
  if (el.range7) el.range7.addEventListener("click", () => setChartRange("7d"));
  if (el.range30) el.range30.addEventListener("click", () => setChartRange("30d"));

  el.closeDialogBtn.addEventListener("click", () => closeDetail());
  el.dialog.addEventListener("click", (e) => {
    // close if clicking the backdrop area
    const rect = el.dialog.getBoundingClientRect();
    const inDialog =
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
    if (!inDialog) closeDetail();
  });

  if (el.closeImageBtn) el.closeImageBtn.addEventListener("click", () => closeImageViewer());
  if (el.imageDialog) {
    el.imageDialog.addEventListener("click", (e) => {
      const rect = el.imageDialog.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
      if (!inDialog) closeImageViewer();
    });
  }

  // If `coins.json` exists in the deployed folder, always load it and overwrite older local data.
  await tryLoadDefaultCoinsJson();
  setActiveView(activeView);
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

function tdText(text, align) {
  const td = document.createElement("td");
  td.textContent = text ?? "";
  if (align === "right") td.style.textAlign = "right";
  if (align === "notes") td.style.color = "rgba(234,240,255,0.70)";
  return td;
}

function buExampleURLForSeries(name) {
  const key = safeText(name).toLowerCase().trim();
  if (BU_EXAMPLES[key]) return BU_EXAMPLES[key];

  // Fallback: containment match, preferring the most-specific keys first.
  // This makes "Walking Liberty Half Dollar" resolve before the generic "half dollar".
  if (!buExampleURLForSeries._keys) {
    buExampleURLForSeries._keys = Object.keys(BU_EXAMPLES).sort((a, b) => b.length - a.length);
  }
  for (const k of buExampleURLForSeries._keys) {
    if (key.includes(k)) return BU_EXAMPLES[k];
  }

  return null;
}

// Cached key list for BU examples (attached to function to avoid another global).
buExampleURLForSeries._keys = null;
