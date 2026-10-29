// Charts drawn as inline SVG. No library. Each function clears the <svg> it
// is given and draws into it, so the caller can redraw at any time.

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function scale(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  if (minX === maxX) { maxX = minX + 1; }
  return { minX, maxX, minY, maxY };
}

// A price line over time. points: [[timeMs, price], ...]. markers: my trades
// in the same range, drawn as dots. Hover shows a crosshair with the value.
function drawLineChart(svg, points, opts = {}) {
  svg.replaceChildren();
  const W = 600, H = 220, padL = 8, padR = 8, padT = 10, padB = 22;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (!points || points.length < 2) return;
  const s = scale(points);
  const x = (t) => padL + ((t - s.minX) / (s.maxX - s.minX)) * (W - padL - padR);
  const y = (p) => padT + (1 - (p - s.minY) / (s.maxY - s.minY)) * (H - padT - padB);

  const up = points[points.length - 1][1] >= points[0][1];
  const color = up ? "var(--up)" : "var(--down)";

  // Four faint grid lines with the price at each.
  for (let i = 0; i <= 3; i++) {
    const p = s.minY + ((s.maxY - s.minY) * i) / 3;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(p), y2: y(p), class: "grid" }));
    const label = svgEl("text", { x: W - padR, y: y(p) - 3, class: "axis", "text-anchor": "end" });
    label.textContent = opts.fmt ? opts.fmt(p) : p.toFixed(2);
    svg.appendChild(label);
  }

  const d = points.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points[points.length - 1][0]).toFixed(1)},${H - padB} L${x(points[0][0]).toFixed(1)},${H - padB} Z`;
  svg.appendChild(svgEl("path", { d: area, class: "area", fill: color }));
  svg.appendChild(svgEl("path", { d, class: "line", stroke: color }));

  // Time labels: first, middle, last.
  for (const t of [s.minX, (s.minX + s.maxX) / 2, s.maxX]) {
    const anchor = t === s.minX ? "start" : t === s.maxX ? "end" : "middle";
    const label = svgEl("text", { x: x(t), y: H - 6, class: "axis", "text-anchor": anchor });
    label.textContent = opts.fmtTime ? opts.fmtTime(t) : new Date(t).toLocaleDateString();
    svg.appendChild(label);
  }

  for (const m of opts.markers || []) {
    if (m.t < s.minX || m.t > s.maxX) continue;
    svg.appendChild(svgEl("circle", { cx: x(m.t), cy: y(m.price), r: 4.5, class: m.side === "Buy" ? "mark buy" : "mark sell" }));
  }

  // Hover: a vertical line and a readout that follow the pointer.
  const cross = svgEl("line", { y1: padT, y2: H - padB, class: "cross", visibility: "hidden" });
  const dot = svgEl("circle", { r: 4, class: "cross-dot", visibility: "hidden", fill: color });
  const readout = svgEl("text", { y: padT + 12, class: "readout", visibility: "hidden" });
  svg.append(cross, dot, readout);
  svg.onpointermove = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = s.minX + ((px - padL) / (W - padL - padR)) * (s.maxX - s.minX);
    // Nearest point by time.
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid][0] < t) lo = mid; else hi = mid; }
    const pt = Math.abs(points[lo][0] - t) < Math.abs(points[hi][0] - t) ? points[lo] : points[hi];
    cross.setAttribute("x1", x(pt[0])); cross.setAttribute("x2", x(pt[0]));
    dot.setAttribute("cx", x(pt[0])); dot.setAttribute("cy", y(pt[1]));
    const left = x(pt[0]) < W / 2;
    readout.setAttribute("x", left ? x(pt[0]) + 8 : x(pt[0]) - 8);
    readout.setAttribute("text-anchor", left ? "start" : "end");
    readout.textContent = `${opts.fmt ? opts.fmt(pt[1]) : pt[1]} · ${opts.fmtHover ? opts.fmtHover(pt[0]) : new Date(pt[0]).toLocaleString()}`;
    for (const n of [cross, dot, readout]) n.setAttribute("visibility", "visible");
  };
  svg.onpointerleave = () => {
    for (const n of [cross, dot, readout]) n.setAttribute("visibility", "hidden");
  };
}

// A small line with no axes, for the tape. values: numbers in time order.
function drawSparkline(svg, values) {
  svg.replaceChildren();
  const W = 90, H = 28;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (!values || values.length < 2) return;
  const points = values.map((v, i) => [i, v]);
  const s = scale(points);
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => 2 + (1 - (v - s.minY) / (s.maxY - s.minY)) * (H - 4);
  const d = points.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  svg.appendChild(svgEl("path", { d, class: "spark", stroke: up ? "var(--up)" : "var(--down)" }));
}
