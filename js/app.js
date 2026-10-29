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
};

function show(el, on) {
  el.hidden = !on;
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
    for (const c of data) {
      prices[c.id] = {
        price: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency,
        change7d: c.price_change_percentage_7d_in_currency,
      };
    }
    lastPriceAt = new Date();
    render();
  } catch (err) {
    if (firstTime) {
      setCoinView("error", "Could not reach CoinGecko. Check your connection and retry.");
    } else {
      // Keep the last prices and say so.
      els.coinUpdated.textContent = `Could not refresh. Last price ${timeAgo(lastPriceAt)}.`;
    }
  }
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
    btn.innerHTML = `<span>${c.name}</span><span class="meta fig">${c.symbol.toUpperCase()}${c.market_cap_rank ? " · #" + c.market_cap_rank : ""}</span>`;
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
}

// ---------- Rendering ----------

function setCoinView(which, message) {
  show(els.coinEmpty, which === "empty");
  show(els.coinLoading, which === "loading");
  show(els.coinError, which === "error");
  show(els.coinBody, which === "body");
  if (message) els.coinErrorText.textContent = message;
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
  els.coinUpdated.textContent = `Updated ${timeAgo(lastPriceAt)}`;
}

function render() {
  renderCoin();
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

// ---------- Start ----------

load();
render();
fetchPrices();
setInterval(fetchPrices, 60 * 1000);
setInterval(() => {
  if (lastPriceAt && state.selected && prices[state.selected]) {
    els.coinUpdated.textContent = `Updated ${timeAgo(lastPriceAt)}`;
  }
}, 1000);
