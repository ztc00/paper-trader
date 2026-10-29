// Charts drawn as inline SVG. No library. Each function clears the <svg> it
// is given and draws into it at the element's real pixel width, so text and
// strokes are the same size on every screen. Redraw on resize.

const SVG_NS = "http://www.w3.org/2000/svg";
let gradientCount = 0;

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
  // A little air above and below the line.
  const air = (maxY - minY) * 0.08;
  return { minX, maxX, minY: minY - air, maxY: maxY + air };
}

// A smooth path through the points (Catmull-Rom turned into cubic curves).
function smoothPath(pts) {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function chartWidth(svg) {
  const w = svg.clientWidth || (svg.parentElement && svg.parentElement.clientWidth) || 600;
  return Math.max(280, Math.round(w));
}

// A value over time. points: [[timeMs, value], ...], oldest first.
// opts: height, fmt (value label), fmtTime (axis), fmtHover (readout),
// markers [{t, price, side}], baseline (a dashed reference line, like the
// starting cash), lastLine (dashed line at the last value with a tag).
function drawLineChart(svg, points, opts = {}) {
  svg.replaceChildren();
  const W = chartWidth(svg), H = opts.height || 240;
  const padL = 10, padR = 74, padT = 16, padB = 26;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  if (!points || points.length < 2) return;

  const all = opts.baseline != null ? points.concat([[points[0][0], opts.baseline]]) : points;
  const s = scale(all);
  const x = (t) => padL + ((t - s.minX) / (s.maxX - s.minX)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - s.minY) / (s.maxY - s.minY)) * (H - padT - padB);
  const fmt = opts.fmt || ((v) => v.toFixed(2));

  const first = points[0][1], last = points[points.length - 1][1];
  const ref = opts.baseline != null ? opts.baseline : first;
  const color = last >= ref ? "var(--up)" : "var(--down)";

  // Grid: four faint lines, value in the right gutter. A label that would
  // sit under the last-price tag is left out.
  for (let i = 0; i <= 3; i++) {
    const v = s.minY + ((s.maxY - s.minY) * i) / 3;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: "grid" }));
    if (opts.lastLine !== false && Math.abs(y(v) - y(last)) < 14) continue;
    const label = svgEl("text", { x: W - padR + 8, y: y(v) + 4, class: "axis" });
    label.textContent = fmt(v);
    svg.appendChild(label);
  }

  // Area under the line fades out; the line itself is smooth.
  const id = `fade${++gradientCount}`;
  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": color, "stop-opacity": 0.28 }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": color, "stop-opacity": 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  const px = points.map(([t, v]) => [x(t), y(v)]);
  const line = smoothPath(px);
  const area = `${line} L${px[px.length - 1][0].toFixed(1)},${H - padB} L${px[0][0].toFixed(1)},${H - padB} Z`;
  svg.appendChild(svgEl("path", { d: area, fill: `url(#${id})` }));
  svg.appendChild(svgEl("path", { d: line, class: "line", stroke: color }));

  if (opts.baseline != null) {
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(opts.baseline), y2: y(opts.baseline), class: "baseline" }));
  }

  // The last value: a dashed line across, and a tag in the gutter.
  if (opts.lastLine !== false) {
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(last), y2: y(last), class: "last-line", stroke: color }));
    const tagText = fmt(last);
    const tw = tagText.length * 6.6 + 10;
    svg.appendChild(svgEl("rect", { x: W - padR + 4, y: y(last) - 9, width: tw, height: 18, rx: 3, fill: color }));
    const tag = svgEl("text", { x: W - padR + 9, y: y(last) + 4, class: "tag" });
    tag.textContent = tagText;
    svg.appendChild(tag);
  }

  // Time labels: first, middle, last.
  for (const t of [s.minX, (s.minX + s.maxX) / 2, s.maxX]) {
    const anchor = t === s.minX ? "start" : t === s.maxX ? "end" : "middle";
    const label = svgEl("text", { x: x(t), y: H - 8, class: "axis", "text-anchor": anchor });
    label.textContent = opts.fmtTime ? opts.fmtTime(t) : new Date(t).toLocaleDateString();
    svg.appendChild(label);
  }

  for (const m of opts.markers || []) {
    if (m.t < s.minX || m.t > s.maxX) continue;
    svg.appendChild(svgEl("circle", { cx: x(m.t), cy: y(m.price), r: 5, class: m.side === "Buy" ? "mark buy" : "mark sell" }));
  }

  // Hover: a vertical line, a dot and a readout that follow the pointer.
  const cross = svgEl("line", { y1: padT, y2: H - padB, class: "cross", visibility: "hidden" });
  const dot = svgEl("circle", { r: 4.5, class: "cross-dot", visibility: "hidden", fill: color });
  const box = svgEl("rect", { class: "readout-box", rx: 4, height: 22, visibility: "hidden" });
  const readout = svgEl("text", { class: "readout", visibility: "hidden" });
  svg.append(cross, dot, box, readout);
  svg.onpointermove = (e) => {
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const t = s.minX + ((mx - padL) / (W - padL - padR)) * (s.maxX - s.minX);
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid][0] < t) lo = mid; else hi = mid; }
    const pt = Math.abs(points[lo][0] - t) < Math.abs(points[hi][0] - t) ? points[lo] : points[hi];
    const cx = x(pt[0]), cy = y(pt[1]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    const text = `${fmt(pt[1])}  ·  ${opts.fmtHover ? opts.fmtHover(pt[0]) : new Date(pt[0]).toLocaleString()}`;
    readout.textContent = text;
    const tw = text.length * 6.4 + 16;
    const left = cx + 12 + tw < W - padR ? cx + 12 : cx - 12 - tw;
    const top = Math.max(padT, Math.min(cy - 32, H - padB - 24));
    box.setAttribute("x", left); box.setAttribute("y", top); box.setAttribute("width", tw);
    readout.setAttribute("x", left + 8); readout.setAttribute("y", top + 15);
    for (const n of [cross, dot, box, readout]) n.setAttribute("visibility", "visible");
  };
  svg.onpointerleave = () => {
    for (const n of [cross, dot, box, readout]) n.setAttribute("visibility", "hidden");
  };
}

// A small line with no axes, for the tape and tables. values in time order.
function drawSparkline(svg, values, width = 60, height = 20) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  if (!values || values.length < 2) return;
  const points = values.map((v, i) => [i, v]);
  const s = scale(points);
  const x = (i) => (i / (values.length - 1)) * width;
  const y = (v) => 2 + (1 - (v - s.minY) / (s.maxY - s.minY)) * (height - 4);
  const d = points.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  svg.appendChild(svgEl("path", { d, class: "spark", stroke: up ? "var(--up)" : "var(--down)" }));
}

// A donut of shares, for the portfolio page. parts: [{label, value, color}].
function drawDonut(svg, parts, size = 160) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return;
  const r = size / 2 - 6, c = size / 2, stroke = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  for (const p of parts) {
    const len = (p.value / total) * circ;
    const ring = svgEl("circle", {
      cx: c, cy: c, r, fill: "none", stroke: p.color, "stroke-width": stroke,
      "stroke-dasharray": `${Math.max(0, len - 2)} ${circ - Math.max(0, len - 2) + 2}`,
      "stroke-dashoffset": -offset, transform: `rotate(-90 ${c} ${c})`,
    });
    const title = svgEl("title", {});
    title.textContent = `${p.label}: ${Math.round((p.value / total) * 100)}%`;
    ring.appendChild(title);
    svg.appendChild(ring);
    offset += len;
  }
}
