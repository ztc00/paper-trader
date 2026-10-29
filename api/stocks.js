// Stocks. Holds two keys that live only in Vercel's Environment Variables:
// FINNHUB_API_KEY for search, quotes and company news, and
// TWELVEDATA_API_KEY for price history. Finnhub's live feed is not used
// because its key would have to sit in the page, so quotes are polled here.
// One function, four jobs, picked by ?op=:
//   /api/stocks?op=search&q=apple
//   /api/stocks?op=quote&symbols=AAPL,MSFT
//   /api/stocks?op=chart&symbol=AAPL&days=7
//   /api/stocks?op=news&symbol=AAPL&name=Apple

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
      if (op === "news") return await news(url.searchParams.get("symbol") || "", url.searchParams.get("name") || "", key);
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
  const symbols = [...new Set(raw.toUpperCase().split(",").map((s) => s.trim()).filter((s) => SYMBOL.test(s)))].slice(0, 15);
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

async function news(symbol, name, key) {
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
    .map((a) => ({ title: a.headline, url: a.url, source: a.source, publishedAt: new Date(a.datetime * 1000).toISOString() }));
  const subject = name ? `${name} (${s})` : s;
  const brief = articles.length ? await readHeadlines(subject, articles.map((a) => a.title)) : null;
  return json({ articles, brief, briefError: brief ? undefined : "unavailable" }, 200, cacheFor(brief, articles));
}
