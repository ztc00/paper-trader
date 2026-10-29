// Shared by every page: the saved state, formatting, small DOM helpers,
// prices for any list of ids, the theme, and the header nav. Loaded before
// the page's own script. Nothing here touches a specific page's elements.

const STORAGE_KEY = "paper-trader-v1";
const THEME_KEY = "paper-trader-theme";
const COINGECKO = "https://api.coingecko.com/api/v3";

const DEFAULT_RULES = { startingCash: 10000, maxTrades: 5, lossLimit: 500, riskPct: 1, stopPct: 5, commission: 0, slippageBps: 5 };

// Ten big US tickers for the stock tape. Finnhub has no "top 10" endpoint.
const STOCK_TAPE = [
  ["SPY", "S&P 500 ETF"], ["QQQ", "Nasdaq 100 ETF"], ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"],
  ["AMZN", "Amazon"], ["GOOGL", "Alphabet"], ["META", "Meta"], ["TSLA", "Tesla"], ["AMD", "AMD"],
];

// Stocks and coins share one id space. A coin id is CoinGecko's slug, like
// "bitcoin"; a stock id is "stock:AAPL". Everything saved keys off the id.
function isStock(id) {
  return typeof id === "string" && id.startsWith("stock:");
}

function stockSymbol(id) {
  return id.slice(6);
}

// ---------- State ----------

let state = {
  cash: DEFAULT_RULES.startingCash,
  positions: [], // { id, name, symbol, units, avgPrice }
  trades: [],    // { id, time, coinId, symbol, side, units, price, dollars, realized, via }
  rules: { ...DEFAULT_RULES },
  selected: null, // the id on the desk, like "bitcoin" or "stock:AAPL"
  orders: [],     // working orders: { id, coinId, symbol, name, side, type, qty, dollars, limitPrice, stopPrice, trailPct, tif, created, high, triggered }
  orderHistory: [], // the last 200 orders that filled, were cancelled or expired, newest first
  equity: [],     // [[timeMs, portfolioValue], ...] for the performance chart
  market: "crypto", // which tab the search and tape show: "crypto" or "stocks"
  watchlist: [],  // [{ id, name, symbol }] starred on the desk
  alerts: [],     // [{ id, coinId, symbol, name, price, above, created }] one-shot price alerts
};

let selectedCoin = null; // { id, name, symbol } for state.selected
let prices = {};         // id -> { price, change24h, change7d, ... } fetched, never saved

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      state.cash = Number.isFinite(saved.cash) ? saved.cash : state.cash;
      state.positions = Array.isArray(saved.positions) ? saved.positions : [];
      state.trades = Array.isArray(saved.trades) ? saved.trades : [];
      state.rules = { ...DEFAULT_RULES, ...saved.rules };
      state.orders = (Array.isArray(saved.orders) ? saved.orders : []).map(upgradeOrder);
      state.orderHistory = Array.isArray(saved.orderHistory) ? saved.orderHistory : [];
      state.watchlist = Array.isArray(saved.watchlist) ? saved.watchlist : [];
      state.alerts = Array.isArray(saved.alerts) ? saved.alerts : [];
      state.equity = Array.isArray(saved.equity) ? saved.equity : [];
      state.selected = saved.selected || null;
      state.market = saved.market === "stocks" ? "stocks" : "crypto";
      selectedCoin = saved.selectedCoin || null;
    }
  } catch {
    // Broken or blocked storage: start from the defaults.
  }
}

// Orders from before version 4 had three types and a dollar amount. They
// become the matching version 4 order so nothing pending is lost.
function upgradeOrder(o) {
  if (o.side) return o;
  const map = { "limit-buy": ["Buy", "limit"], "stop-loss": ["Sell", "stop"], "take-profit": ["Sell", "limit"] };
  const [side, type] = map[o.type] || ["Sell", "stop"];
  return {
    id: o.id, coinId: o.coinId, symbol: o.symbol, name: o.name, side, type,
    qty: null, dollars: o.dollars || null, all: side === "Sell",
    limitPrice: type === "limit" ? o.price : null, stopPrice: type === "stop" ? o.price : null,
    trailPct: null, tif: "GTC", created: o.created, high: null, triggered: false,
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, selectedCoin }));
  } catch {
    // Storage blocked. The page still works until a refresh.
  }
}

// Another tab (the desk, say) saved: reload and tell the page.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    load();
    document.dispatchEvent(new Event("state-changed"));
  }
  if (e.key === THEME_KEY) applyTheme();
});

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

function timeAgo(date) {
  if (!date) return "";
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------- DOM helpers ----------

const $ = (id) => document.getElementById(id);

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

// ---------- Portfolio math ----------

function positionValue(p) {
  const q = prices[p.id];
  return q ? p.units * q.price : p.units * p.avgPrice;
}

function portfolioTotal() {
  return state.cash + state.positions.reduce((sum, p) => sum + positionValue(p), 0);
}

function maxDrawdown(points) {
  let peak = -Infinity, worst = 0;
  for (const [, v] of points) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > worst) worst = dd;
  }
  return worst * 100;
}

// The numbers behind the performance panel, worked out from the log.
function performanceStats() {
  const sells = state.trades.filter((t) => t.side === "Sell" && t.realized != null);
  const wins = sells.filter((t) => t.realized > 0);
  const losses = sells.filter((t) => t.realized < 0);
  const sum = (arr) => arr.reduce((a, t) => a + t.realized, 0);
  const realized = sum(sells);
  const unrealized = state.positions.reduce((a, p) => a + positionValue(p) - p.units * p.avgPrice, 0);
  const grossWin = sum(wins), grossLoss = Math.abs(sum(losses));
  const best = sells.length ? Math.max(...sells.map((t) => t.realized)) : null;
  const worst = sells.length ? Math.min(...sells.map((t) => t.realized)) : null;
  return [
    ["Realized P&L", fmtSigned(realized), upDown(realized)],
    ["Unrealized P&L", fmtSigned(unrealized), upDown(unrealized)],
    ["Win rate", sells.length ? `${Math.round((wins.length / sells.length) * 100)}% of ${sells.length}` : "—"],
    ["Avg win", wins.length ? fmtSigned(grossWin / wins.length) : "—", "up"],
    ["Avg loss", losses.length ? fmtSigned(-grossLoss / losses.length) : "—", "down"],
    ["Profit factor", grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : wins.length ? "∞" : "—"],
    ["Best trade", best == null ? "—" : fmtSigned(best), best == null ? "" : upDown(best)],
    ["Worst trade", worst == null ? "—" : fmtSigned(worst), worst == null ? "" : upDown(worst)],
    ["Max drawdown", state.equity.length > 1 ? `${maxDrawdown(state.equity).toFixed(1)}%` : "—"],
  ];
}

function renderStats(dl) {
  dl.replaceChildren();
  for (const [label, value, cls] of performanceStats()) {
    const div = document.createElement("div");
    div.appendChild(el("dt", label));
    div.appendChild(el("dd", value, "fig " + (cls || "")));
    dl.appendChild(div);
  }
}

// ---------- Trading: fills, positions, the log ----------

function positionFor(id) {
  return state.positions.find((p) => p.id === id) || null;
}

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// Why my rules block right now, or null if they do not.
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

// The bid and ask for an id. Coinbase's feed carries both for crypto; a
// stock quote from Finnhub does not, so stocks get a 0.02% simulated spread,
// and a coin with no feed 0.05%.
function quoteFor(id) {
  const q = prices[id];
  if (!q) return null;
  if (q.bid && q.ask && q.ask >= q.bid) return { bid: q.bid, ask: q.ask, last: q.price };
  const half = (isStock(id) ? 0.0002 : 0.0005) / 2;
  return { bid: q.price * (1 - half), ask: q.price * (1 + half), last: q.price };
}

// What a fill would cost right now. Market orders pay the spread and
// slippage; a limit fills at its price or better.
function fillPrice(id, side, kind, limitPrice) {
  const q = quoteFor(id);
  if (!q) return null;
  const slip = (state.rules.slippageBps || 0) / 10000;
  if (kind === "limit") {
    return side === "Buy" ? Math.min(limitPrice, q.ask) : Math.max(limitPrice, q.bid);
  }
  return side === "Buy" ? q.ask * (1 + slip) : q.bid * (1 - slip);
}

function logTrade(coin, side, units, price, dollars, realized, via, fee) {
  state.trades.unshift({
    id: Date.now() + Math.random(),
    time: new Date().toISOString(),
    coinId: coin.id,
    symbol: coin.symbol,
    side,
    units,
    price,
    dollars,
    realized,
    fee: fee || 0,
    via: via || null, // "Limit", "Stop", "Stop-limit", "Trailing", "Close" or null for a market order from the ticket
    note: "",
  });
}

// Buy units at a price. Cash pays for the units and the fee. Buying more of
// something I hold moves the average price.
function buyUnits(coin, units, price, via) {
  const fee = state.rules.commission || 0;
  const dollars = units * price;
  const pos = positionFor(coin.id);
  if (pos) {
    pos.avgPrice = (pos.avgPrice * pos.units + dollars) / (pos.units + units);
    pos.units += units;
  } else {
    state.positions.push({ id: coin.id, name: coin.name, symbol: coin.symbol, units, avgPrice: price });
  }
  state.cash -= dollars + fee;
  logTrade(coin, "Buy", units, price, dollars, null, via, fee);
  recordEquity(true);
}

// Sell units at a price, never more than I hold. Realized P&L is against
// the average price, after the fee.
function sellUnits(coin, units, price, via) {
  const pos = positionFor(coin.id);
  if (!pos) return false;
  const fee = state.rules.commission || 0;
  units = Math.min(units, pos.units);
  const got = units * price;
  const realized = (price - pos.avgPrice) * units - fee;
  pos.units -= units;
  if (pos.units * price < 0.01) state.positions = state.positions.filter((p) => p !== pos);
  state.cash += got - fee;
  logTrade(coin, "Sell", units, price, got, realized, via, fee);
  recordEquity(true);
  return true;
}

// One point per minute at most, plus one on every trade. Capped at 1,000
// points by dropping every other old point, so the curve never grows forever.
function recordEquity(force) {
  const now = Date.now();
  const last = state.equity[state.equity.length - 1];
  if (!force && last && now - last[0] < 60 * 1000) return;
  state.equity.push([now, Math.round(portfolioTotal() * 100) / 100]);
  if (state.equity.length > 1000) {
    const old = state.equity.slice(0, 800).filter((_, i) => i % 2 === 0);
    state.equity = old.concat(state.equity.slice(800));
  }
}

// A working order leaves the list and goes to the history with its outcome.
function closeOrder(order, status, fillPrice) {
  state.orders = state.orders.filter((o) => o.id !== order.id);
  state.orderHistory.unshift({ ...order, status, closed: new Date().toISOString(), fillPrice: fillPrice || null });
  if (state.orderHistory.length > 200) state.orderHistory.length = 200;
}

// A small message at the bottom right, gone after four seconds.
function toast(message, cls) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = el("div", message, "toast " + (cls || ""));
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ---------- Prices for any list of ids (the pages other than the desk) ----------

async function fetchQuotes(ids) {
  const coins = ids.filter((id) => !isStock(id));
  const stocks = ids.filter(isStock).map(stockSymbol).sort();
  const jobs = [];
  if (coins.length) {
    jobs.push(fetch(`${COINGECKO}/coins/markets?vs_currency=usd&ids=${coins.join(",")}&price_change_percentage=24h,7d`)
      .then((r) => { if (!r.ok) throw new Error(`CoinGecko answered ${r.status}`); return r.json(); })
      .then((data) => {
        for (const c of data) {
          prices[c.id] = { price: c.current_price, change24h: c.price_change_percentage_24h_in_currency, change7d: c.price_change_percentage_7d_in_currency };
        }
      }));
  }
  if (stocks.length) {
    jobs.push(fetch(`/api/stocks?op=quote&symbols=${encodeURIComponent(stocks.join(","))}`)
      .then((r) => r.json().then((data) => { if (!r.ok) throw new Error(data.error || `The stocks function answered ${r.status}`); return data; }))
      .then((data) => {
        for (const [sym, q] of Object.entries(data.quotes)) {
          prices[`stock:${sym}`] = { price: q.price, change24h: q.changePct, change7d: null, prevClose: q.prevClose, at: q.at };
        }
      }));
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
  return failed;
}

// ---------- Theme and nav ----------

// Dark unless the system or the user says light. The choice is saved on its
// own key, so Start over never touches it.
function applyTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* blocked */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#F5F7F6" : "#0B0F0D";
  for (const b of document.querySelectorAll(".theme-btn")) {
    b.textContent = theme === "light" ? "Dark" : "Light";
    b.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  try { localStorage.setItem(THEME_KEY, next); } catch { /* blocked */ }
  applyTheme();
  document.dispatchEvent(new Event("theme-changed"));
}

applyTheme();
document.addEventListener("DOMContentLoaded", () => {
  for (const b of document.querySelectorAll(".theme-btn")) b.addEventListener("click", toggleTheme);
  const here = location.pathname.split("/").pop() || "index.html";
  for (const a of document.querySelectorAll(".nav a")) {
    if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
  }
});
