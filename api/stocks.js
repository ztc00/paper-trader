// Stocks. Holds two keys that live only in Vercel's Environment Variables:
// FINNHUB_API_KEY for search, quotes and company news, and
// TWELVEDATA_API_KEY for price history. Finnhub's live feed is not used
// because its key would have to sit in the page, so quotes are polled here.
// One function, four jobs, picked by ?op=:
//   /api/stocks?op=search&q=apple
//   /api/stocks?op=quote&symbols=AAPL,MSFT
//   /api/stocks?op=chart&symbol=AAPL&days=7
//   /api/stocks?op=news&symbol=AAPL

import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { readHeadlines, cacheFor } from "./_read.js";

const FINNHUB = "https://finnhub.io/api/v1";
const TWELVE = "https://api.twelvedata.com";

const SYMBOL = /^[A-Z][A-Z0-9.\-]{0,9}$/; // AAPL, BRK.B, SPY

function json(body, status, cache) {
  const headers = cache ? { "Cache-Control": cache } : {};
  return Response.json(body, { status: status || 200, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get("op");
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return json({ error: "Stocks are not set up yet." }, 503);

    try {
      if (op === "search") return await search(url.searchParams.get("q") || "", key);
      if (op === "quote") return await quote(url.searchParams.get("symbols") || "", key);
      if (op === "chart") return await chart(url.searchParams.get("symbol") || "", url.searchParams.get("days") || "7");
      if (op === "news") return await news(url.searchParams.get("symbol") || "", key);
      return json({ error: "Say what you want: search, quote, chart or news." }, 400);
    } catch (err) {
      console.error("stocks", op, err.message);
      return json({ error: "Finnhub or Twelve Data did not answer." }, 502);
    }
  },
};

async function search(raw, key) {
  const q = raw.toLowerCase().replace(/[^a-z0-9 .\-]/g, "").trim().slice(0, 30);
  if (!q) return json({ error: "Type a company or ticker." }, 400);
  const r = await fetch(`${FINNHUB}/search?q=${encodeURIComponent(q)}&exchange=US&token=${encodeURIComponent(key)}`);
  if (!r.ok) return json({ error: `Finnhub answered ${r.status}` }, 502);
  const data = await r.json();
  // Plain US stocks and ETFs only: no warrants, no units, no odd tickers.
  const matches = (data.result || [])
    .filter((m) => SYMBOL.test(m.symbol) && /^(Common Stock|ETP|ETF)$/i.test(m.type || ""))
    .slice(0, 5)
    .map((m) => ({ symbol: m.symbol, name: m.description, type: m.type }));
  return json({ matches }, 200, "public, s-maxage=3600");
}

async function quote(raw, key) {
  // Sorted, so "AAPL,MSFT" and "MSFT,AAPL" share one cached answer.
  const symbols = [...new Set(raw.toUpperCase().split(",").map((s) => s.trim()).filter((s) => SYMBOL.test(s)))].sort().slice(0, 15);
  if (!symbols.length) return json({ error: "Say which symbols." }, 400);
  const quotes = {};
  await Promise.all(symbols.map(async (s) => {
    const r = await fetch(`${FINNHUB}/quote?symbol=${encodeURIComponent(s)}&token=${encodeURIComponent(key)}`);
    if (!r.ok) return;
    const d = await r.json();
    if (!d.c) return; // unknown symbol answers zeros
    quotes[s] = { price: d.c, changePct: d.dp, prevClose: d.pc, high: d.h, low: d.l, at: d.t * 1000 };
  }));
  // Fifteen seconds, so a page polling every 15s and ten visitors share calls.
  return json({ quotes }, 200, "public, s-maxage=15");
}

// Price history from Twelve Data: 5-minute bars for a day, hourly for a
// week, daily beyond. Points come back oldest first as [timeMs, close].
async function chart(symbol, daysRaw) {
  const s = symbol.toUpperCase();
  if (!SYMBOL.test(s)) return json({ error: "Say which symbol." }, 400);
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return json({ error: "Charts for stocks are not set up yet." }, 503);
  const days = Number(daysRaw);
  const [interval, size] = days <= 1 ? ["5min", 80] : days <= 7 ? ["1h", 50] : days <= 30 ? ["1day", 23] : ["1day", 252];
  const r = await fetch(`${TWELVE}/time_series?symbol=${encodeURIComponent(s)}&interval=${interval}&outputsize=${size}&timezone=America/New_York&apikey=${encodeURIComponent(key)}`);
  if (!r.ok) return json({ error: `Twelve Data answered ${r.status}` }, 502);
  const data = await r.json();
  if (data.status === "error" || !Array.isArray(data.values)) {
    console.error("twelvedata", JSON.stringify(data).slice(0, 200));
    return json({ error: "No chart for that symbol." }, 404);
  }
  const points = data.values
    .map((v) => [Date.parse(v.datetime.length === 10 ? `${v.datetime}T16:00:00-04:00` : `${v.datetime.replace(" ", "T")}-04:00`), Number(v.close)])
    .filter(([t, c]) => Number.isFinite(t) && Number.isFinite(c))
    .reverse();
  return json({ points }, 200, "public, s-maxage=300");
}

// The cache key is the symbol alone, so one model call an hour per ticker.
async function news(symbol, key) {
  const s = symbol.toUpperCase();
  if (!SYMBOL.test(s)) return json({ error: "Say which symbol." }, 400);
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const day = (d) => d.toISOString().slice(0, 10);
  const r = await fetch(`${FINNHUB}/company-news?symbol=${encodeURIComponent(s)}&from=${day(from)}&to=${day(to)}&token=${encodeURIComponent(key)}`);
  if (!r.ok) return json({ error: `Finnhub answered ${r.status}` }, 502);
  const data = await r.json();
  const articles = (Array.isArray(data) ? data : [])
    .filter((a) => /^https?:\/\//.test(a.url || "") && a.headline)
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 5)
    .map((a) => ({
      title: a.headline, url: a.url, source: a.source,
      image: /^https:\/\//.test(a.image || "") ? a.image : null,
      publishedAt: new Date(a.datetime * 1000).toISOString(),
    }));
  // Finnhub often sends the publisher's logo as the image. When the same
  // image repeats, open each article and read its own preview picture.
  const counts = {};
  for (const a of articles) if (a.image) counts[a.image] = (counts[a.image] || 0) + 1;
  await Promise.all(articles.map(async (a) => {
    if (a.image && counts[a.image] === 1) return;
    const og = await previewImage(a.url);
    if (og) a.image = og;
  }));

  const brief = articles.length ? await readHeadlines(`the stock ${s}`, articles.map((a) => a.title)) : null;
  return json({ articles, brief, briefError: brief ? undefined : "unavailable" }, 200, cacheFor(brief, articles));
}

// Only a public https page is worth opening: no plain http, no IP literal,
// no local or internal names, no credentials, no odd port.
function safeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    const h = u.hostname.toLowerCase().replace(/\.+$/, "");
    if (/^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h) || !h.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

// The picture in a page's <meta og:image> tag, read once from the <head>.
// Each tag is matched on its own with a bounded pattern, so a big page
// cannot make the scan slow.
function imageFromHead(html) {
  for (const tag of html.match(/<meta\b[^>]{0,1000}>/gi) || []) {
    if (!/(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["']/i.test(tag)) continue;
    const m = tag.match(/content=["']([^"']{1,2000})["']/i);
    if (m && safeUrl(m[1])) return m[1];
  }
  return null;
}

// Every special-purpose range, from Node's own BlockList: private, loopback,
// link-local, carrier-NAT, documentation, benchmarking, multicast, and the
// IPv6 forms that carry an IPv4 address inside (mapped, compatible, NAT64,
// 6to4, Teredo). Anything in here is never fetched, whatever name pointed
// at it.
const BLOCKED = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
]) BLOCKED.addSubnet(addr, bits, "ipv4");
for (const [addr, bits] of [
  ["::", 128], ["::1", 128], ["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) BLOCKED.addSubnet(addr, bits, "ipv6");

function privateAddress(ip) {
  // An IPv4 address mapped into IPv6 (::ffff:a.b.c.d or ::ffff:hhhh:hhhh)
  // is judged as that IPv4 address. (The mapped range itself cannot go in
  // the BlockList: Node then treats every plain IPv4 address as blocked.)
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i) || ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mapped) {
    const v4 = mapped[2] ? [parseInt(mapped[1], 16) >> 8, parseInt(mapped[1], 16) & 255, parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255].join(".") : mapped[1];
    return privateAddress(v4);
  }
  const family = net.isIPv4(ip) ? "ipv4" : net.isIPv6(ip) ? "ipv6" : null;
  if (!family) return true; // not an address at all: refuse
  return BLOCKED.check(ip, family);
}

// Resolve the name, refuse it if any answer is private, and hand the one
// checked address to the socket, so a later DNS answer cannot move it.
function pinnedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => privateAddress(a.address))) {
      return callback(new Error("address not allowed"));
    }
    // Node asks for the whole list when it picks the family itself.
    const ordered = addresses.filter((a) => a.family === 4).concat(addresses.filter((a) => a.family !== 4));
    if (options && options.all) return callback(null, ordered);
    callback(null, ordered[0].address, ordered[0].family);
  });
}

// The og:image of a page: the picture a link to it shows in a chat. Uses
// Node's https client because Yahoo's response headers are too big for
// fetch. Follows up to five redirects, each checked, reads at most 400 KB,
// stops at the end of <head>, and gives up after four seconds.
function previewImage(rawUrl, hops = 0) {
  return new Promise((resolve) => {
    const url = safeUrl(rawUrl);
    if (!url || hops > 5) return resolve(null);
    let done = false, req = null;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); if (req) req.destroy(); resolve(v); } };
    const timer = setTimeout(() => finish(null), 4000);
    req = https.get(url, { maxHeaderSize: 262144, lookup: pinnedLookup, headers: { "User-Agent": "Mozilla/5.0 (compatible; PaperTrader/1.0)", Accept: "text/html" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = safeUrl(res.headers.location, url); // its own try/catch handles a bad Location
        done = true; clearTimeout(timer);
        return next ? previewImage(next, hops + 1).then(resolve) : resolve(null);
      }
      if (res.statusCode !== 200 || !/text\/html/i.test(res.headers["content-type"] || "")) { res.resume(); return finish(null); }
      const chunks = []; let size = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        if (chunk.includes("</head>") || size > 400000) finish(imageFromHead(chunks.join("").slice(0, 400000)));
      });
      res.on("end", () => finish(imageFromHead(chunks.join("").slice(0, 400000))));
      res.on("error", () => finish(null));
    });
    req.on("error", () => finish(null));
  });
}
