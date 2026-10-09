// Data USA Snapshot: fetches workforce data from the Data USA (Tesseract) API
// and renders it with plain DOM code. Settings live in config.json.

const $ = (id) => document.getElementById(id);

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = (share) => `${(share * 100).toFixed(1)}%`;

// Color-blind-friendly palette for the race / ethnicity bars.
const PALETTE = ["#2f6fed", "#e69f00", "#009e73", "#cc79a7", "#d55e00", "#56b4e9", "#7a5195", "#8c8c8c"];
const GENDER_AGE_TABS = ["Gender", "Age"];

let config;
let industryRows = [];
let focusIndustry = ""; // "" means all industries
let activeTab = GENDER_AGE_TABS[0];
let states = []; // [{ id, name }] loaded from the API
let selectedState = null; // { id, name }, or null for the whole United States
const demoRequests = {}; // demographic key -> cached promise of normalized rows
let gaToken = 0; // guards against out-of-date async renders
let raceToken = 0;
let loadToken = 0;

// ---------- Friendly messages ----------

// Errors we throw on purpose carry a message that is safe to show to anyone.
// Technical details go to the browser console instead.
class UserFacingError extends Error {}

const GENERIC_ERROR = "Something unexpected went wrong. Please refresh the page and try again.";
const messageFor = (error) => (error instanceof UserFacingError ? error.message : GENERIC_ERROR);

function messageForStatus(status) {
  if (status === 429) return "The data service is busy right now. Please wait a minute and try again.";
  if (status >= 500) return "The data service is having trouble right now. Please try again in a few minutes.";
  return "The data service couldn't understand our request. It may have changed. Please try again later.";
}

// ---------- API ----------

async function loadConfig() {
  const response = await fetch("config.json");
  if (!response.ok) {
    console.error(`Could not load config.json (HTTP ${response.status})`);
    throw new UserFacingError("This page couldn't load its settings. Please refresh the page.");
  }
console.log("Config loaded:", response);





  return response.json();
}

// Builds a Tesseract query, fetches it (with a timeout), and returns the array of records.
// Results are limited to the selected state unless `allStates` is true.
async function fetchCube(drilldowns, measures, { allStates = false } = {}) {
  let include = `Year:${config.year};${config.workforceFilter}`;
  if (selectedState && !allStates) include += `;${config.levels.state}:${selectedState.id}`;
  const params = new URLSearchParams({
    cube: config.cube,
    drilldowns: drilldowns.join(","),
    measures: measures.join(","),
    include,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(`${config.baseUrl}?${params}`, { signal: controller.signal });
  } catch (error) {
    console.error("Data USA request failed:", error);
    if (error.name === "AbortError") {
      throw new UserFacingError("The data service is taking longer than usual to respond. Please try again in a moment.");
    }
    throw new UserFacingError("We couldn't reach the data service. Please check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    console.error(`Data USA returned HTTP ${response.status} for`, params.toString());
    throw new UserFacingError(messageForStatus(response.status));
  }
  const json = await response.json();
  if (json.error) {
    console.error("Data USA reported an error:", json.detail);
    throw new UserFacingError("The data service reported a problem with this request. Please try again later.");
  }
  return json.data;
}

// ---------- UI states ----------

function setState(state, message = "") {
  $("loading").hidden = state !== "loading";
  $("error").hidden = state !== "error";
  $("empty").hidden = state !== "empty";
  $("content").hidden = state !== "data";
  if (state === "error") $("error-message").textContent = message;
}

// Shows a status message, with an optional Retry button, inside `element`.
function showStatus(element, message, retry) {
  element.replaceChildren(document.createTextNode(message));
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", retry);
    element.append(button);
  }
}

// ---------- Rendering helpers ----------

// Draws horizontal bars into `container`.
// item: { label, value, display, sub, title, marker, color }
// options: { onSelect(label), selected }
function renderBars(container, items, options = {}) {
  container.replaceChildren();
  if (!items.length) {
    container.textContent = "No data is available for this selection.";
    return;
  }
  const max = Math.max(...items.flatMap((item) => [item.value, item.marker || 0]));
  const scale = (value) => (max ? `${(value / max) * 100}%` : "0%");

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "row";
    if (item.title) row.title = item.title;

    const label = document.createElement("span");
    label.textContent = item.label;

    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = scale(item.value);
    if (item.color) fill.style.background = item.color;
    track.append(fill);
    if (item.marker !== undefined) {
      const marker = document.createElement("div");
      marker.className = "marker";
      marker.style.left = scale(item.marker);
      marker.title = `Share of whole workforce: ${percent(item.marker)}`;
      track.append(marker);
    }

    const value = document.createElement("span");
    value.className = "val";
    value.textContent = item.display;
    if (item.sub) {
      const sub = document.createElement("small");
      sub.textContent = item.sub;
      value.append(sub);
    }

    row.append(label, track, value);

    if (options.onSelect) {
      row.classList.add("clickable");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      if (options.selected === item.label) row.classList.add("selected");
      row.addEventListener("click", () => options.onSelect(item.label));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options.onSelect(item.label);
        }
      });
    }
    container.append(row);
  }
}

// ---------- Main sections ----------

function renderStats(nationRows) {
  const nation = nationRows[0];
  $("workforce").textContent = compact.format(nation[config.measures.workers]);
  $("avg-wage").textContent = money.format(nation[config.measures.wage]);
}

function renderIndustryChart() {
  const { workers, wage } = config.measures;
  const items = industryRows
    .map((row) => ({
      label: row[config.levels.industry],
      value: Number(row[workers]) || 0,
      display: compact.format(Number(row[workers]) || 0),
      sub: `avg ${money.format(Number(row[wage]) || 0)}`,
      title: `Average wage: ${money.format(Number(row[wage]) || 0)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, config.topIndustries);
  renderBars($("industry-chart"), items, { onSelect: toggleFocus, selected: focusIndustry });
}

function renderEducation(rows) {
  const { workers, wage } = config.measures;
  const groups = config.educationGroups.map((group) => ({ ...group, n: 0, wageTotal: 0 }));
  let other = { label: "Other", members: [], n: 0, wageTotal: 0 };
  for (const row of rows) {
    const n = Number(row[workers]) || 0;
    const group = groups.find((g) => g.members.includes(row[config.levels.education])) || other;
    group.n += n;
    group.wageTotal += n * (Number(row[wage]) || 0);
  }
  if (other.n) groups.push(other);
  const total = groups.reduce((acc, g) => acc + g.n, 0);
  const items = groups.map((g) => ({
    label: g.label,
    value: g.n,
    display: percent(total ? g.n / total : 0),
    sub: g.n ? `avg ${money.format(g.wageTotal / g.n)}` : "",
    title: `${compact.format(g.n)} workers`,
  }));
  renderBars($("education-chart"), items);
}

// ---------- Focus industry (drives the demographic sections) ----------

function toggleFocus(name) {
  setFocus(focusIndustry === name ? "" : name);
}

function setFocus(name) {
  focusIndustry = name;
  $("focus-industry").value = name;
  renderIndustryChart();
  renderGenderAge();
  renderRace();
}

const focusLabel = () => focusIndustry || "all industries";

function setupFocusSelect() {
  const select = $("focus-industry");
  select.replaceChildren(new Option("All industries", ""));
  const names = industryRows.map((row) => row[config.levels.industry]).sort();
  for (const name of names) select.append(new Option(name, name));
  select.value = focusIndustry;
  select.onchange = () => setFocus(select.value);
}

// ---------- Demographics x industry ----------

// Maps a raw API value to the label shown in the app.
function groupLabel(key, raw) {
  if (key === "Age") {
    const bucket = config.ageBuckets.find((b) => raw >= b.min && raw <= b.max);
    return bucket ? bucket.label : "Other";
  }
  if (key === "Race") return config.raceLabels[raw] || raw;
  if (key === "Ethnicity") {
    if (raw === "Not Hispanic") return "Not Hispanic or Latino";
    return config.hispanicTop.includes(raw) ? raw : "Other Hispanic or Latino";
  }
  return raw;
}

// Fetches (once) industry x demographic rows and normalizes them.
function getDemoRows(key) {
  if (!demoRequests[key]) {
    const { workers, wage } = config.measures;
    const level = config.demographics[key];
    const request = fetchCube([config.levels.industry, level], [workers, wage]).then((rows) =>
      rows.map((row) => ({
        industry: row[config.levels.industry],
        group: groupLabel(key, row[level]),
        workers: Number(row[workers]) || 0,
        wage: Number(row[wage]) || 0,
      }))
    );
    // Allow a retry after failure (only if the cache entry is still this request).
    request.catch(() => {
      if (demoRequests[key] === request) delete demoRequests[key];
    });
    demoRequests[key] = request;
  }
  return demoRequests[key];
}

// Sums workers per group, tracking wage x workers so we can compute weighted averages.
function aggregate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const entry = groups.get(row.group) || { n: 0, wageTotal: 0 };
    entry.n += row.workers;
    entry.wageTotal += row.workers * row.wage;
    groups.set(row.group, entry);
  }
  return groups;
}

const totalOf = (groups) => [...groups.values()].reduce((acc, g) => acc + g.n, 0);

// Builds bar items: share within the focus industry, with a marker at the overall share.
function buildItems(key, rows, { showWage }) {
  const overall = aggregate(rows);
  const inFocus = focusIndustry ? aggregate(rows.filter((r) => r.industry === focusIndustry)) : overall;
  const overallTotal = totalOf(overall);
  const focusTotal = totalOf(inFocus);
  if (!focusTotal) return [];

  let names = [...overall.keys()].filter((name) => overall.get(name).n > 0);
  if (key === "Age") {
    const order = config.ageBuckets.map((b) => b.label);
    names.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else {
    names.sort((a, b) => overall.get(b).n - overall.get(a).n); // stable order across industries
  }

  return names.map((name, index) => {
    const group = inFocus.get(name) || { n: 0, wageTotal: 0 };
    const share = group.n / focusTotal;
    const overallShare = overall.get(name).n / overallTotal;
    const parts = [];
    if (focusIndustry) parts.push(`overall ${percent(overallShare)}`);
    if (showWage && group.n) parts.push(`avg ${money.format(group.wageTotal / group.n)}`);
    if (showWage && group.n < config.smallGroup) parts.push("small group");
    return {
      label: name,
      value: share,
      display: percent(share),
      sub: parts.join(" · "),
      title: `${compact.format(group.n)} workers`,
      marker: focusIndustry ? overallShare : undefined,
      color: showWage ? PALETTE[index % PALETTE.length] : undefined,
    };
  });
}

async function renderGenderAge() {
  const token = ++gaToken;
  const key = activeTab;
  $("ga-title").textContent = `${key} · ${focusLabel()}`;
  try {
    if (!demoRequests[key]) showStatus($("ga-status"), "Loading…");
    const rows = await getDemoRows(key);
    if (token !== gaToken) return; // a newer render replaced this one
    $("ga-status").replaceChildren();
    renderBars($("ga-chart"), buildItems(key, rows, { showWage: false }));
  } catch (error) {
    if (token !== gaToken) return;
    $("ga-chart").replaceChildren();
    console.error(error);
    showStatus($("ga-status"), `We couldn't load the ${key.toLowerCase()} breakdown. ${messageFor(error)}`, renderGenderAge);
  }
}

async function renderRace() {
  const token = ++raceToken;
  $("race-title").textContent = `Race & ethnicity · ${focusLabel()}`;
  try {
    if (!demoRequests.Race || !demoRequests.Ethnicity) showStatus($("race-status"), "Loading…");
    const [raceData, ethnicityData] = await Promise.all([getDemoRows("Race"), getDemoRows("Ethnicity")]);
    if (token !== raceToken) return;
    $("race-status").replaceChildren();
    renderBars($("race-chart"), buildItems("Race", raceData, { showWage: true }));
    renderBars($("ethnicity-chart"), buildItems("Ethnicity", ethnicityData, { showWage: true }));
  } catch (error) {
    if (token !== raceToken) return;
    $("race-chart").replaceChildren();
    $("ethnicity-chart").replaceChildren();
    console.error(error);
    showStatus($("race-status"), `We couldn't load the race and ethnicity breakdown. ${messageFor(error)}`, renderRace);
  }
}

function setupTabs() {
  const tabs = $("demo-tabs");
  tabs.replaceChildren();
  for (const tab of GENDER_AGE_TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab === activeTab));
    button.textContent = tab;
    button.addEventListener("click", () => {
      activeTab = tab;
      for (const other of tabs.children) other.setAttribute("aria-selected", String(other === button));
      renderGenderAge();
    });
    tabs.append(button);
  }
}

// ---------- State picker ----------

// The API's State level has an ID like "04000US06"; the last two digits are the state's FIPS code.
const fipsOf = (id) => id.slice(-2);

async function loadStates() {
  const rows = await fetchCube([config.levels.state], [config.measures.workers], { allStates: true });
  return rows
    .map((row) => ({ id: row[`${config.levels.state} ID`], name: row[config.levels.state] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function setupStatePicker() {
  const select = $("state-select");
  select.replaceChildren(new Option("United States", ""));
  for (const state of states) select.append(new Option(state.name, state.id));
  select.value = selectedState ? selectedState.id : "";
  select.disabled = false;
  select.onchange = () => chooseState(select.value);
}

function chooseState(id) {
  selectedState = states.find((state) => state.id === id) || null;
  // Keep the choice in the URL (?state=06) so the page can be shared or reloaded.
  const url = new URL(location.href);
  if (selectedState) url.searchParams.set("state", fipsOf(selectedState.id));
  else url.searchParams.delete("state");
  history.replaceState(null, "", url);
  for (const key of Object.keys(demoRequests)) delete demoRequests[key];
  load();
}

// ---------- Main ----------

async function load() {
  const token = ++loadToken;
  setState("loading");
  try {
    if (!config) config = await loadConfig();
console.log("Config loaded:", config);
    if (!states.length) {
      try {
        states = await loadStates();
        const wanted = new URLSearchParams(location.search).get("state");
        selectedState = states.find((state) => fipsOf(state.id) === wanted) || null;
        setupStatePicker();
      } catch (error) {
        console.error("Couldn't load the state list; showing national data only.", error);
        $("place-note").textContent = "The list of states isn't available right now, so you're seeing the whole United States.";
      }
    }
    const place = selectedState ? selectedState.name : "United States";
    $("subtitle").textContent = `${place} · ${config.year} (5-year estimate) · workforce · source: Census ACS PUMS via Data USA`;

    const { workers, wage } = config.measures;
    const [nationRows, industries, educationRows] = await Promise.all([
      fetchCube([selectedState ? config.levels.state : config.levels.nation], [workers, wage]),
      fetchCube([config.levels.industry], [workers, wage]),
      fetchCube([config.levels.education], [workers, wage]),
    ]);
    if (token !== loadToken) return; // the user picked another place while this was loading

    if (!nationRows.length || !industries.length) {
      setState("empty");
      return;
    }

    industryRows = industries;
    // Keep the focused industry when it exists in the new place; otherwise reset it.
    if (!industries.some((row) => row[config.levels.industry] === focusIndustry)) focusIndustry = "";
    renderStats(nationRows);
    renderEducation(educationRows);
    setupFocusSelect();
    setupTabs();
    renderIndustryChart();
    setState("data");
    renderGenderAge();
    renderRace();
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    const hint =
      location.protocol === "file:"
        ? "This page can't run by double-clicking the file. In a terminal, run `python3 -m http.server` in this folder, then visit http://localhost:8000."
        : messageFor(error);
    setState("error", hint);
  }
}

$("retry").addEventListener("click", () => {
  for (const key of Object.keys(demoRequests)) delete demoRequests[key];
  load();
});
load();
