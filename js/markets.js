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

async function fetchCoins() {
  try {
    const r = await fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h,7d`);
    if (!r.ok) throw new Error(`CoinGecko answered ${r.status}`);
    const data = await r.json();
    els.coinsBody.replaceChildren();
    for (const c of data) {
      const tr = row([
        String(c.market_cap_rank || ""), c.symbol.toUpperCase(), c.name, fmtMoney(c.current_price),
        [fmtPct(c.price_change_percentage_24h_in_currency), upDown(c.price_change_percentage_24h_in_currency)],
        [fmtPct(c.price_change_percentage_7d_in_currency), upDown(c.price_change_percentage_7d_in_currency)],
        fmtCap(c.market_cap), "",
      ]);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("aria-hidden", "true");
      drawSparkline(svg, c.sparkline_in_7d ? c.sparkline_in_7d.price : [], 80, 22);
      tr.lastChild.appendChild(svg);
      pickRow(tr, c.id, c.name, c.symbol.toUpperCase(), "crypto");
      els.coinsBody.appendChild(tr);
    }
    show(els.coinsStatus, false);
    show(els.coinsTable, true);
  } catch (err) {
    els.coinsStatus.textContent = "Could not load the coins. Check your connection and refresh.";
    els.coinsStatus.className = "error";
  }
}

async function fetchStocks() {
  try {
    const symbols = STOCK_TAPE.map(([s]) => s);
    const r = await fetch(`/api/stocks?op=quote&symbols=${encodeURIComponent(symbols.join(","))}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `The stocks function answered ${r.status}`);
    els.stocksBody.replaceChildren();
    let i = 0;
    for (const [symbol, name] of STOCK_TAPE) {
      const q = data.quotes[symbol];
      const tr = row([
        String(++i), symbol, name, q ? fmtMoney(q.price) : "—",
        q ? [fmtPct(q.changePct), upDown(q.changePct)] : "—",
        q ? fmtMoney(q.prevClose) : "—", q ? `${fmtMoney(q.low)} – ${fmtMoney(q.high)}` : "—",
      ]);
      pickRow(tr, `stock:${symbol}`, name, symbol, "stocks");
      els.stocksBody.appendChild(tr);
    }
    show(els.stocksStatus, false);
    show(els.stocksTable, true);
  } catch (err) {
    els.stocksStatus.textContent = /not set up/.test(err.message) ? err.message : "Could not load stock quotes right now.";
    els.stocksStatus.className = "error";
    show(els.stocksStatus, true);
  }
}

async function refresh() {
  await Promise.all([fetchCoins(), fetchStocks()]);
  lastAt = new Date();
  els.updated.textContent = `Updated ${timeAgo(lastAt)}`;
}

load();
renderHeader();
fetchQuotes([...new Set(state.positions.map((p) => p.id))]).then(renderHeader);
refresh();
setInterval(refresh, 60 * 1000);
setInterval(() => { if (lastAt) els.updated.textContent = `Updated ${timeAgo(lastAt)}`; }, 1000);
document.addEventListener("state-changed", renderHeader);
