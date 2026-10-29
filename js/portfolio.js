// portfolio.html: what I hold, what it is worth, and how it has gone.
// Reads the same saved state as the desk and changes nothing.

const els = {
  total: $("portfolio-total"), pnl: $("portfolio-pnl"), updated: $("updated"),
  cardTotal: $("card-total"), cardCash: $("card-cash"), cardSince: $("card-since"), cardToday: $("card-today"),
  allocEmpty: $("alloc-empty"), alloc: $("alloc"), donut: $("donut"), legend: $("legend"),
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

  els.total.textContent = fmtMoney(total);
  els.pnl.textContent = `${fmtSigned(since)} (${fmtPct(sincePct)})`;
  els.pnl.className = "pnl fig " + upDown(since);
  els.cardTotal.textContent = fmtMoney(total);
  els.cardCash.textContent = fmtMoney(state.cash);
  els.cardSince.textContent = `${fmtSigned(since)} (${fmtPct(sincePct)})`;
  els.cardSince.className = "fig " + upDown(since);
  els.cardToday.textContent = fmtSigned(todayRealized);
  els.cardToday.className = "fig " + upDown(todayRealized);

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
    els.positionsBody.appendChild(row([
      r.p.symbol, isStock(r.p.id) ? "Stock" : "Crypto", fmtUnits(r.p.units), fmtMoney(r.p.avgPrice),
      r.q ? fmtMoney(r.price) : "—", r.q ? [fmtPct(r.q.change24h), upDown(r.q.change24h)] : "—",
      fmtMoney(r.cost), fmtMoney(r.value), `${weight.toFixed(1)}%`,
      [`${fmtSigned(r.gain)} (${fmtPct(r.cost ? (r.gain / r.cost) * 100 : 0)})`, upDown(r.gain)],
    ]));
  }
  els.positionsCost.textContent = fmtMoney(cost);
  els.positionsValue.textContent = fmtMoney(value);
  els.positionsPnl.textContent = fmtSigned(value - cost);
  els.positionsPnl.className = "fig " + upDown(value - cost);

  // Allocation: each holding, then cash.
  if (any) {
    const parts = rows.map((r, i) => ({ label: r.p.symbol, value: r.value, color: SWATCHES[i % SWATCHES.length] }));
    parts.push({ label: "Cash", value: state.cash, color: "var(--text-muted)" });
    drawDonut(els.donut, parts);
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
  const words = { "limit-buy": "Buy", "stop-loss": "Sell all if it falls to", "take-profit": "Sell all if it rises to" };
  for (const o of state.orders) {
    const text = o.type === "limit-buy"
      ? `Buy ${fmtMoney(o.dollars)} of ${o.symbol} when it drops to ${fmtMoney(o.price)}`
      : `${words[o.type]} ${fmtMoney(o.price)} · ${o.symbol}`;
    const li = document.createElement("li");
    li.appendChild(el("span", text));
    const q = prices[o.coinId];
    li.appendChild(el("span", q ? `now ${fmtMoney(q.price)}` : "", "muted fig"));
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

async function refresh() {
  const ids = [...new Set(state.positions.map((p) => p.id).concat(state.orders.map((o) => o.coinId)))];
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

load();
render();
refresh();
setInterval(refresh, 30 * 1000);
setInterval(() => { if (lastAt && !els.updated.classList.contains("error")) els.updated.textContent = `Prices updated ${timeAgo(lastAt)}`; }, 1000);
document.addEventListener("state-changed", refresh);
document.addEventListener("theme-changed", render);
window.addEventListener("resize", render);
