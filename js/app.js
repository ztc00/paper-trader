// Paper Trader. Everything saved lives in `state`. Every change goes through a
// function that updates it, saves, and calls render().

const STORAGE_KEY = "paper-trader-v1";
const COINGECKO = "https://api.coingecko.com/api/v3";

const DEFAULT_RULES = { startingCash: 10000, maxTrades: 5, lossLimit: 500 };

let state = {
  cash: DEFAULT_RULES.startingCash,
  positions: [], // { id, name, symbol, units, avgPrice }
  trades: [],    // { id, time, coinId, symbol, side, units, price, dollars, realized }
  rules: { ...DEFAULT_RULES },
  selected: null, // the coin id, like "bitcoin"
};

// Fetched, not saved.
let prices = {};      // coin id -> { price, change24h, change7d }
let selectedCoin = null; // { id, name, symbol }
let lastPriceAt = null;
let mood = null;   // { value, label } from the Fear & Greed index
let news = [];     // [{ title, url, source, publishedAt }] for the selected coin
let newsFor = null; // which coin id the news is for
let tape = [];     // the top 10 coins by market cap, with 7-day sparklines
let liveAt = null; // when the last live tick arrived
let chart = { days: 7, points: [], forId: null }; // the price chart on screen
const chartCache = {}; // "bitcoin:7" -> { points, at }

// ---------- Save and load ----------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      state.cash = Number.isFinite(saved.cash) ? saved.cash : state.cash;
      state.positions = Array.isArray(saved.positions) ? saved.positions : [];
      state.trades = Array.isArray(saved.trades) ? saved.trades : [];
      state.rules = { ...DEFAULT_RULES, ...saved.rules };
      state.selected = saved.selected || null;
      selectedCoin = saved.selectedCoin || null;
    }
  } catch {
    // Broken or blocked storage: start from the defaults.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, selectedCoin }));
  } catch {
    // Storage blocked. The page still works until a refresh.
  }
}

// ---------- Formatting ----------

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(n) {
  return money.format(n);
}

function fmtSigned(n) {
  return (n > 0 ? "+" : "") + money.format(n);
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtUnits(n) {
  return n >= 1 ? n.toFixed(4) : n.toPrecision(4);
}

function upDown(n) {
  return n > 0 ? "up" : n < 0 ? "down" : "";
}

// ---------- Elements ----------

const $ = (id) => document.getElementById(id);

const els = {
  total: $("portfolio-total"),
  pnl: $("portfolio-pnl"),
  searchForm: $("search-form"),
  searchInput: $("search-input"),
  searchBtn: $("search-btn"),
  searchMsg: $("search-msg"),
  results: $("search-results"),
  coinEmpty: $("coin-empty"),
  coinLoading: $("coin-loading"),
  coinError: $("coin-error"),
  coinErrorText: $("coin-error-text"),
  coinRetry: $("coin-retry"),
  coinBody: $("coin-body"),
  coinName: $("coin-name"),
  coinSymbol: $("coin-symbol"),
  coinPrice: $("coin-price"),
  coinChange: $("coin-change"),
  coinUpdated: $("coin-updated"),
  buyForm: $("buy-form"),
  buyAmount: $("buy-amount"),
  buyBtn: $("buy-btn"),
  buyMsg: $("buy-msg"),
  sellForm: $("sell-form"),
  sellAmount: $("sell-amount"),
  sellBtn: $("sell-btn"),
  sellAllBtn: $("sell-all-btn"),
  sellMsg: $("sell-msg"),
  tradeNote: $("trade-note"),
  cash: $("cash"),
  positionsEmpty: $("positions-empty"),
  positionsTable: $("positions-table"),
  positionsBody: $("positions-body"),
  positionsValue: $("positions-value"),
  positionsPnl: $("positions-pnl"),
  tradesEmpty: $("trades-empty"),
  tradesTable: $("trades-table"),
  tradesBody: $("trades-body"),
  rulesBox: $("rules-box"),
  rulesSummary: $("rules-summary"),
  rulesForm: $("rules-form"),
  ruleCash: $("rule-cash"),
  ruleTrades: $("rule-trades"),
  ruleLoss: $("rule-loss"),
  startOver: $("start-over"),
  moodLoading: $("mood-loading"),
  moodError: $("mood-error"),
  moodErrorText: $("mood-error-text"),
  moodRetry: $("mood-retry"),
  moodBody: $("mood-body"),
  fngValue: $("fng-value"),
  fngLabel: $("fng-label"),
  newsEmpty: $("news-empty"),
  newsLoading: $("news-loading"),
  newsError: $("news-error"),
  newsErrorText: $("news-error-text"),
  newsRetry: $("news-retry"),
  newsList: $("news-list"),
  headlineScore: $("headline-score"),
  headlineLabel: $("headline-label"),
  tape: $("tape"),
  chart: $("chart"),
  chartStatus: $("chart-status"),
  ranges: document.querySelectorAll(".range"),
};

function show(el, on) {
  el.hidden = !on;
}

// Text from an API goes in through textContent, never innerHTML.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function row(cells) {
  const tr = document.createElement("tr");
  for (const c of cells) tr.appendChild(Array.isArray(c) ? el("td", c[0], c[1]) : el("td", c));
  return tr;
}

// ---------- Fetching from CoinGecko ----------

// One request for the selected coin and every coin I hold.
async function fetchPrices() {
  const ids = new Set(state.positions.map((p) => p.id));
  if (state.selected) ids.add(state.selected);
  if (ids.size === 0) return;

  const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${[...ids].join(",")}&price_change_percentage=24h,7d`;
  const firstTime = !prices[state.selected];
  if (firstTime) setCoinView("loading");

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
    const data = await response.json();
    const before = prices[state.selected] ? prices[state.selected].price : null;
    for (const c of data) {
      prices[c.id] = {
        price: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
      };
    }
    lastPriceAt = new Date();
    render();
    flashPrice(before);
  } catch (err) {
    if (firstTime) {
      setCoinView("error", "Could not reach CoinGecko. Check your connection and retry.");
    } else {
      // Keep the last prices and say so.
      els.coinUpdated.textContent = `Could not refresh. Last price ${timeAgo(lastPriceAt)}.`;
    }
  }
}

// The top 10 coins by market cap, with their last 7 days, for the tape.
async function fetchTape() {
  try {
    const response = await fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true&price_change_percentage=24h,7d`);
    if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
    const data = await response.json();
    tape = data.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      spark: c.sparkline_in_7d ? c.sparkline_in_7d.price : [],
    }));
    for (const c of data) {
      const known = prices[c.id];
      prices[c.id] = {
        // A live tick is fresher than this poll, so keep it.
        price: known && liveHas(c.symbol) ? known.price : c.current_price,
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
      };
    }
    renderTape();
    watchLive();
  } catch (err) {
    if (tape.length === 0) {
      els.tape.replaceChildren(el("li", "Could not load the top coins.", "muted"));
    }
  }
}

// Price history for the chart. Cached for five minutes per coin and range.
async function fetchChart() {
  if (!state.selected) return;
  const id = state.selected;
  const key = `${id}:${chart.days}`;
  const cached = chartCache[key];
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
    chart = { days: chart.days, points: cached.points, forId: id };
    renderChart();
    return;
  }
  els.chartStatus.textContent = "Loading…";
  try {
    const response = await fetch(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${chart.days}`);
    if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
    const data = await response.json();
    chartCache[key] = { points: data.prices, at: Date.now() };
    if (state.selected !== id) return; // the user moved on while this loaded
    chart = { days: chart.days, points: data.prices, forId: id };
    els.chartStatus.textContent = "";
    renderChart();
  } catch (err) {
    els.chartStatus.textContent = "Chart is not available right now.";
  }
}

// Every coin on screen, by symbol, so a live tick can find it.
function coinsBySymbol() {
  const map = {};
  for (const c of tape) map[c.symbol] = c.id;
  for (const p of state.positions) map[p.symbol] = p.id;
  if (selectedCoin) map[selectedCoin.symbol] = selectedCoin.id;
  return map;
}

function watchLive() {
  liveWatch(Object.keys(coinsBySymbol()));
}

// A live tick from Coinbase. Updates the price in memory, then redraws the
// parts that show it, at most five times a second.
let tickTimer = null;
function applyTick(symbol, price) {
  const id = coinsBySymbol()[symbol];
  if (!id || !prices[id]) return;
  const before = prices[id].price;
  prices[id].price = price;
  prices[id].liveBefore = before;
  liveAt = new Date();
  if (tickTimer) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    const sel = prices[state.selected];
    const was = sel ? sel.liveBefore : null;
    renderCoin();
    renderPortfolio();
    renderTape();
    renderChart();
    checkOrders();
    if (sel && was != null && was !== sel.price) flashPrice(was);
    if (sel) sel.liveBefore = sel.price;
  }, 200);
}

function liveStatusChanged() {
  renderCoin();
  renderTape();
}

async function searchCoins(query) {
  els.searchBtn.disabled = true;
  els.results.innerHTML = "";
  els.searchMsg.textContent = "Searching…";
  els.searchMsg.classList.add("muted");
  try {
    const response = await fetch(`${COINGECKO}/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
    const data = await response.json();
    const matches = data.coins.slice(0, 5);
    els.searchMsg.textContent = matches.length ? "" : "No coin called that. Try the full name.";
    renderResults(matches);
  } catch (err) {
    els.searchMsg.textContent = "Could not reach CoinGecko. Check your connection and retry.";
  } finally {
    els.searchMsg.classList.remove("muted");
    els.searchBtn.disabled = false;
  }
}

function renderResults(matches) {
  els.results.innerHTML = "";
  for (const c of matches) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "result";
    btn.dataset.id = c.id;
    btn.dataset.name = c.name;
    btn.dataset.symbol = c.symbol.toUpperCase();
    const rank = Number.isInteger(c.market_cap_rank) ? ` · #${c.market_cap_rank}` : "";
    btn.appendChild(el("span", c.name));
    btn.appendChild(el("span", c.symbol.toUpperCase() + rank, "meta fig"));
    li.appendChild(btn);
    els.results.appendChild(li);
  }
}

function selectCoin(coin) {
  selectedCoin = coin;
  state.selected = coin.id;
  save();
  els.results.innerHTML = "";
  els.searchInput.value = "";
  render();
  fetchPrices();
  fetchNews();
  fetchChart();
  watchLive();
}

// ---------- Mood: the Crypto Fear & Greed Index ----------

async function fetchMood() {
  show(els.moodLoading, true);
  show(els.moodError, false);
  show(els.moodBody, false);
  try {
    const response = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!response.ok) throw new Error(`alternative.me answered ${response.status}`);
    const data = await response.json();
    const today = data.data[0];
    mood = { value: Number(today.value), label: today.value_classification };
    show(els.moodLoading, false);
    show(els.moodBody, true);
    render();
  } catch (err) {
    show(els.moodLoading, false);
    show(els.moodError, true);
    els.moodErrorText.textContent = "Mood is not available right now.";
  }
}

// ---------- News, through my own function ----------

function setNewsView(which, message) {
  show(els.newsEmpty, which === "empty");
  show(els.newsLoading, which === "loading");
  show(els.newsError, which === "error");
  show(els.newsList, which === "list");
  if (message) els.newsErrorText.textContent = message;
}

async function fetchNews() {
  if (!selectedCoin) {
    setNewsView("empty");
    return;
  }
  const coin = selectedCoin;
  setNewsView("loading");
  try {
    const response = await fetch(`/api/news?q=${encodeURIComponent(coin.name)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `The news function answered ${response.status}`);
    }
    news = data.articles;
    newsFor = coin.id;
    setNewsView("list");
    render();
  } catch (err) {
    news = [];
    newsFor = null;
    setNewsView("error", err.message === "News is not set up yet." ? err.message : "News is not available right now.");
    render();
  }
}

// ---------- Headline sentiment: my own word lists ----------

const POSITIVE = ["surge", "surges", "soar", "soars", "rally", "rallies", "record", "high", "highs",
  "gain", "gains", "jump", "jumps", "climb", "climbs", "bullish", "approval", "approves", "approved",
  "adoption", "launch", "launches", "upgrade", "inflow", "inflows", "breakout", "recover", "recovers",
  "recovery", "boost", "boosts", "rise", "rises", "rising", "buy", "buys", "buying", "milestone"];
const NEGATIVE = ["crash", "crashes", "plunge", "plunges", "drop", "drops", "fall", "falls", "slump",
  "slumps", "hack", "hacked", "exploit", "ban", "bans", "banned", "lawsuit", "sues", "sued", "fraud",
  "scam", "outflow", "outflows", "bearish", "fear", "selloff", "sell-off", "liquidation", "liquidations",
  "dump", "dumps", "warning", "warns", "probe", "collapse", "collapses", "loss", "losses", "tumble",
  "tumbles", "sink", "sinks", "slide", "slides", "crackdown", "risk", "risks"];

// +1 if a headline has a positive word and no negative one, -1 the other way
// round, 0 if it has both or neither.
function scoreHeadline(title) {
  const words = title.toLowerCase().split(/[^a-z-]+/);
  const pos = words.some((w) => POSITIVE.includes(w));
  const neg = words.some((w) => NEGATIVE.includes(w));
  if (pos && !neg) return 1;
  if (neg && !pos) return -1;
  return 0;
}

function headlineMood() {
  if (news.length === 0) return null;
  const sum = news.reduce((total, a) => total + scoreHeadline(a.title), 0);
  const label = sum >= 2 ? "positive" : sum <= -2 ? "negative" : "mixed";
  return { sum, label };
}

// ---------- Trading ----------

function checkOrders() {
  // Pending orders are checked here on every price update.
}

function readAmount(input, msgEl) {
  const raw = input.value.trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n <= 0) {
    msgEl.textContent = "Enter a dollar amount above 0, like 250.";
    input.classList.add("invalid");
    return null;
  }
  msgEl.textContent = "";
  input.classList.remove("invalid");
  return n;
}

function positionFor(id) {
  return state.positions.find((p) => p.id === id) || null;
}

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// Why the rules block right now, or null if they do not.
function blockReason() {
  const today = state.trades.filter((t) => isToday(t.time));
  if (today.length >= state.rules.maxTrades) {
    return `${today.length} of ${state.rules.maxTrades} trades today. Back tomorrow.`;
  }
  const realized = today.reduce((sum, t) => sum + (t.realized || 0), 0);
  if (realized <= -state.rules.lossLimit) {
    return `Daily loss limit reached (${fmtSigned(realized)} realized). Back tomorrow.`;
  }
  return null;
}

function logTrade(side, units, price, dollars, realized) {
  state.trades.unshift({
    id: Date.now(),
    time: new Date().toISOString(),
    coinId: selectedCoin.id,
    symbol: selectedCoin.symbol,
    side,
    units,
    price,
    dollars,
    realized,
  });
}

function buy(dollars) {
  const price = prices[state.selected].price;
  const units = dollars / price;
  const pos = positionFor(state.selected);
  if (pos) {
    // New average price: total paid so far plus this buy, over total units.
    pos.avgPrice = (pos.avgPrice * pos.units + dollars) / (pos.units + units);
    pos.units += units;
  } else {
    state.positions.push({ ...selectedCoin, units, avgPrice: price });
  }
  state.cash -= dollars;
  logTrade("Buy", units, price, dollars, null);
  save();
  render();
}

function sell(dollars) {
  const price = prices[state.selected].price;
  const pos = positionFor(state.selected);
  const units = Math.min(dollars / price, pos.units);
  const got = units * price;
  const realized = (price - pos.avgPrice) * units;
  pos.units -= units;
  if (pos.units * price < 0.01) {
    state.positions = state.positions.filter((p) => p !== pos);
  }
  state.cash += got;
  logTrade("Sell", units, price, got, realized);
  save();
  render();
}

function startOver() {
  state.cash = state.rules.startingCash;
  state.positions = [];
  state.trades = [];
  save();
  render();
  fetchPrices();
  fetchNews();
}

// ---------- Rendering ----------

function setCoinView(which, message) {
  show(els.coinEmpty, which === "empty");
  show(els.coinLoading, which === "loading");
  show(els.coinError, which === "error");
  show(els.coinBody, which === "body");
  if (message) els.coinErrorText.textContent = message;
}

// The price flashes green or red for 300ms when a refresh moved it.
function flashPrice(before) {
  const now = prices[state.selected] ? prices[state.selected].price : null;
  if (before == null || now == null || now === before) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cls = now > before ? "flash-up" : "flash-down";
  els.coinPrice.classList.add(cls);
  setTimeout(() => els.coinPrice.classList.remove(cls), 300);
}

function timeAgo(date) {
  if (!date) return "";
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function renderCoin() {
  if (!state.selected) {
    setCoinView("empty");
    return;
  }
  const p = prices[state.selected];
  if (!p) return; // loading or error view is already up
  setCoinView("body");
  els.coinName.textContent = selectedCoin.name;
  els.coinSymbol.textContent = selectedCoin.symbol;
  els.coinPrice.textContent = fmtMoney(p.price);
  els.coinChange.textContent = `24h ${fmtPct(p.change24h)} · 7d ${fmtPct(p.change7d)}`;
  renderUpdated();
}

// "Live · Coinbase" with a green dot when ticks are coming in for this coin,
// otherwise when CoinGecko last answered.
function renderUpdated() {
  if (!selectedCoin || !prices[state.selected]) return;
  els.coinUpdated.replaceChildren();
  if (liveHas(selectedCoin.symbol) && liveAt && Date.now() - liveAt.getTime() < 90 * 1000) {
    els.coinUpdated.appendChild(el("span", "", "live-dot"));
    els.coinUpdated.appendChild(document.createTextNode(`Live · Coinbase · ${timeAgo(liveAt)}`));
  } else {
    els.coinUpdated.textContent = `Updated ${timeAgo(lastPriceAt)} · CoinGecko`;
  }
}

function renderTape() {
  if (tape.length === 0) return;
  els.tape.replaceChildren();
  for (const c of tape) {
    const q = prices[c.id];
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tape-item" + (c.id === state.selected ? " active" : "");
    btn.dataset.id = c.id;
    btn.dataset.name = c.name;
    btn.dataset.symbol = c.symbol;
    btn.title = c.name;
    btn.appendChild(el("span", c.symbol, "sym"));
    btn.appendChild(el("span", q ? fmtMoney(q.price) : "—", "fig"));
    btn.appendChild(el("span", q ? fmtPct(q.change24h) : "", "fig " + (q ? upDown(q.change24h) : "")));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    btn.appendChild(svg);
    drawSparkline(svg, c.spark);
    li.appendChild(btn);
    els.tape.appendChild(li);
  }
}

function renderChart() {
  if (!state.selected || chart.forId !== state.selected || chart.points.length < 2) {
    if (state.selected && chart.forId !== state.selected) els.chart.replaceChildren();
    return;
  }
  const points = chart.points.slice();
  const q = prices[state.selected];
  if (q) points.push([Date.now(), q.price]); // the live price is the last point
  const markers = state.trades
    .filter((t) => t.coinId === state.selected)
    .map((t) => ({ t: new Date(t.time).getTime(), price: t.price, side: t.side }));
  const days = chart.days;
  const fmtTime = (t) => {
    const d = new Date(t);
    if (days <= 1) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (days <= 30) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };
  drawLineChart(els.chart, points, {
    markers,
    fmt: (v) => fmtMoney(v),
    fmtTime,
    fmtHover: (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
}

function renderTrade() {
  const ready = Boolean(state.selected && prices[state.selected]);
  const reason = blockReason();
  const pos = state.selected ? positionFor(state.selected) : null;
  els.buyAmount.disabled = !ready || Boolean(reason);
  els.buyBtn.disabled = !ready || Boolean(reason);
  els.sellAmount.disabled = !ready || Boolean(reason) || !pos;
  els.sellBtn.disabled = !ready || Boolean(reason) || !pos;
  els.sellAllBtn.disabled = !ready || Boolean(reason) || !pos;
  if (reason) {
    els.tradeNote.textContent = reason;
    els.tradeNote.className = "note block";
  } else {
    const warning = ready ? moodWarning() : "";
    els.tradeNote.textContent = warning;
    els.tradeNote.className = warning ? "note warn" : "note";
  }
}

function positionValue(p) {
  const q = prices[p.id];
  return q ? p.units * q.price : p.units * p.avgPrice;
}

function renderPortfolio() {
  els.cash.textContent = fmtMoney(state.cash);
  const any = state.positions.length > 0;
  show(els.positionsEmpty, !any);
  show(els.positionsTable, any);
  els.positionsBody.innerHTML = "";
  let value = 0;
  let pnl = 0;
  for (const p of state.positions) {
    const q = prices[p.id];
    const price = q ? q.price : p.avgPrice;
    const v = p.units * price;
    const gain = v - p.units * p.avgPrice;
    const pct = (gain / (p.units * p.avgPrice)) * 100;
    value += v;
    pnl += gain;
    els.positionsBody.appendChild(row([
      p.symbol, fmtUnits(p.units), fmtMoney(p.avgPrice), q ? fmtMoney(price) : "—", fmtMoney(v),
      [`${fmtSigned(gain)} (${fmtPct(pct)})`, upDown(gain)],
    ]));
  }
  els.positionsValue.textContent = fmtMoney(value);
  els.positionsPnl.textContent = fmtSigned(pnl);
  els.positionsPnl.className = "fig " + upDown(pnl);

  // Header: everything I own plus cash, against what I started with.
  const total = state.cash + value;
  const since = total - state.rules.startingCash;
  const sincePct = (since / state.rules.startingCash) * 100;
  els.total.textContent = fmtMoney(total);
  els.pnl.textContent = `${fmtSigned(since)} (${fmtPct(sincePct)})`;
  els.pnl.className = "pnl fig " + upDown(since);
}

function renderTrades() {
  const any = state.trades.length > 0;
  show(els.tradesEmpty, !any);
  show(els.tradesTable, any);
  els.tradesBody.innerHTML = "";
  for (const t of state.trades) {
    const when = new Date(t.time);
    const time = when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    els.tradesBody.appendChild(row([
      time, [t.side, t.side === "Buy" ? "up" : "down"], t.symbol, fmtUnits(t.units), fmtMoney(t.price), fmtMoney(t.dollars),
      t.realized == null ? "" : [fmtSigned(t.realized), upDown(t.realized)],
    ]));
  }
}

function renderMood() {
  if (!mood) return;
  els.fngValue.textContent = mood.value;
  els.fngLabel.textContent = mood.label;
  els.fngValue.className = "mood-number fig " + (mood.value <= 25 ? "down" : mood.value >= 75 ? "up" : "");
}

// The amber line under the Buy button. A warning never blocks.
function moodWarning() {
  const parts = [];
  if (mood && mood.value <= 25) parts.push(`Market is in ${mood.label} (${mood.value}).`);
  const h = headlineMood();
  if (h && h.label === "negative") parts.push(`The news reads negative (${h.sum}).`);
  return parts.join(" ");
}

function renderNews() {
  const h = headlineMood();
  els.headlineScore.textContent = h ? (h.sum > 0 ? "+" + h.sum : String(h.sum)) : "—";
  els.headlineLabel.textContent = h ? h.label : "";
  els.headlineScore.className = "fig " + (h ? (h.label === "positive" ? "up" : h.label === "negative" ? "down" : "") : "");

  if (!newsFor) return; // empty, loading or error view is already up
  els.newsList.innerHTML = "";
  if (news.length === 0) {
    els.newsList.appendChild(el("li", "No recent news about this coin.", "muted"));
    return;
  }
  for (const a of news) {
    const li = document.createElement("li");
    const link = el("a", a.title);
    if (/^https?:\/\//.test(a.url)) link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const score = scoreHeadline(a.title);
    const mark = score > 0 ? " · +1" : score < 0 ? " · −1" : " · 0";
    li.appendChild(link);
    li.appendChild(el("span", `${a.source || "Unknown source"} · ${timeAgo(new Date(a.publishedAt))}${mark}`, "muted"));
    els.newsList.appendChild(li);
  }
}

function renderRules() {
  const r = state.rules;
  els.rulesSummary.textContent = `${fmtMoney(r.startingCash).replace(".00", "")} to start, ${r.maxTrades} trades a day, ${fmtMoney(r.lossLimit).replace(".00", "")} daily loss limit.`;
  if (!els.rulesBox.open) {
    els.ruleCash.value = r.startingCash;
    els.ruleTrades.value = r.maxTrades;
    els.ruleLoss.value = r.lossLimit;
  }
}

function render() {
  renderCoin();
  renderTrade();
  renderPortfolio();
  renderTrades();
  renderMood();
  renderNews();
  renderRules();
  renderTape();
  renderChart();
}

// ---------- Events ----------

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.searchInput.value.trim();
  if (!q) {
    els.searchMsg.textContent = "Type a coin name.";
    return;
  }
  searchCoins(q);
});

els.results.addEventListener("click", (e) => {
  const btn = e.target.closest(".result");
  if (!btn) return;
  selectCoin({ id: btn.dataset.id, name: btn.dataset.name, symbol: btn.dataset.symbol });
});

els.coinRetry.addEventListener("click", fetchPrices);

els.tape.addEventListener("click", (e) => {
  const btn = e.target.closest(".tape-item");
  if (!btn) return;
  selectCoin({ id: btn.dataset.id, name: btn.dataset.name, symbol: btn.dataset.symbol });
});

for (const btn of els.ranges) {
  btn.addEventListener("click", () => {
    chart.days = Number(btn.dataset.days);
    for (const b of els.ranges) b.classList.toggle("active", b === btn);
    fetchChart();
  });
}

els.buyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const dollars = readAmount(els.buyAmount, els.buyMsg);
  if (dollars == null) return;
  if (dollars > state.cash) {
    els.buyMsg.textContent = `You have ${fmtMoney(state.cash)} in cash.`;
    els.buyAmount.classList.add("invalid");
    return;
  }
  buy(dollars);
  els.buyAmount.value = "";
});

els.sellForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pos = positionFor(state.selected);
  if (!pos) {
    els.sellMsg.textContent = `You do not hold any ${selectedCoin.symbol}.`;
    return;
  }
  const dollars = readAmount(els.sellAmount, els.sellMsg);
  if (dollars == null) return;
  const worth = positionValue(pos);
  if (dollars > worth + 0.005) {
    els.sellMsg.textContent = `You hold ${fmtMoney(worth)} of ${pos.symbol}.`;
    els.sellAmount.classList.add("invalid");
    return;
  }
  sell(dollars);
  els.sellAmount.value = "";
});

els.sellAllBtn.addEventListener("click", () => {
  const pos = positionFor(state.selected);
  if (!pos) return;
  els.sellMsg.textContent = "";
  els.sellAmount.classList.remove("invalid");
  sell(positionValue(pos));
  els.sellAmount.value = "";
});

const RULE_FIELDS = [
  ["startingCash", els.ruleCash, $("rule-cash-msg")],
  ["maxTrades", els.ruleTrades, $("rule-trades-msg")],
  ["lossLimit", els.ruleLoss, $("rule-loss-msg")],
];

els.rulesForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const next = {};
  let ok = true;
  for (const [key, input, msg] of RULE_FIELDS) {
    const n = Number(input.value.trim());
    if (input.value.trim() === "" || !Number.isInteger(n) || n <= 0) {
      msg.textContent = "Use a whole number above 0.";
      input.classList.add("invalid");
      ok = false;
    } else {
      msg.textContent = "";
      input.classList.remove("invalid");
      next[key] = n;
    }
  }
  if (!ok) return;
  // Changing the starting cash moves the cash by the same amount, so a
  // portfolio in progress is not wiped.
  state.cash += next.startingCash - state.rules.startingCash;
  state.rules = next;
  save();
  els.rulesBox.open = false;
  render();
});

els.rulesBox.addEventListener("toggle", () => {
  els.rulesBox.querySelector(".summary-action").textContent = els.rulesBox.open ? "Close" : "Edit";
});

els.startOver.addEventListener("click", startOver);
els.moodRetry.addEventListener("click", fetchMood);
els.newsRetry.addEventListener("click", fetchNews);

// ---------- Start ----------

load();
render();
fetchPrices();
fetchTape();
fetchMood();
fetchNews();
fetchChart();
watchLive();
setInterval(fetchPrices, 60 * 1000);
setInterval(fetchTape, 60 * 1000);
setInterval(renderUpdated, 1000);
