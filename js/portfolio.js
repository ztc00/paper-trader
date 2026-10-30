// portfolio.html: what I hold, what it is worth, and how it has gone.
// Reads the same saved state as the desk and changes nothing.

const els = {
  total: $("portfolio-total"), pnl: $("portfolio-pnl"), updated: $("updated"),
  cardTotal: $("card-total"), cardCash: $("card-cash"), cardSince: $("card-since"), cardToday: $("card-today"), cardTodayNote: $("card-today-note"),
  allocEmpty: $("alloc-empty"), alloc: $("alloc"), allocBar: $("alloc-bar"), legend: $("legend"),
  positionsEmpty: $("positions-empty"), positionsTable: $("positions-table"), positionsBody: $("positions-body"),
  positionsCost: $("positions-cost"), positionsValue: $("positions-value"), positionsPnl: $("positions-pnl"),
  ordersEmpty: $("orders-empty"), ordersList: $("orders-list"),
  equity: $("equity"), stats: $("stats"),
};

let lastAt = null;

// Six colors for the donut, then the muted one for whatever is left.
const SWATCHES = ["var(--up)", "#4FA3FF", "#FFB01F", "#B07CFF", "#FF7AB6", "#2BD4C6"];

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function render() {
  const total = portfolioTotal();
  const since = total - state.rules.startingCash;
  const sincePct = (since / state.rules.startingCash) * 100;
  const todayRealized = state.trades.filter((t) => isToday(t.time)).reduce((a, t) => a + (t.realized || 0), 0);
  // Today's move on what I hold: each position's value now against its
  // value at the day's open (24 hours ago for a coin). A position bought
  // today counts from what I paid, not from a price I never held it at.
  const todayOpen = state.positions.reduce((a, p) => {
    const q = prices[p.id];
    if (!q) return a;
    const v = p.units * q.price;
    const boughtToday = state.trades.some((t) => t.coinId === p.id && t.side === "Buy" && isToday(t.time));
    if (boughtToday) return a + (v - p.units * p.avgPrice);
    if (!Number.isFinite(q.change24h)) return a;
    return a + (v - v / (1 + q.change24h / 100));
  }, 0);
  const today = todayRealized + todayOpen;

  els.total.textContent = fmtMoney(total);
  els.pnl.textContent = `${fmtSigned(since)} (${fmtPct(sincePct)})`;
  els.pnl.className = "pnl fig " + upDown(since);
  els.cardTotal.textContent = fmtMoney(total);
  els.cardCash.textContent = fmtMoney(state.cash);
  els.cardSince.textContent = `${fmtSigned(since)} (${fmtPct(sincePct)})`;
  els.cardSince.className = "fig " + upDown(since);
  els.cardToday.textContent = fmtSigned(today);
  els.cardToday.className = "fig " + upDown(today);
  els.cardTodayNote.textContent = `${fmtSigned(todayRealized)} realized · ${fmtSigned(todayOpen)} on open positions`;

  // Positions, biggest first.
  const rows = state.positions.map((p) => {
    const q = prices[p.id];
    const price = q ? q.price : p.avgPrice;
    const value = p.units * price;
    const cost = p.units * p.avgPrice;
    return { p, q, price, value, cost, gain: value - cost };
  }).sort((a, b) => b.value - a.value);
  const any = rows.length > 0;
  show(els.positionsEmpty, !any);
  show(els.positionsTable, any);
  show(els.allocEmpty, !any);
  show(els.alloc, any);
  els.positionsBody.replaceChildren();
  let value = 0, cost = 0;
  for (const r of rows) {
    value += r.value;
    cost += r.cost;
    const weight = total > 0 ? (r.value / total) * 100 : 0;
    const tr = row([
      r.p.symbol, isStock(r.p.id) ? "Stock" : "Crypto", fmtUnits(r.p.units), fmtMoney(r.p.avgPrice),
      r.q ? fmtMoney(r.price) : "—", r.q ? [fmtPct(r.q.change24h), upDown(r.q.change24h)] : "—",
      fmtMoney(r.cost), fmtMoney(r.value), `${weight.toFixed(1)}%`,
      [`${fmtSigned(r.gain)} (${fmtPct(r.cost ? (r.gain / r.cost) * 100 : 0)})`, upDown(r.gain)], "",
    ]);
    const trade = el("button", "Trade", "quiet close-btn");
    trade.type = "button";
    trade.title = "Open it on the Desk";
    trade.addEventListener("click", () => {
      state.selected = r.p.id;
      state.market = isStock(r.p.id) ? "stocks" : "crypto";
      selectedCoin = { id: r.p.id, name: r.p.name, symbol: r.p.symbol };
      save();
      location.href = "index.html";
    });
    const close = el("button", "Close", "quiet close-btn");
    close.type = "button";
    close.dataset.id = r.p.id;
    close.title = "Sell it all at the market now";
    close.disabled = !r.q || Boolean(blockReason());
    tr.lastChild.appendChild(trade);
    tr.lastChild.appendChild(close);
    els.positionsBody.appendChild(tr);
  }
  els.positionsCost.textContent = fmtMoney(cost);
  els.positionsValue.textContent = fmtMoney(value);
  els.positionsPnl.textContent = fmtSigned(value - cost);
  els.positionsPnl.className = "fig " + upDown(value - cost);

  // Allocation: one bar, each holding a slice, cash last.
  if (any) {
    const parts = rows.map((r, i) => ({ label: r.p.symbol, value: r.value, color: SWATCHES[i % SWATCHES.length] }));
    parts.push({ label: "Cash", value: state.cash, color: "var(--text-muted)" });
    els.allocBar.replaceChildren();
    for (const part of parts) {
      const seg = document.createElement("span");
      seg.style.width = `${total > 0 ? (part.value / total) * 100 : 0}%`;
      seg.style.background = part.color;
      seg.title = `${part.label} ${total > 0 ? Math.round((part.value / total) * 100) : 0}%`;
      els.allocBar.appendChild(seg);
    }
    els.legend.replaceChildren();
    for (const part of parts) {
      const li = document.createElement("li");
      const sw = el("span", "", "swatch");
      sw.style.background = part.color;
      li.appendChild(sw);
      li.appendChild(el("span", `${part.label} ${total > 0 ? Math.round((part.value / total) * 100) : 0}%`));
      li.appendChild(el("span", fmtMoney(part.value), "fig muted"));
      els.legend.appendChild(li);
    }
  }

  // Orders, read-only here.
  show(els.ordersEmpty, state.orders.length === 0);
  els.ordersList.replaceChildren();
  const names = { market: "Market", limit: "Limit", stop: "Stop", "stop-limit": "Stop-limit", trailing: "Trailing stop" };
  for (const o of state.orders) {
    const at = o.type === "limit" ? `at ${fmtMoney(o.limitPrice)}` : o.type === "stop" ? `stop ${fmtMoney(o.stopPrice)}`
      : o.type === "stop-limit" ? `stop ${fmtMoney(o.stopPrice)}, limit ${fmtMoney(o.limitPrice)}` : o.type === "trailing" ? `trailing ${o.trailPct}%` : "";
    const size = o.qty != null ? fmtUnits(o.qty) : o.all ? "all" : fmtMoney(o.dollars) + " of";
    const text = `${o.side} ${size} ${o.symbol} ${names[o.type]} ${at} · ${o.tif}`;
    const li = document.createElement("li");
    li.appendChild(el("span", text));
    const right = el("span", "", "order-right");
    const q = prices[o.coinId];
    right.appendChild(el("span", q ? `now ${fmtMoney(q.price)}` : "", "muted fig"));
    const cancel = el("button", "Cancel", "cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => { closeOrder(o, "cancelled"); save(); render(); });
    right.appendChild(cancel);
    li.appendChild(right);
    els.ordersList.appendChild(li);
  }

  renderStats(els.stats);
  const points = state.equity.slice();
  points.push([Date.now(), total]);
  // Before anything happened, a flat line at the starting cash.
  if (points.length < 2) points.unshift([Date.now() - 60 * 1000, state.rules.startingCash]);
  drawLineChart(els.equity, points, {
    height: 220,
    baseline: state.rules.startingCash,
    fmt: (v) => fmtMoney(v),
    fmtTime: (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    fmtHover: (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
}

// Live ticks from Coinbase for the coins I hold, the same as the desk.
// live.js calls applyTick and liveStatusChanged; renders are throttled.
function liveIds() {
  return [...new Set(state.positions.map((p) => p.id).concat(state.orders.map((o) => o.coinId)))];
}

function symbolMap() {
  const map = {};
  for (const p of state.positions) if (!isStock(p.id)) map[p.symbol] = p.id;
  for (const o of state.orders) if (!isStock(o.coinId)) map[o.symbol] = o.coinId;
  return map;
}

let tickTimer = null;
function applyTick(symbol, price, bid, ask) {
  const id = symbolMap()[symbol];
  if (!id || !prices[id]) return;
  prices[id].price = price;
  if (bid > 0 && ask > 0) { prices[id].bid = bid; prices[id].ask = ask; }
  lastAt = new Date();
  if (tickTimer) return;
  tickTimer = setTimeout(() => { tickTimer = null; render(); els.updated.textContent = "Live · Coinbase"; }, 250);
}

function liveStatusChanged() {}

function watchLive() {
  liveWatch(Object.keys(symbolMap()));
}

async function refresh() {
  const ids = liveIds();
  watchLive();
  if (ids.length === 0) {
    els.updated.textContent = "";
    render();
    return;
  }
  const failed = await fetchQuotes(ids);
  lastAt = new Date();
  els.updated.textContent = failed.length ? `Some prices did not load: ${failed[0]}` : `Prices updated ${timeAgo(lastAt)}`;
  els.updated.className = failed.length ? "error" : "muted";
  render();
}

// Stocks have no feed: poll the ones I hold every 15 seconds, like the desk.
async function refreshStocks() {
  const ids = liveIds().filter(isStock);
  if (!ids.length) return;
  await fetchQuotes(ids);
  render();
}

// Close: sell the whole position at the market, right here.
els.positionsBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".close-btn");
  if (!btn) return;
  const pos = positionFor(btn.dataset.id);
  if (!pos || blockReason()) return;
  const fill = fillPrice(pos.id, "Sell", "market");
  sellUnits({ id: pos.id, name: pos.name, symbol: pos.symbol }, pos.units, fill, "Close");
  save();
  toast(`Closed ${pos.symbol} at ${fmtMoney(fill)}.`, "down");
  render();
});

load();
render();
refresh();
setInterval(refresh, 2 * 60 * 1000);
setInterval(refreshStocks, 15 * 1000);
setInterval(() => {
  if (!lastAt || els.updated.classList.contains("error")) return;
  const live = Object.keys(symbolMap()).some((s) => liveHas(s)) && Date.now() - lastAt.getTime() < 90 * 1000;
  els.updated.textContent = live ? `Live · Coinbase · ${timeAgo(lastAt)}` : `Prices updated ${timeAgo(lastAt)}`;
}, 1000);
document.addEventListener("state-changed", () => { refresh(); watchLive(); });
document.addEventListener("theme-changed", render);
window.addEventListener("resize", render);
