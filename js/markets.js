// markets.html: the top 50 coins and the big US tickers. Click a row and it
// becomes the selected asset on the Desk.

const els = {
  total: $("portfolio-total"), pnl: $("portfolio-pnl"), updated: $("updated"),
  coinsStatus: $("coins-status"), coinsTable: $("coins-table"), coinsBody: $("coins-body"),
  stocksStatus: $("stocks-status"), stocksTable: $("stocks-table"), stocksBody: $("stocks-body"),
};

let lastAt = null;

function fmtCap(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return fmtMoney(n);
}

function renderHeader() {
  const total = portfolioTotal();
  const since = total - state.rules.startingCash;
  els.total.textContent = fmtMoney(total);
  els.pnl.textContent = `${fmtSigned(since)} (${fmtPct((since / state.rules.startingCash) * 100)})`;
  els.pnl.className = "pnl fig " + upDown(since);
}

// Picking a row: remember it as the selected asset, then open the desk.
function pick(id, name, symbol, market) {
  state.selected = id;
  state.market = market;
  selectedCoin = { id, name, symbol };
  save();
  location.href = "index.html";
}

function pickRow(tr, id, name, symbol, market) {
  tr.className = "pick";
  tr.tabIndex = 0;
  tr.setAttribute("role", "button");
  tr.title = `Trade ${name} on the Desk`;
  tr.addEventListener("click", () => pick(id, name, symbol, market));
  tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id, name, symbol, market); } });
}

let coins = [];            // the top 50 as CoinGecko sent them
let sortKey = "cap", sortDir = -1; // market cap, biggest first, by default
let filterText = "";

function watched(id) {
  return state.watchlist.some((w) => w.id === id);
}

function toggleWatch(id, name, symbol) {
  const i = state.watchlist.findIndex((w) => w.id === id);
  if (i >= 0) state.watchlist.splice(i, 1);
  else state.watchlist.push({ id, name, symbol });
  save();
  renderCoins();
  renderStocks();
  renderWatch();
}

// The star and the Trade button on every row.
function starCell(td, id, name, symbol) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "star row-star" + (watched(id) ? " on" : "");
  b.setAttribute("aria-pressed", String(watched(id)));
  b.setAttribute("aria-label", watched(id) ? `Remove ${symbol} from the watchlist` : `Add ${symbol} to the watchlist`);
  b.innerHTML = '<svg class="star-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.4 5.9.6-4.4 4 1.3 5.8L10 14.6l-5.3 3 1.3-5.8-4.4-4 5.9-.6z"/></svg>';
  b.addEventListener("click", (e) => { e.stopPropagation(); toggleWatch(id, name, symbol); });
  td.appendChild(b);
}

function tradeCell(td, id, name, symbol, market) {
  const b = el("button", "Trade", "quiet close-btn");
  b.type = "button";
  b.addEventListener("click", (e) => { e.stopPropagation(); pick(id, name, symbol, market); });
  td.appendChild(b);
}

function coinRow(c, rankText) {
  const tr = row([
    rankText, c.symbol.toUpperCase(), c.name, fmtMoney(c.current_price),
    [fmtPct(c.price_change_percentage_24h_in_currency), upDown(c.price_change_percentage_24h_in_currency)],
    [fmtPct(c.price_change_percentage_7d_in_currency), upDown(c.price_change_percentage_7d_in_currency)],
    fmtCap(c.market_cap), "", "",
  ]);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  drawSparkline(svg, c.sparkline_in_7d ? c.sparkline_in_7d.price : [], 80, 22);
  tr.children[7].appendChild(svg);
  tr.children[0].replaceChildren();
  starCell(tr.children[0], c.id, c.name, c.symbol.toUpperCase());
  tradeCell(tr.children[8], c.id, c.name, c.symbol.toUpperCase(), "crypto");
  pickRow(tr, c.id, c.name, c.symbol.toUpperCase(), "crypto");
  return tr;
}

function renderCoins() {
  const q = filterText.toLowerCase();
  const keyOf = { price: (c) => c.current_price, change24h: (c) => c.price_change_percentage_24h_in_currency, change7d: (c) => c.price_change_percentage_7d_in_currency, cap: (c) => c.market_cap };
  const list = coins
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    .sort((a, b) => ((keyOf[sortKey](a) || 0) - (keyOf[sortKey](b) || 0)) * sortDir);
  els.coinsBody.replaceChildren();
  for (const c of list) els.coinsBody.appendChild(coinRow(c, ""));
  for (const th of document.querySelectorAll("#coins-table .sortable")) {
    th.classList.toggle("sorted", th.dataset.sort === sortKey);
    th.setAttribute("aria-sort", th.dataset.sort === sortKey ? (sortDir < 0 ? "descending" : "ascending") : "none");
  }
  show(els.coinsStatus, list.length === 0);
  els.coinsStatus.textContent = list.length ? "" : "No coin in the top 50 matches that.";
  els.coinsStatus.className = "muted";
  show(els.coinsTable, true);
}

// The watchlist at the top, coins and stocks together, with live prices.
function renderWatch() {
  const body = $("watch-body");
  show($("watch-section"), state.watchlist.length > 0);
  body.replaceChildren();
  for (const w of state.watchlist) {
    const q = prices[w.id];
    const tr = row([
      "", w.symbol, w.name, q ? fmtMoney(q.price) : "—",
      q ? [fmtPct(q.change24h), upDown(q.change24h)] : "—",
      q && q.change7d != null ? [fmtPct(q.change7d), upDown(q.change7d)] : "—", "", "",
    ]);
    if (q && q.spark && q.spark.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("aria-hidden", "true");
      drawSparkline(svg, q.spark, 80, 22);
      tr.children[6].appendChild(svg);
    }
    starCell(tr.children[0], w.id, w.name, w.symbol);
    tradeCell(tr.children[7], w.id, w.name, w.symbol, isStock(w.id) ? "stocks" : "crypto");
    pickRow(tr, w.id, w.name, w.symbol, isStock(w.id) ? "stocks" : "crypto");
    body.appendChild(tr);
  }
}

async function fetchCoins() {
  try {
    const r = await fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h,7d`);
    if (!r.ok) throw new Error(r.status === 429 ? "CoinGecko is rate-limiting right now. Try again in a minute." : `CoinGecko answered ${r.status}`);
    coins = await r.json();
    for (const c of coins) {
      prices[c.id] = { price: c.current_price, change24h: c.price_change_percentage_24h_in_currency, change7d: c.price_change_percentage_7d_in_currency, spark: c.sparkline_in_7d ? c.sparkline_in_7d.price : [] };
    }
    renderCoins();
  } catch (err) {
    if (coins.length) return; // keep what we had
    els.coinsStatus.textContent = /rate-limiting/.test(err.message) ? err.message : "Could not load the coins. Check your connection and refresh.";
    els.coinsStatus.className = "error";
  }
}

let stockQuotes = {};

function renderStocks() {
  els.stocksBody.replaceChildren();
  for (const [symbol, name] of STOCK_TAPE) {
    const q = stockQuotes[symbol];
    const tr = row([
      "", symbol, name, q ? fmtMoney(q.price) : "—",
      q ? [fmtPct(q.changePct), upDown(q.changePct)] : "—",
      q ? fmtMoney(q.prevClose) : "—", q ? `${fmtMoney(q.low)} – ${fmtMoney(q.high)}` : "—", "",
    ]);
    starCell(tr.children[0], `stock:${symbol}`, name, symbol);
    tradeCell(tr.children[7], `stock:${symbol}`, name, symbol, "stocks");
    pickRow(tr, `stock:${symbol}`, name, symbol, "stocks");
    els.stocksBody.appendChild(tr);
  }
  show(els.stocksStatus, false);
  show(els.stocksTable, true);
}

async function fetchStocks() {
  try {
    const symbols = STOCK_TAPE.map(([s]) => s);
    const r = await fetch(`/api/stocks?op=quote&symbols=${encodeURIComponent(symbols.join(","))}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `The stocks function answered ${r.status}`);
    stockQuotes = data.quotes;
    for (const [sym, q] of Object.entries(data.quotes)) {
      prices[`stock:${sym}`] = { price: q.price, change24h: q.changePct, change7d: null, prevClose: q.prevClose, at: q.at };
    }
    renderStocks();
  } catch (err) {
    els.stocksStatus.textContent = /not set up/.test(err.message) ? err.message : "Could not load stock quotes right now.";
    els.stocksStatus.className = "error";
    show(els.stocksStatus, true);
  }
}

async function refresh() {
  const watchIds = state.watchlist.map((w) => w.id).filter((id) => !coins.some((c) => c.id === id) && !STOCK_TAPE.some(([s]) => `stock:${s}` === id));
  await Promise.all([fetchCoins(), fetchStocks(), watchIds.length ? fetchQuotes(watchIds) : Promise.resolve()]);
  renderWatch();
  lastAt = new Date();
  els.updated.textContent = `Updated ${timeAgo(lastAt)}`;
}

$("coin-filter").addEventListener("input", (e) => { filterText = e.target.value.trim(); renderCoins(); });
for (const th of document.querySelectorAll("#coins-table .sortable")) {
  th.addEventListener("click", () => {
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = -1; }
    renderCoins();
  });
}

load();
renderHeader();
fetchQuotes([...new Set(state.positions.map((p) => p.id))]).then(renderHeader);
refresh();
setInterval(refresh, 60 * 1000);
setInterval(() => { if (lastAt) els.updated.textContent = `Updated ${timeAgo(lastAt)}`; }, 1000);
document.addEventListener("state-changed", () => { renderHeader(); renderWatch(); renderCoins(); renderStocks(); });
