// CoinGecko, through one cached function. CoinGecko's public API allows only
// a handful of calls a minute per address, so the page used to get 429s on
// its own. Here every visitor shares one cached answer per URL, and a free
// Demo key (COINGECKO_API_KEY in Vercel, never in the repo) raises the
// limit. Without the key the function answers 503 and the page calls
// CoinGecko directly, as it did before.
//   /api/crypto?op=tape                 top 10 with 7-day sparklines
//   /api/crypto?op=top                  top 50 with 7-day sparklines
//   /api/crypto?op=prices&ids=a,b       prices, changes and sparklines for ids
//   /api/crypto?op=chart&id=bitcoin&days=7
//   /api/crypto?op=search&q=sol

const BASE = "https://api.coingecko.com/api/v3";
const ID = /^[a-z0-9-]{1,60}$/;

function json(body, status, cache) {
  const headers = cache ? { "Cache-Control": cache } : {};
  return Response.json(body, { status: status || 200, headers });
}

async function gecko(path, key) {
  const r = await fetch(`${BASE}${path}`, { headers: { "x-cg-demo-api-key": key }, signal: AbortSignal.timeout(8000) });
  if (r.status === 429) return { status: 429 };
  if (!r.ok) return { status: r.status };
  return { status: 200, data: await r.json() };
}

export default {
  async fetch(request) {
    const key = process.env.COINGECKO_API_KEY;
    if (!key) return json({ error: "Crypto data is not set up yet." }, 503);
    const url = new URL(request.url);
    const op = url.searchParams.get("op");
    let path, cache;
    if (op === "tape") {
      path = "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true&price_change_percentage=24h,7d";
      cache = "public, s-maxage=120, stale-while-revalidate=600";
    } else if (op === "top") {
      path = "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h,7d";
      cache = "public, s-maxage=120, stale-while-revalidate=600";
    } else if (op === "prices") {
      const ids = [...new Set((url.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter((s) => ID.test(s)))].sort().slice(0, 50);
      if (!ids.length) return json({ error: "Say which coins." }, 400);
      path = `/coins/markets?vs_currency=usd&ids=${ids.join(",")}&sparkline=true&price_change_percentage=24h,7d`;
      cache = "public, s-maxage=60, stale-while-revalidate=300";
    } else if (op === "chart") {
      const id = url.searchParams.get("id") || "";
      const days = String(Number(url.searchParams.get("days")) || 7);
      if (!ID.test(id) || !["1", "7", "30", "365"].includes(days)) return json({ error: "Say which coin and range." }, 400);
      path = `/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      cache = "public, s-maxage=300, stale-while-revalidate=1800";
    } else if (op === "search") {
      const q = (url.searchParams.get("q") || "").toLowerCase().replace(/[^a-z0-9 .\-]/g, "").trim().slice(0, 30);
      if (!q) return json({ error: "Type a coin name." }, 400);
      path = `/search?query=${encodeURIComponent(q)}`;
      cache = "public, s-maxage=3600, stale-while-revalidate=86400";
    } else {
      return json({ error: "Say what you want: tape, top, prices, chart or search." }, 400);
    }
    try {
      const r = await gecko(path, key);
      if (r.status === 429) return json({ error: "CoinGecko is rate-limiting right now. Try again in a minute." }, 429, "public, s-maxage=20");
      if (r.status !== 200) return json({ error: `CoinGecko answered ${r.status}` }, 502);
      return json(r.data, 200, cache);
    } catch (err) {
      console.error("crypto", op, err.message);
      return json({ error: "CoinGecko did not answer." }, 502);
    }
  },
};
