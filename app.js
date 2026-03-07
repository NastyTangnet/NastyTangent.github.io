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
};

// Map normalized series name -> BU example image path (optional).
// We "hotlink" public-domain / freely-licensed images from Wikimedia Commons so you
// don't have to commit a huge image set to GitHub.
const BU_EXAMPLES = {
  // Half dollar (Kennedy design) – US Treasury / US Mint image
  "kennedy half dollar": "https://upload.wikimedia.org/wikipedia/commons/e/e5/US_50_Cent_Obv.png",
  "half dollar": "https://upload.wikimedia.org/wikipedia/commons/e/e5/US_50_Cent_Obv.png",

  // Quarter (Washington design) – US Treasury / US Mint image
  "washington quarter": "https://upload.wikimedia.org/wikipedia/commons/7/70/2021-P_US_Quarter_Obverse.jpg",
  "quarter": "https://upload.wikimedia.org/wikipedia/commons/7/70/2021-P_US_Quarter_Obverse.jpg",

  // Dime (Roosevelt) – US Treasury / US Mint image
  "roosevelt dime": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Dime_Obverse_13.png",
  "dime": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Dime_Obverse_13.png",

  // Cent (Lincoln obverse) – US Mint image
  "cent": "https://upload.wikimedia.org/wikipedia/commons/0/0c/2010_cent_obverse.png",

  // Nickel (Jefferson obverse) – public domain currency image
  "nickel": "https://upload.wikimedia.org/wikipedia/commons/a/af/Jefferson-Nickel-crop.png",

  // Dollars (silver)
  "morgan dollar": "https://upload.wikimedia.org/wikipedia/commons/3/35/2021_Morgan_Commemorative_Dollar_Obverse.png",
  "peace dollar": "https://upload.wikimedia.org/wikipedia/commons/0/0e/Peace_dollar.jpg",
};

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

  const totalMelt = groupsAll.reduce((sum, g) => sum + meltValueForGroupUSD(g, silverSpotUSDPerOzt), 0);

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
    const melt = meltValueForGroupUSD(g, silverSpotUSDPerOzt);
    const notes = groupNotes(g);

    const buTd = document.createElement("td");
    const bu = document.createElement("div");
    bu.className = "buThumb";
    const buUrl = buExampleURLForSeries(c.name);
    if (buUrl) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = buUrl;
      img.alt = `${c.name} BU example`;
      img.addEventListener("error", () => {
        img.remove();
        bu.textContent = "BU";
      }, { once: true });
      bu.appendChild(img);
    } else {
      bu.textContent = "BU";
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

  el.kvYear.textContent = y;
  el.kvType.textContent = c.type || "—";
  el.kvMint.textContent = mint;
  el.kvNotes.textContent = groupNotes(group);

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
    qtyDesc: (a, b) => (b.count - a.count) || a.name.localeCompare(b.name),
    meltDesc: (a, b) => (meltValueForGroupUSD(b, silverSpotUSDPerOzt) - meltValueForGroupUSD(a, silverSpotUSDPerOzt)) || a.name.localeCompare(b.name),
  }[mode] || ((a, b) => a.name.localeCompare(b.name));
  copy.sort(cmp);
  return copy;
}

function formatUSD(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function tryLoadDefaultCoinsJson() {
  // If the repo includes `coins.json`, prefer it (keeps GitHub Pages always up-to-date).
  // We bypass caches to reduce "stale data" surprises.
  try {
    const res = await fetch(`./coins.json?v=${Date.now()}`, { cache: "no-store" });
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

  // If `coins.json` exists in the deployed folder, always load it and overwrite older local data.
  await tryLoadDefaultCoinsJson();
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

  // Fallback: try to match by containment so any series name that contains "cent"
  // still gets a BU example image.
  for (const k of Object.keys(BU_EXAMPLES)) {
    if (k !== "quarter" && k !== "dime" && k !== "cent" && k !== "nickel" && k !== "half dollar") {
      // Keep the generic keys as fallback; prefer specific matches.
      continue;
    }
  }

  if (key.includes("morgan") && BU_EXAMPLES["morgan dollar"]) return BU_EXAMPLES["morgan dollar"];
  if (key.includes("peace") && BU_EXAMPLES["peace dollar"]) return BU_EXAMPLES["peace dollar"];
  if (key.includes("half dollar") && BU_EXAMPLES["half dollar"]) return BU_EXAMPLES["half dollar"];
  if (key.includes("quarter") && BU_EXAMPLES["quarter"]) return BU_EXAMPLES["quarter"];
  if (key.includes("dime") && BU_EXAMPLES["dime"]) return BU_EXAMPLES["dime"];
  if (key.includes("cent") && BU_EXAMPLES["cent"]) return BU_EXAMPLES["cent"];
  if (key.includes("nickel") && BU_EXAMPLES["nickel"]) return BU_EXAMPLES["nickel"];

  return null;
}
