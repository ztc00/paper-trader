// trades.html: every trade, grouped by day with a total per day, with
// filters and a CSV export. Reads the saved state and changes nothing.

const els = {
  total: $("portfolio-total"), pnl: $("portfolio-pnl"), summary: $("summary"),
  side: $("filter-side"), asset: $("filter-asset"), text: $("filter-text"), exportBtn: $("export-btn"),
  empty: $("trades-empty"), table: $("trades-table"), body: $("trades-body"),
};

function dayKey(iso) {
  return new Date(iso).toDateString();
}

function filtered() {
  const side = els.side.value;
  const asset = els.asset.value;
  const text = els.text.value.trim().toLowerCase();
  return state.trades.filter((t) =>
    (side === "all" || t.side === side) &&
    (asset === "all" || t.symbol === asset) &&
    (!text || `${t.symbol} ${t.side} ${t.via || ""}`.toLowerCase().includes(text)));
}

function renderAssets() {
  const current = els.asset.value;
  const symbols = [...new Set(state.trades.map((t) => t.symbol))].sort();
  els.asset.replaceChildren(el("option", "Every asset"));
  els.asset.firstChild.value = "all";
  for (const s of symbols) {
    const o = el("option", s);
    o.value = s;
    els.asset.appendChild(o);
  }
  els.asset.value = symbols.includes(current) ? current : "all";
}

function render() {
  const total = portfolioTotal();
  const since = total - state.rules.startingCash;
  els.total.textContent = fmtMoney(total);
  els.pnl.textContent = `${fmtSigned(since)} (${fmtPct((since / state.rules.startingCash) * 100)})`;
  els.pnl.className = "pnl fig " + upDown(since);

  const list = filtered();
  const realized = list.reduce((a, t) => a + (t.realized || 0), 0);
  const sells = list.filter((t) => t.realized != null).length;
  els.summary.textContent = state.trades.length
    ? `${list.length} of ${state.trades.length} trades · ${sells} closed · realized ${fmtSigned(realized)}`
    : "";
  show(els.empty, state.trades.length === 0);
  show(els.table, state.trades.length > 0);
  show(els.exportBtn, state.trades.length > 0);
  els.body.replaceChildren();

  let day = null;
  for (const t of list) {
    const k = dayKey(t.time);
    if (k !== day) {
      day = k;
      const dayTrades = list.filter((x) => dayKey(x.time) === k);
      const dayRealized = dayTrades.reduce((a, x) => a + (x.realized || 0), 0);
      const tr = document.createElement("tr");
      tr.className = "day-head";
      const label = el("td", new Date(t.time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }));
      label.colSpan = 7;
      tr.appendChild(label);
      tr.appendChild(el("td", `${dayTrades.length} trade${dayTrades.length === 1 ? "" : "s"} · ${fmtSigned(dayRealized)}`, "fig " + upDown(dayRealized)));
      tr.appendChild(el("td", ""));
      els.body.appendChild(tr);
    }
    const tr = row([
      new Date(t.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      [t.via ? `${t.side} · ${t.via}` : t.side, t.side === "Buy" ? "up" : "down"],
      t.symbol, fmtUnits(t.units), fmtMoney(t.price), fmtMoney(t.dollars), t.fee ? fmtMoney(t.fee) : "",
      t.realized == null ? "" : [fmtSigned(t.realized), upDown(t.realized)], "",
    ]);
    // The journal: a note on each trade, saved as you type.
    const note = document.createElement("input");
    note.type = "text";
    note.className = "note-input";
    note.placeholder = "Why this trade?";
    note.value = t.note || "";
    note.maxLength = 140;
    note.addEventListener("change", () => { t.note = note.value.trim(); save(); });
    tr.lastChild.appendChild(note);
    els.body.appendChild(tr);
  }
}

function tradesCsv(list) {
  const head = ["time", "side", "via", "asset", "market", "units", "price", "dollars", "fee", "realized", "note"];
  const rows = list.map((t) => [t.time, t.side, t.via || "", t.symbol, isStock(t.coinId) ? "stock" : "crypto", t.units, t.price, t.dollars, t.fee || 0, t.realized == null ? "" : t.realized, t.note || ""]);
  // Text that starts like a formula gets a quote in front, so a symbol such as
  // "=SUM" from an API cannot run in a spreadsheet. Numbers are left alone.
  const cell = (v) => {
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([tradesCsv(filtered())], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `paper-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

for (const input of [els.side, els.asset]) input.addEventListener("change", render);
els.text.addEventListener("input", render);

load();
renderAssets();
render();
fetchQuotes([...new Set(state.positions.map((p) => p.id))]).then(render);
document.addEventListener("state-changed", () => { renderAssets(); render(); });
