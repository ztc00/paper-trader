// The desk, index.html. The saved state, formatting and helpers come from
// js/shared.js; the charts from js/charts.js; live ticks from js/live.js.
// Every change goes through a function that updates `state`, saves, and
// calls render().

// Fetched, not saved.
let lastPriceAt = null;
let mood = null;   // { value, label } from the Fear & Greed index
let news = [];     // [{ title, url, source, publishedAt }] for the selected coin
let newsFor = null; // which id the news is for
let brief = null;   // { text, sentiment, model } the model's read of the news, or null
let tape = [];     // the tape on screen: top 10 coins with sparklines, or the ten stocks
let liveAt = null; // when the last live tick arrived
let chart = { days: 7, points: [], forId: null }; // the price chart on screen
const chartCache = {}; // "bitcoin:7" -> { points, at }

// ---------- Elements ----------

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
  starBtn: $("star-btn"),
  bpLine: $("bp-line"),
  ticket: $("ticket"),
  sideBuy: $("side-buy"),
  sideSell: $("side-sell"),
  tType: $("t-type"),
  tTif: $("t-tif"),
  modeUnits: $("mode-units"),
  modeDollars: $("mode-dollars"),
  tQty: $("t-qty"),
  tQtyMsg: $("t-qty-msg"),
  presets: document.querySelectorAll(".presets button"),
  sizer: $("sizer"),
  fLimit: $("f-limit"), tLimit: $("t-limit"), tLimitMsg: $("t-limit-msg"),
  fStop: $("f-stop"), tStop: $("t-stop"), tStopMsg: $("t-stop-msg"),
  fTrail: $("f-trail"), tTrail: $("t-trail"), tTrailMsg: $("t-trail-msg"),
  estPriceLabel: $("est-price-label"), estPrice: $("est-price"),
  estTotalLabel: $("est-total-label"), estTotal: $("est-total"),
  estFee: $("est-fee"), estBp: $("est-bp"),
  tradeNote: $("trade-note"),
  tReview: $("t-review"),
  review: $("review"), reviewText: $("review-text"), tConfirm: $("t-confirm"), tEdit: $("t-edit"),
  ordersEmpty: $("orders-empty"),
  ordersList: $("orders-list"),
  historyCount: $("history-count"), historyEmpty: $("history-empty"), historyTable: $("history-table"), historyBody: $("history-body"),
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
  ruleRisk: $("rule-risk"),
  ruleStop: $("rule-stop"),
  ruleFee: $("rule-fee"),
  ruleSlip: $("rule-slip"),
  startOver: $("start-over"),
  moodLoading: $("mood-loading"),
  moodError: $("mood-error"),
  moodErrorText: $("mood-error-text"),
  moodRetry: $("mood-retry"),
  moodBody: $("mood-body"),
  fngValue: $("fng-value"),
  fngLabel: $("fng-label"),
  moodSource: $("mood-source"),
  newsEmpty: $("news-empty"),
  newsLoading: $("news-loading"),
  newsError: $("news-error"),
  newsErrorText: $("news-error-text"),
  newsRetry: $("news-retry"),
  newsList: $("news-list"),
  headlineScore: $("headline-score"),
  headlineLabel: $("headline-label"),
  brief: $("brief"),
  briefText: $("brief-text"),
  briefSentiment: $("brief-sentiment"),
  briefCompare: $("brief-compare"),
  tape: $("tape"),
  tapeTabs: document.querySelectorAll(".tape-tabs .seg-btn"),
  chart: $("chart"),
  chartStatus: $("chart-status"),
  ranges: document.querySelectorAll(".range"),
  equity: $("equity"),
  stats: $("stats"),
  exportBtn: $("export-btn"),
  marketBtns: document.querySelectorAll(".market-btn"),
};

// The ticket's own state. Nothing here is saved.
const ticket = { side: "Buy", mode: "units", reviewing: false };
let tapeView = "top"; // "top" or "watch"

// ---------- Fetching prices ----------

// Everything on screen that needs a price: the selected one and every position.
function wantedIds() {
  const ids = new Set(state.positions.map((p) => p.id));
  for (const o of state.orders) ids.add(o.coinId);
  for (const w of state.watchlist) ids.add(w.id);
  if (state.selected) ids.add(state.selected);
  return [...ids];
}

function fetchPrices() {
  fetchCryptoPrices();
  fetchStockPrices();
}

// CoinGecko's free tier allows about 30 calls a minute from one address.
// A 429 means wait, not that the connection is down.
function geckoError(response) {
  return new Error(response.status === 429
    ? "CoinGecko is rate-limiting right now. Try again in a minute."
    : `CoinGecko answered ${response.status}`);
}

function geckoMessage(err) {
  return /rate-limiting/.test(err.message) ? err.message : "Could not reach CoinGecko. Check your connection and retry.";
}

// After any batch of prices lands: equity point, redraw, flash, orders.
function pricesLanded(before) {
  lastPriceAt = new Date();
  recordEquity(false);
  render();
  flashPrice(before);
  checkOrders();
}

function priceFailed(firstTime, message) {
  if (firstTime) {
    setCoinView("error", message);
  } else {
    // Keep the last prices and say so.
    els.coinUpdated.textContent = `Could not refresh. Last price ${timeAgo(lastPriceAt)}.`;
  }
}

// One CoinGecko request for every coin on screen.
async function fetchCryptoPrices() {
  const ids = wantedIds().filter((id) => !isStock(id));
  if (ids.length === 0) return;
  const selectedHere = state.selected && !isStock(state.selected);
  const firstTime = selectedHere && !prices[state.selected];
  if (firstTime) setCoinView("loading");
  try {
    const response = await fetch(`${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=24h,7d`);
    if (!response.ok) throw geckoError(response);
    const data = await response.json();
    const before = selectedHere && prices[state.selected] ? prices[state.selected].price : null;
    for (const c of data) {
      prices[c.id] = {
        price: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
      };
    }
    pricesLanded(before);
  } catch (err) {
    if (selectedHere) priceFailed(firstTime, geckoMessage(err));
  }
}

// One request to my stocks function for every stock on screen. It polls
// Finnhub, so this runs every 15 seconds instead of live.
async function fetchStockPrices(extraSymbols = []) {
  const symbols = new Set(wantedIds().filter(isStock).map(stockSymbol).concat(extraSymbols));
  if (symbols.size === 0) return;
  const selectedHere = state.selected && isStock(state.selected);
  const firstTime = selectedHere && !prices[state.selected];
  if (firstTime) setCoinView("loading");
  try {
    const response = await fetch(`/api/stocks?op=quote&symbols=${encodeURIComponent([...symbols].sort().join(","))}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `The stocks function answered ${response.status}`);
    const before = selectedHere && prices[state.selected] ? prices[state.selected].price : null;
    for (const [sym, q] of Object.entries(data.quotes)) {
      prices[`stock:${sym}`] = { price: q.price, change24h: q.changePct, change7d: null, prevClose: q.prevClose, at: q.at };
    }
    if (selectedHere && !prices[state.selected]) throw new Error("Finnhub has no price for that symbol.");
    pricesLanded(before);
  } catch (err) {
    if (selectedHere) priceFailed(firstTime, /not set up/.test(err.message) ? err.message : "Could not get stock prices right now.");
  }
}

// The tape: the top 10 coins by market cap with their last 7 days, or the
// ten stocks in STOCK_TAPE with today's move.
async function fetchTape() {
  if (state.market === "stocks") {
    tape = STOCK_TAPE.map(([symbol, name]) => ({ id: `stock:${symbol}`, name, symbol, spark: [] }));
    await fetchStockPrices(STOCK_TAPE.map(([symbol]) => symbol));
    renderTape();
    renderMood();
    return;
  }
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
      els.tape.replaceChildren(el("li", "Could not load the tape.", "muted"));
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
    let points;
    if (isStock(id)) {
      const response = await fetch(`/api/stocks?op=chart&symbol=${encodeURIComponent(stockSymbol(id))}&days=${chart.days}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The stocks function answered ${response.status}`);
      points = data.points;
    } else {
      const response = await fetch(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${chart.days}`);
      if (!response.ok) throw geckoError(response);
      points = (await response.json()).prices;
    }
    chartCache[key] = { points, at: Date.now() };
    if (state.selected !== id) return; // the user moved on while this loaded
    chart = { days: chart.days, points, forId: id };
    els.chartStatus.textContent = "";
    renderChart();
  } catch (err) {
    els.chartStatus.textContent = /not set up|rate-limiting/.test(err.message) ? err.message : "Chart is not available right now.";
  }
}

// Every coin on screen, by symbol, so a live tick can find it.
function coinsBySymbol() {
  const map = {};
  for (const c of tape) if (!isStock(c.id)) map[c.symbol] = c.id;
  for (const w of state.watchlist) if (!isStock(w.id)) map[w.symbol] = w.id;
  for (const p of state.positions) if (!isStock(p.id)) map[p.symbol] = p.id;
  if (selectedCoin && !isStock(selectedCoin.id)) map[selectedCoin.symbol] = selectedCoin.id;
  return map;
}

function watchLive() {
  liveWatch(Object.keys(coinsBySymbol()));
}

// A live tick from Coinbase. Updates the price in memory, then redraws the
// parts that show it, at most five times a second.
let tickTimer = null;
function applyTick(symbol, price, bid, ask) {
  const id = coinsBySymbol()[symbol];
  if (!id || !prices[id]) return;
  const before = prices[id].price;
  prices[id].price = price;
  if (bid > 0 && ask > 0) { prices[id].bid = bid; prices[id].ask = ask; }
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
    renderTicket();
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
    let matches;
    if (state.market === "stocks") {
      const response = await fetch(`/api/stocks?op=search&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The stocks function answered ${response.status}`);
      matches = data.matches.map((m) => ({ id: `stock:${m.symbol}`, name: m.name, symbol: m.symbol, meta: m.type }));
      els.searchMsg.textContent = matches.length ? "" : "No US stock or ETF called that. Try the ticker.";
    } else {
      const response = await fetch(`${COINGECKO}/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw geckoError(response);
      const data = await response.json();
      matches = data.coins.slice(0, 5).map((c) => ({
        id: c.id, name: c.name, symbol: c.symbol.toUpperCase(),
        meta: Number.isInteger(c.market_cap_rank) ? `#${c.market_cap_rank}` : "",
      }));
      els.searchMsg.textContent = matches.length ? "" : "No coin called that. Try the full name.";
    }
    renderResults(matches);
  } catch (err) {
    els.searchMsg.textContent = /not set up|rate-limiting/.test(err.message) ? err.message : "Could not search right now. Check your connection and retry.";
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
    btn.dataset.symbol = c.symbol;
    btn.appendChild(el("span", c.name));
    btn.appendChild(el("span", c.symbol + (c.meta ? ` · ${c.meta}` : ""), "meta fig"));
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
    const url = isStock(coin.id)
      ? `/api/stocks?op=news&symbol=${encodeURIComponent(coin.symbol)}`
      : `/api/news?q=${encodeURIComponent(coin.name)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `The news function answered ${response.status}`);
    }
    news = data.articles;
    brief = data.brief || null;
    newsFor = coin.id;
    setNewsView("list");
    render();
  } catch (err) {
    news = [];
    brief = null;
    newsFor = null;
    setNewsView("error", /not set up/.test(err.message) ? err.message : "News is not available right now.");
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

const ORDER_NAMES = { market: "Market", limit: "Limit", stop: "Stop", "stop-limit": "Stop-limit", trailing: "Trailing stop" };

// Working orders, checked on every price update, live tick or poll. Each
// one either waits, fills at the price it earned, or leaves with a reason.
function checkOrders() {
  let changed = false;
  for (const o of state.orders.slice()) {
    const q = quoteFor(o.coinId);
    if (!q) continue;
    const coin = { id: o.coinId, name: o.name, symbol: o.symbol };
    const price = q.last;

    if (o.tif === "Day" && !isToday(o.created)) {
      closeOrder(o, "expired");
      toast(`${ORDER_NAMES[o.type]} ${o.side.toLowerCase()} ${o.symbol} expired at the end of its day.`, "warn");
      changed = true;
      continue;
    }
    if (o.side === "Sell" && !positionFor(o.coinId)) {
      closeOrder(o, "cancelled");
      toast(`${ORDER_NAMES[o.type]} sell ${o.symbol} cancelled: nothing left to sell.`, "warn");
      changed = true;
      continue;
    }

    // Trailing stops follow the high since they were placed.
    if (o.type === "trailing") {
      o.high = Math.max(o.high || price, price);
      if (price > o.high * (1 - o.trailPct / 100)) { changed = changed || false; continue; }
    } else if (o.type === "stop" || (o.type === "stop-limit" && !o.triggered)) {
      const hit = o.side === "Sell" ? price <= o.stopPrice : price >= o.stopPrice;
      if (!hit) continue;
      if (o.type === "stop-limit") { o.triggered = true; changed = true; }
    }
    if (o.type === "limit" || (o.type === "stop-limit" && o.triggered)) {
      const can = o.side === "Buy" ? q.ask <= o.limitPrice : q.bid >= o.limitPrice;
      if (!can) continue;
    }

    if (blockReason()) continue; // my rules hold the order until tomorrow

    const kind = o.type === "limit" || o.type === "stop-limit" ? "limit" : "market";
    const fill = fillPrice(o.coinId, o.side, kind, o.limitPrice);
    const units = o.qty != null ? o.qty : o.all ? (positionFor(o.coinId) || { units: 0 }).units : o.dollars / fill;
    if (o.side === "Buy") {
      if (units * fill + (state.rules.commission || 0) > state.cash + 0.005) continue; // not enough cash: it waits
      buyUnits(coin, units, fill, ORDER_NAMES[o.type]);
    } else {
      sellUnits(coin, units, fill, ORDER_NAMES[o.type]);
    }
    closeOrder(o, "filled", fill);
    toast(`${ORDER_NAMES[o.type]} ${o.side.toLowerCase()} filled: ${fmtUnits(units)} ${o.symbol} at ${fmtMoney(fill)}.`, o.side === "Buy" ? "" : "down");
    changed = true;
  }
  if (changed) {
    save();
    render();
    watchLive();
  }
}

function cancelOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  closeOrder(o, "cancelled");
  save();
  render();
}

// How big a position my rules suggest: risk a share of cash, with the stop a
// share of the position away. Position = risk dollars / stop share.
function suggestedSize() {
  const risk = state.cash * (state.rules.riskPct / 100);
  const size = risk / (state.rules.stopPct / 100);
  return Math.min(size, state.cash);
}

function readNumber(input, msgEl, message) {
  const raw = input.value.trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n <= 0) {
    msgEl.textContent = message;
    input.classList.add("invalid");
    return null;
  }
  msgEl.textContent = "";
  input.classList.remove("invalid");
  return n;
}

// What the ticket says right now, as an order, or null with the messages
// shown under the fields. `quiet` only computes, for the estimate.
function readTicket(quiet) {
  const id = state.selected;
  const q = quoteFor(id);
  if (!id || !q) return null;
  const type = els.tType.value;
  const side = ticket.side;
  const pos = positionFor(id);
  const msg = quiet ? { textContent: "" } : null;
  const say = (input, m, text) => { if (!quiet) { m.textContent = text; input.classList.add("invalid"); } };
  const clear = (input, m) => { if (!quiet) { m.textContent = ""; input.classList.remove("invalid"); } };

  const sizeRaw = Number(els.tQty.value.trim());
  if (els.tQty.value.trim() === "" || !Number.isFinite(sizeRaw) || sizeRaw <= 0) {
    say(els.tQty, els.tQtyMsg, "Enter a size above 0.");
    return null;
  }
  clear(els.tQty, els.tQtyMsg);

  let limitPrice = null, stopPrice = null, trailPct = null;
  if (type === "limit" || type === "stop-limit") {
    limitPrice = Number(els.tLimit.value.trim());
    if (!(limitPrice > 0)) { say(els.tLimit, els.tLimitMsg, "Enter a limit price above 0."); return null; }
    if (type === "limit" && side === "Buy" && limitPrice > q.ask) { say(els.tLimit, els.tLimitMsg, `A limit buy goes at or below the ask, ${fmtMoney(q.ask)}. Use Market to buy now.`); return null; }
    if (type === "limit" && side === "Sell" && limitPrice < q.bid) { say(els.tLimit, els.tLimitMsg, `A limit sell goes at or above the bid, ${fmtMoney(q.bid)}. Use Market to sell now.`); return null; }
    clear(els.tLimit, els.tLimitMsg);
  }
  if (type === "stop" || type === "stop-limit") {
    stopPrice = Number(els.tStop.value.trim());
    if (!(stopPrice > 0)) { say(els.tStop, els.tStopMsg, "Enter a stop price above 0."); return null; }
    if (side === "Sell" && stopPrice >= q.last) { say(els.tStop, els.tStopMsg, `A sell stop goes below the price now, ${fmtMoney(q.last)}.`); return null; }
    if (side === "Buy" && stopPrice <= q.last) { say(els.tStop, els.tStopMsg, `A buy stop goes above the price now, ${fmtMoney(q.last)}.`); return null; }
    clear(els.tStop, els.tStopMsg);
  }
  if (type === "trailing") {
    trailPct = Number(els.tTrail.value.trim());
    if (!(trailPct >= 0.1 && trailPct <= 50)) { say(els.tTrail, els.tTrailMsg, "Trail must be between 0.1% and 50%."); return null; }
    clear(els.tTrail, els.tTrailMsg);
  }

  // The price a market order would get now; a limit's own price otherwise.
  const kind = type === "limit" ? "limit" : "market";
  const ref = type === "limit" ? fillPrice(id, side, "limit", limitPrice)
    : type === "stop-limit" ? limitPrice
    : type === "stop" ? stopPrice
    : fillPrice(id, side, "market");
  const qty = ticket.mode === "units" ? sizeRaw : sizeRaw / ref;
  const fee = state.rules.commission || 0;
  const total = qty * ref;

  if (side === "Buy" && total + fee > state.cash + 0.005) {
    say(els.tQty, els.tQtyMsg, `You have ${fmtMoney(state.cash)} in cash${fee ? `, and the fee is ${fmtMoney(fee)}` : ""}.`);
    return null;
  }
  if (side === "Sell") {
    if (!pos) { say(els.tQty, els.tQtyMsg, `You do not hold any ${selectedCoin.symbol}.`); return null; }
    if (qty > pos.units * 1.0001) { say(els.tQty, els.tQtyMsg, `You hold ${fmtUnits(pos.units)} ${pos.symbol}.`); return null; }
  }
  return { id, side, type, kind, qty: Math.min(qty, pos && side === "Sell" ? pos.units : qty), ref, total, fee, limitPrice, stopPrice, trailPct, tif: els.tTif.value };
}

// Confirm: a market order fills now, anything else goes to Working orders.
function placeTicket(t) {
  const coin = selectedCoin;
  if (t.type === "market") {
    const fill = fillPrice(t.id, t.side, "market");
    if (t.side === "Buy") buyUnits(coin, t.qty, fill, null);
    else sellUnits(coin, t.qty, fill, null);
    toast(`${t.side === "Buy" ? "Bought" : "Sold"} ${fmtUnits(t.qty)} ${coin.symbol} at ${fmtMoney(fill)}.`, t.side === "Buy" ? "" : "down");
  } else {
    state.orders.push({
      id: Date.now(), coinId: coin.id, symbol: coin.symbol, name: coin.name,
      side: t.side, type: t.type, qty: t.qty, dollars: null, all: false,
      limitPrice: t.limitPrice, stopPrice: t.stopPrice, trailPct: t.trailPct,
      tif: t.tif, created: new Date().toISOString(), high: quoteFor(coin.id).last, triggered: false,
    });
    toast(`${ORDER_NAMES[t.type]} ${t.side.toLowerCase()} placed: ${fmtUnits(t.qty)} ${coin.symbol}.`);
  }
  save();
  ticket.reviewing = false;
  els.tQty.value = "";
  render();
  watchLive();
  checkOrders();
}

// Close: sell the whole position at the market, from the positions table.
function closePosition(id) {
  const pos = positionFor(id);
  if (!pos || blockReason()) return;
  const fill = fillPrice(id, "Sell", "market");
  sellUnits({ id: pos.id, name: pos.name, symbol: pos.symbol }, pos.units, fill, "Close");
  toast(`Closed ${pos.symbol} at ${fmtMoney(fill)}.`, "down");
  save();
  render();
}

function toggleWatch() {
  if (!selectedCoin) return;
  const i = state.watchlist.findIndex((w) => w.id === selectedCoin.id);
  if (i >= 0) state.watchlist.splice(i, 1);
  else state.watchlist.push({ id: selectedCoin.id, name: selectedCoin.name, symbol: selectedCoin.symbol });
  save();
  render();
  fetchPrices();
  watchLive();
}

function startOver() {
  state.cash = state.rules.startingCash;
  state.positions = [];
  state.trades = [];
  state.orders = [];
  state.orderHistory = [];
  state.equity = [[Date.now(), state.rules.startingCash]];
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
  const watched = state.watchlist.some((w) => w.id === state.selected);
  els.starBtn.textContent = watched ? "★ Watching" : "☆ Watch";
  els.starBtn.setAttribute("aria-pressed", String(watched));
  els.coinPrice.textContent = fmtMoney(p.price);
  els.coinChange.textContent = isStock(state.selected)
    ? `Today ${fmtPct(p.change24h)} · prev close ${fmtMoney(p.prevClose)}`
    : `24h ${fmtPct(p.change24h)} · 7d ${fmtPct(p.change7d)}`;
  renderUpdated();
}

// "Live · Coinbase" with a green dot when ticks are coming in for this coin,
// otherwise when CoinGecko last answered.
function renderUpdated() {
  if (!selectedCoin || !prices[state.selected]) return;
  els.coinUpdated.replaceChildren();
  if (isStock(state.selected)) {
    els.coinUpdated.textContent = `Updated ${timeAgo(lastPriceAt)} · Finnhub, every 15s`;
  } else if (liveHas(selectedCoin.symbol) && liveAt && Date.now() - liveAt.getTime() < 90 * 1000) {
    els.coinUpdated.appendChild(el("span", "", "live-dot"));
    els.coinUpdated.appendChild(document.createTextNode(`Live · Coinbase · ${timeAgo(liveAt)}`));
  } else {
    els.coinUpdated.textContent = `Updated ${timeAgo(lastPriceAt)} · CoinGecko`;
  }
}

function renderTape() {
  for (const b of els.tapeTabs) b.classList.toggle("active", b.dataset.tape === tapeView);
  const items = tapeView === "watch" ? state.watchlist.map((w) => ({ ...w, spark: [] })) : tape;
  if (tapeView === "watch" && items.length === 0) {
    els.tape.replaceChildren(el("li", "Nothing starred yet. Pick an asset and press ☆ Watch.", "muted"));
    return;
  }
  if (items.length === 0) return;
  els.tape.replaceChildren();
  for (const c of items) {
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
    if (c.spark.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("aria-hidden", "true");
      btn.appendChild(svg);
      drawSparkline(svg, c.spark);
    }
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
    height: 260,
    evenly: isStock(state.selected), // stock bars only exist in market hours
    markers,
    fmt: (v) => fmtMoney(v),
    fmtTime,
    fmtHover: (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
}

function renderPerformance() {
  renderStats(els.stats);
  const points = state.equity.slice();
  points.push([Date.now(), portfolioTotal()]);
  // Before anything happened, a flat line at the starting cash.
  if (points.length < 2) points.unshift([Date.now() - 60 * 1000, state.rules.startingCash]);
  drawLineChart(els.equity, points, {
    height: 180,
    baseline: state.rules.startingCash,
    fmt: (v) => fmtMoney(v),
    fmtTime: (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    fmtHover: (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
}

function tradesCsv() {
  const head = ["time", "side", "via", "coin", "units", "price", "dollars", "realized"];
  const rows = state.trades.map((t) => [t.time, t.side, t.via || "", t.symbol, t.units, t.price, t.dollars, t.realized == null ? "" : t.realized]);
  // Text that starts like a formula gets a quote in front, so a symbol such as
  // "=SUM" from an API cannot run in a spreadsheet. Numbers are left alone.
  const cell = (v) => {
    let t = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

// The stock market's mood is the S&P 500's move today, from the tape quote.
function stockMood() {
  const spy = prices["stock:SPY"];
  if (!spy || !Number.isFinite(spy.change24h)) return null;
  const c = spy.change24h;
  const label = c <= -1.5 ? "Selling off" : c < -0.5 ? "Down" : c > 1.5 ? "Rallying" : c > 0.5 ? "Up" : "Flat";
  return { value: fmtPct(c), label, bad: c <= -1.5, good: c >= 1.5 };
}

function orderWords(o) {
  const at = o.type === "limit" ? `at ${fmtMoney(o.limitPrice)}`
    : o.type === "stop" ? `stop ${fmtMoney(o.stopPrice)}`
    : o.type === "stop-limit" ? `stop ${fmtMoney(o.stopPrice)}, limit ${fmtMoney(o.limitPrice)}${o.triggered ? ", triggered" : ""}`
    : o.type === "trailing" ? `trailing ${o.trailPct}% (stop now ${fmtMoney((o.high || 0) * (1 - o.trailPct / 100))})`
    : "at market";
  const size = o.qty != null ? fmtUnits(o.qty) : o.all ? "all" : fmtMoney(o.dollars) + " of";
  return `${o.side} ${size} ${o.symbol} ${at} · ${o.tif}`;
}

// The ticket: which fields show, what the fill would be, whether it can go.
function renderTicket() {
  const q = state.selected ? quoteFor(state.selected) : null;
  const ready = Boolean(q);
  const reason = blockReason();
  const type = els.tType.value;
  els.bpLine.textContent = `Buying power ${fmtMoney(state.cash)}`;
  els.sideBuy.classList.toggle("active", ticket.side === "Buy");
  els.sideSell.classList.toggle("active", ticket.side === "Sell");
  els.modeUnits.classList.toggle("active", ticket.mode === "units");
  els.modeDollars.classList.toggle("active", ticket.mode === "dollars");
  els.tQty.placeholder = ticket.mode === "units" ? "0.5" : "250";
  show(els.fLimit, type === "limit" || type === "stop-limit");
  show(els.fStop, type === "stop" || type === "stop-limit");
  show(els.fTrail, type === "trailing");
  els.sideSell.disabled = ready && !positionFor(state.selected) && ticket.side !== "Sell";
  els.tReview.textContent = `Review ${ticket.side.toLowerCase()} order`;
  els.tReview.classList.toggle("sell-side", ticket.side === "Sell");
  els.tConfirm.classList.toggle("sell-side", ticket.side === "Sell");
  els.review.classList.toggle("sell-side", ticket.side === "Sell");
  show(els.review, ticket.reviewing);
  els.ticket.classList.toggle("frozen", ticket.reviewing);
  for (const node of els.ticket.querySelectorAll("input, select, button")) {
    node.disabled = !ready || Boolean(reason) || ticket.reviewing;
  }
  if (ready && !reason && !ticket.reviewing) {
    els.sideSell.disabled = !positionFor(state.selected);
  }
  if (!ready) {
    els.tradeNote.textContent = "";
    els.tradeNote.className = "note";
    return;
  }
  // Prefill prices the first time a field opens.
  if (els.fLimit.hidden === false && !els.tLimit.value) els.tLimit.value = q.last.toFixed(q.last < 10 ? 4 : 2);
  if (els.fStop.hidden === false && !els.tStop.value) {
    els.tStop.value = (ticket.side === "Sell" ? q.last * 0.97 : q.last * 1.03).toFixed(q.last < 10 ? 4 : 2);
    // A stop-limit's limit starts at its stop, the usual default.
    if (type === "stop-limit") els.tLimit.value = els.tStop.value;
  }
  if (els.fTrail.hidden === false && !els.tTrail.value) els.tTrail.value = state.rules.stopPct;

  const t = readTicket(true);
  if (t) {
    // A valid ticket clears any message left from an earlier attempt.
    for (const [input, msg] of [[els.tQty, els.tQtyMsg], [els.tLimit, els.tLimitMsg], [els.tStop, els.tStopMsg], [els.tTrail, els.tTrailMsg]]) {
      msg.textContent = "";
      input.classList.remove("invalid");
    }
  }
  els.estPriceLabel.textContent = type === "market" ? "Est. fill" : type === "stop" ? "Fills near" : "Fill at";
  els.estTotalLabel.textContent = ticket.side === "Buy" ? "Est. cost" : "Est. proceeds";
  els.estPrice.textContent = t ? fmtMoney(t.ref) : type === "market" ? fmtMoney(fillPrice(state.selected, ticket.side, "market")) : "—";
  els.estTotal.textContent = t ? fmtMoney(t.total) : "—";
  els.estFee.textContent = fmtMoney(state.rules.commission || 0);
  const after = t ? (ticket.side === "Buy" ? state.cash - t.total - t.fee : state.cash + t.total - t.fee) : state.cash;
  els.estBp.textContent = fmtMoney(after);
  els.estBp.className = "fig " + (t && after < 0 ? "down" : "");

  renderSizer();
  if (reason) {
    els.tradeNote.textContent = reason;
    els.tradeNote.className = "note block";
  } else {
    const warning = moodWarning();
    els.tradeNote.textContent = warning;
    els.tradeNote.className = warning ? "note warn" : "note";
  }
}

function renderSizer() {
  els.sizer.replaceChildren();
  if (!state.selected || !prices[state.selected] || ticket.side !== "Buy") return;
  const size = suggestedSize();
  els.sizer.appendChild(document.createTextNode(`By my rules: ${fmtMoney(size)} (${state.rules.riskPct}% of cash at risk, ${state.rules.stopPct}% stop) `));
  const use = el("button", "Use", "quiet small");
  use.type = "button";
  use.addEventListener("click", () => {
    ticket.mode = "dollars";
    els.tQty.value = size.toFixed(2);
    renderTicket();
    els.tQty.focus();
  });
  els.sizer.appendChild(use);
}

function renderOrders() {
  show(els.ordersEmpty, state.orders.length === 0);
  els.ordersList.replaceChildren();
  for (const o of state.orders) {
    const li = document.createElement("li");
    li.appendChild(el("span", orderWords(o)));
    const cancel = el("button", "Cancel", "cancel");
    cancel.type = "button";
    cancel.dataset.id = o.id;
    li.appendChild(cancel);
    els.ordersList.appendChild(li);
  }
  const h = state.orderHistory;
  els.historyCount.textContent = h.length ? String(h.length) : "";
  show(els.historyEmpty, h.length === 0);
  show(els.historyTable, h.length > 0);
  els.historyBody.replaceChildren();
  for (const o of h.slice(0, 30)) {
    const size = o.qty != null ? fmtUnits(o.qty) : o.all ? "all" : fmtMoney(o.dollars);
    els.historyBody.appendChild(row([
      fmtWhen(o.closed), [`${o.side} ${ORDER_NAMES[o.type]}`, o.side === "Buy" ? "up" : "down"], o.symbol, size,
      o.fillPrice ? fmtMoney(o.fillPrice) : "—", [o.status, o.status === "filled" ? "" : "muted"],
    ]));
  }
}

function renderPortfolio() {
  els.cash.textContent = fmtMoney(state.cash);
  const any = state.positions.length > 0;
  show(els.positionsEmpty, !any);
  show(els.positionsTable, any);
  els.positionsBody.replaceChildren();
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
    const tr = row([
      p.symbol, fmtUnits(p.units), fmtMoney(p.avgPrice), q ? fmtMoney(price) : "—", fmtMoney(v),
      [`${fmtSigned(gain)} (${fmtPct(pct)})`, upDown(gain)], "",
    ]);
    const sellBtn = el("button", "Sell…", "quiet close-btn sell-btn");
    sellBtn.type = "button";
    sellBtn.dataset.id = p.id;
    sellBtn.title = "Load this position into the ticket on the Sell side";
    const close = el("button", "Close", "quiet close-btn");
    close.type = "button";
    close.dataset.id = p.id;
    close.title = "Sell it all at the market now";
    close.disabled = !q || Boolean(blockReason());
    tr.lastChild.appendChild(sellBtn);
    tr.lastChild.appendChild(close);
    els.positionsBody.appendChild(tr);
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
  els.tradesBody.replaceChildren();
  for (const t of state.trades.slice(0, 50)) {
    els.tradesBody.appendChild(row([
      fmtWhen(t.time), [t.via ? `${t.side} · ${t.via}` : t.side, t.side === "Buy" ? "up" : "down"], t.symbol, fmtUnits(t.units), fmtMoney(t.price), fmtMoney(t.dollars),
      t.fee ? fmtMoney(t.fee) : "", t.realized == null ? "" : [fmtSigned(t.realized), upDown(t.realized)],
    ]));
  }
  show(els.exportBtn, any);
}

function renderRules() {
  const r = state.rules;
  els.rulesSummary.textContent = `${fmtMoney(r.startingCash).replace(".00", "")} to start, ${r.maxTrades} trades a day, ${fmtMoney(r.lossLimit).replace(".00", "")} daily loss limit, ${r.riskPct}% risk with a ${r.stopPct}% stop, ${r.commission ? fmtMoney(r.commission) + " commission" : "no commission"}, ${r.slippageBps} bps slippage.`;
  if (!els.rulesBox.open) {
    els.ruleCash.value = r.startingCash;
    els.ruleTrades.value = r.maxTrades;
    els.ruleLoss.value = r.lossLimit;
    els.ruleRisk.value = r.riskPct;
    els.ruleStop.value = r.stopPct;
    els.ruleFee.value = r.commission;
    els.ruleSlip.value = r.slippageBps;
  }
}

function renderMood() {
  if (state.market === "stocks") {
    const m = stockMood();
    els.moodSource.textContent = "S&P 500 today";
    show(els.moodLoading, !m);
    show(els.moodError, false);
    show(els.moodBody, Boolean(m));
    if (!m) return;
    els.fngValue.textContent = m.value;
    els.fngLabel.textContent = m.label;
    els.fngValue.className = "mood-number fig " + (m.bad ? "down" : m.good ? "up" : "");
    return;
  }
  els.moodSource.textContent = "Fear & Greed";
  show(els.moodLoading, !mood);
  show(els.moodBody, Boolean(mood));
  if (!mood) return;
  els.fngValue.textContent = mood.value;
  els.fngLabel.textContent = mood.label;
  els.fngValue.className = "mood-number fig " + (mood.value <= 25 ? "down" : mood.value >= 75 ? "up" : "");
}

// The amber line under the Buy button. A warning never blocks.
function moodWarning() {
  const parts = [];
  if (isStock(state.selected)) {
    const m = stockMood();
    if (m && m.bad) parts.push(`The S&P 500 is ${m.value} today.`);
  } else if (mood && mood.value <= 25) {
    parts.push(`Market is in ${mood.label} (${mood.value}).`);
  }
  const h = headlineMood();
  if (h && h.label === "negative") parts.push(`The news reads negative (${h.sum}).`);
  return parts.join(" ");
}

function renderNews() {
  const h = headlineMood();
  els.headlineScore.textContent = h ? (h.sum > 0 ? "+" + h.sum : String(h.sum)) : "—";
  els.headlineLabel.textContent = h ? h.label : "";
  els.headlineScore.className = "fig " + (h ? (h.label === "positive" ? "up" : h.label === "negative" ? "down" : "") : "");

  show(els.brief, Boolean(newsFor && brief));
  if (newsFor && brief) {
    els.briefText.textContent = brief.text;
    els.briefSentiment.textContent = brief.sentiment;
    els.briefSentiment.className = "fig " + (brief.sentiment === "positive" ? "up" : brief.sentiment === "negative" ? "down" : "");
    els.briefCompare.textContent = h
      ? (h.label === brief.sentiment ? "· my word lists agree" : `· my word lists say ${h.label}`)
      : "";
  }
  if (!newsFor) return; // empty, loading or error view is already up
  els.newsList.innerHTML = "";
  if (news.length === 0) {
    els.newsList.appendChild(el("li", "No recent news about this one.", "muted"));
    return;
  }
  // A picture that several articles share is the publisher's logo, not a
  // picture of the story, so it is left out.
  const seen = {};
  for (const a of news) if (a.image) seen[a.image] = (seen[a.image] || 0) + 1;
  for (const a of news) {
    const li = document.createElement("li");
    if (a.image && /^https:\/\//.test(a.image) && seen[a.image] === 1) {
      const img = document.createElement("img");
      img.className = "news-img";
      img.src = a.image;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => img.remove()); // a dead image just goes
      li.appendChild(img);
    }
    const text = el("div", "", "news-text");
    li.appendChild(text);
    const link = el("a", a.title);
    if (/^https?:\/\//.test(a.url)) link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const score = scoreHeadline(a.title);
    const mark = score > 0 ? " · +1" : score < 0 ? " · −1" : " · 0";
    text.appendChild(link);
    text.appendChild(el("span", `${a.source || "Unknown source"} · ${timeAgo(new Date(a.publishedAt))}${mark}`, "muted"));
    els.newsList.appendChild(li);
  }
}

function render() {
  renderCoin();
  renderTicket();
  renderOrders();
  renderPortfolio();
  renderTrades();
  renderMood();
  renderNews();
  renderRules();
  renderTape();
  renderChart();
  renderPerformance();
}

// ---------- Events ----------

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.searchInput.value.trim();
  if (!q) {
    els.searchMsg.textContent = state.market === "stocks" ? "Type a company or ticker." : "Type a coin name.";
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

function setMarket(market) {
  state.market = market;
  save();
  for (const b of els.marketBtns) b.classList.toggle("active", b.dataset.market === market);
  els.searchInput.placeholder = market === "stocks" ? "apple, NVDA, spy" : "bitcoin, eth, sol";
  els.results.innerHTML = "";
  els.searchMsg.textContent = "";
  tape = [];
  els.tape.replaceChildren(el("li", "Loading the tape…", "muted"));
  fetchTape();
  render();
}

for (const btn of els.marketBtns) {
  btn.addEventListener("click", () => setMarket(btn.dataset.market));
}

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

// ---- The order ticket ----

for (const b of [els.sideBuy, els.sideSell]) {
  b.addEventListener("click", () => { ticket.side = b.dataset.side; els.tQty.value = ""; els.tStop.value = ""; renderTicket(); });
}
for (const b of [els.modeUnits, els.modeDollars]) {
  b.addEventListener("click", () => { ticket.mode = b.dataset.mode; els.tQty.value = ""; renderTicket(); });
}
els.tType.addEventListener("change", () => { els.tLimit.value = ""; els.tStop.value = ""; renderTicket(); });
for (const input of [els.tQty, els.tLimit, els.tStop, els.tTrail, els.tTif]) {
  input.addEventListener("input", renderTicket);
}

// Presets: a share of cash when buying, of the position when selling.
for (const b of els.presets) {
  b.addEventListener("click", () => {
    const pct = Number(b.dataset.pct) / 100;
    const q = quoteFor(state.selected);
    if (!q) return;
    if (ticket.side === "Buy") {
      const fee = state.rules.commission || 0;
      const dollars = Math.max(0, (state.cash - fee) * pct);
      els.tQty.value = ticket.mode === "dollars" ? dollars.toFixed(2) : (dollars / fillPrice(state.selected, "Buy", "market")).toPrecision(6);
    } else {
      const pos = positionFor(state.selected);
      if (!pos) return;
      const units = pos.units * pct;
      els.tQty.value = ticket.mode === "units" ? units.toPrecision(6) : (units * fillPrice(state.selected, "Sell", "market")).toFixed(2);
    }
    renderTicket();
  });
}

els.ticket.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = readTicket(false);
  if (!t) return;
  ticket.reviewing = true;
  const coin = selectedCoin;
  const what = t.type === "market"
    ? `${t.side} ${fmtUnits(t.qty)} ${coin.symbol} at the market, about ${fmtMoney(t.ref)} each.`
    : `${t.side} ${fmtUnits(t.qty)} ${coin.symbol}, ${ORDER_NAMES[t.type].toLowerCase()} ${t.type === "trailing" ? t.trailPct + "% below the high" : t.type === "stop-limit" ? `stop ${fmtMoney(t.stopPrice)}, limit ${fmtMoney(t.limitPrice)}` : fmtMoney(t.type === "stop" ? t.stopPrice : t.limitPrice)}, ${t.tif === "Day" ? "good for today" : "good till cancelled"}.`;
  const money = `${t.side === "Buy" ? "Cost" : "Proceeds"} about ${fmtMoney(t.total)}${t.fee ? `, fee ${fmtMoney(t.fee)}` : ""}. Buying power after: ${fmtMoney(t.side === "Buy" ? state.cash - t.total - t.fee : state.cash + t.total - t.fee)}.`;
  els.reviewText.textContent = `${what} ${money}`;
  renderTicket();
  els.tConfirm.focus();
});

els.tConfirm.addEventListener("click", () => {
  const t = readTicket(false);
  if (!t) { ticket.reviewing = false; renderTicket(); return; }
  placeTicket(t);
});

els.tEdit.addEventListener("click", () => { ticket.reviewing = false; renderTicket(); els.tQty.focus(); });

els.starBtn.addEventListener("click", toggleWatch);

for (const b of els.tapeTabs) {
  b.addEventListener("click", () => { tapeView = b.dataset.tape; renderTape(); });
}

els.ordersList.addEventListener("click", (e) => {
  const btn = e.target.closest(".cancel");
  if (btn) cancelOrder(Number(btn.dataset.id));
});

// Sell…: the position goes into the ticket on the Sell side, all of it, at
// the market, ready to review. Close: sold at the market right away.
function sellFromTicket(id) {
  const pos = positionFor(id);
  if (!pos) return;
  if (state.selected !== id) {
    selectCoin({ id: pos.id, name: pos.name, symbol: pos.symbol });
    if (state.market !== (isStock(id) ? "stocks" : "crypto")) setMarket(isStock(id) ? "stocks" : "crypto");
  }
  ticket.side = "Sell";
  ticket.mode = "units";
  ticket.reviewing = false;
  els.tType.value = "market";
  els.tQty.value = pos.units.toPrecision(6);
  renderTicket();
  els.ticket.scrollIntoView({ behavior: "smooth", block: "start" });
  els.tReview.focus();
}

els.positionsBody.addEventListener("click", (e) => {
  const sellBtn = e.target.closest(".sell-btn");
  if (sellBtn) { sellFromTicket(sellBtn.dataset.id); return; }
  const btn = e.target.closest(".close-btn");
  if (btn) closePosition(btn.dataset.id);
});

els.exportBtn.addEventListener("click", () => {
  location.href = "trades.html";
});

// [key, input, message, whole number?, allow zero?]
const RULE_FIELDS = [
  ["startingCash", els.ruleCash, $("rule-cash-msg"), true, false],
  ["maxTrades", els.ruleTrades, $("rule-trades-msg"), true, false],
  ["lossLimit", els.ruleLoss, $("rule-loss-msg"), true, false],
  ["riskPct", els.ruleRisk, $("rule-risk-msg"), false, false],
  ["stopPct", els.ruleStop, $("rule-stop-msg"), false, false],
  ["commission", els.ruleFee, $("rule-fee-msg"), false, true],
  ["slippageBps", els.ruleSlip, $("rule-slip-msg"), false, true],
];

els.rulesForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const next = {};
  let ok = true;
  for (const [key, input, msg, whole, zero] of RULE_FIELDS) {
    const n = Number(input.value.trim());
    const bad = input.value.trim() === "" || !Number.isFinite(n) || (zero ? n < 0 : n <= 0) || (whole && !Number.isInteger(n)) || (!whole && !zero && n > 100);
    if (bad) {
      msg.textContent = whole ? "Use a whole number above 0." : zero ? "Use 0 or more." : "Use a number above 0, up to 100.";
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

// Charts are drawn at pixel size, so redraw when the window changes.
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderChart(); renderPerformance(); }, 150);
});
document.addEventListener("theme-changed", () => { renderChart(); renderPerformance(); });
document.addEventListener("state-changed", () => { render(); fetchPrices(); watchLive(); });

// ---------- Start ----------

load();
for (const b of els.marketBtns) b.classList.toggle("active", b.dataset.market === state.market);
els.searchInput.placeholder = state.market === "stocks" ? "apple, NVDA, spy" : "bitcoin, eth, sol";
render();
fetchPrices();
fetchTape();
fetchMood();
fetchNews();
fetchChart();
watchLive();
setInterval(fetchCryptoPrices, 60 * 1000);
setInterval(fetchStockPrices, 15 * 1000);
setInterval(fetchTape, 60 * 1000);
setInterval(renderUpdated, 1000);
