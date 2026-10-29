// The one function in this project. It holds the GNews key, which lives in
// Vercel's Environment Variables as GNEWS_API_KEY and in no file here.
// The page calls /api/news?q=bitcoin and gets back five trimmed headlines.
// The Cache-Control header keeps the answer for an hour, so the news updates
// hourly and the key's 100 requests a day are never close to used up.

export default {
  async fetch(request) {
    const q = new URL(request.url).searchParams.get("q");
    if (!q || q.length > 60) {
      return Response.json({ error: "Say which coin." }, { status: 400 });
    }

    const key = process.env.GNEWS_API_KEY;
    if (!key) {
      return Response.json({ error: "News is not set up yet." }, { status: 503 });
    }

    const url = "https://gnews.io/api/v4/search"
      + `?q=${encodeURIComponent(q + " crypto")}&lang=en&max=5&sortby=publishedAt&apikey=${key}`;

    const response = await fetch(url);
    if (!response.ok) {
      return Response.json({ error: `GNews answered ${response.status}` }, { status: 502 });
    }
    const data = await response.json();

    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source && a.source.name,
      publishedAt: a.publishedAt,
    }));

    return Response.json({ articles }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  },
};
