// The one function in this project. It holds two keys that live only in
// Vercel's Environment Variables: GNEWS_API_KEY for the headlines and
// OPENROUTER_API_KEY (the class key) for a model's two-sentence read of them.
// The page calls /api/news?q=bitcoin. The Cache-Control header keeps the
// answer for an hour, so both keys are used at most once an hour per coin.

const MODEL = "deepseek/deepseek-v4.1-flash-1017"; // the only model the class key allows

export default {
  async fetch(request) {
    // Only letters, digits and spaces reach GNews, lowercased, so "Bitcoin",
    // "bitcoin " and "BITCOIN" share one cached answer and nothing odd can be
    // sent on through my key.
    const raw = new URL(request.url).searchParams.get("q") || "";
    const q = raw.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 30);
    if (!q) {
      return Response.json({ error: "Say which coin." }, { status: 400 });
    }

    const key = process.env.GNEWS_API_KEY;
    if (!key) {
      return Response.json({ error: "News is not set up yet." }, { status: 503 });
    }

    const url = "https://gnews.io/api/v4/search"
      + `?q=${encodeURIComponent(q + " crypto")}&lang=en&max=5&sortby=publishedAt&apikey=${encodeURIComponent(key)}`;

    const response = await fetch(url);
    if (!response.ok) {
      return Response.json({ error: `GNews answered ${response.status}` }, { status: 502 });
    }
    const data = await response.json();

    // Keep only articles with a real web link.
    const articles = (data.articles || [])
      .filter((a) => /^https?:\/\//.test(a.url || ""))
      .map((a) => ({
        title: a.title,
        url: a.url,
        source: a.source && a.source.name,
        publishedAt: a.publishedAt,
      }));

    const brief = articles.length ? await readHeadlines(q, articles.map((a) => a.title)) : null;

    // A missing brief is cached for only a minute, so a hiccup at the model
    // does not stick for an hour.
    const cache = brief || !articles.length
      ? "public, s-maxage=3600, stale-while-revalidate=600"
      : "public, s-maxage=60";
    return Response.json({ articles, brief, briefError: brief ? undefined : lastBriefError }, {
      headers: { "Cache-Control": cache },
    });
  },
};

// Ask the model for a two-sentence brief and a one-word sentiment. Answers
// null when there is no key or anything goes wrong, so the page still shows
// the headlines and my own word-list score.
let lastBriefError = null; // "unavailable" when the model read failed; details go to the log only

async function readHeadlines(coin, titles) {
  const key = process.env.OPENROUTER_API_KEY;
  lastBriefError = null;
  if (!key) { lastBriefError = "not set up"; return null; }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You read crypto headlines for a paper-trading tool. Answer with JSON only, no prose, in this shape: {\"brief\": \"two short sentences on what is moving the coin\", \"sentiment\": \"positive\" | \"mixed\" | \"negative\"}. Be concrete and neutral. Never give trading advice.",
          },
          { role: "user", content: `Coin: ${coin}\nHeadlines:\n${titles.map((t) => "- " + t).join("\n")}` },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) {
      console.error("openrouter", response.status, (await response.text()).slice(0, 300));
      lastBriefError = "unavailable";
      return null;
    }
    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) {
      console.error("openrouter empty answer", JSON.stringify(data).slice(0, 300));
      lastBriefError = "unavailable";
      return null;
    }
    // Take the first {...} in the answer, in case the model wrapped it in
    // prose or a code fence.
    const match = text.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : text);
    const sentiment = ["positive", "mixed", "negative"].includes(json.sentiment) ? json.sentiment : "mixed";
    return { text: String(json.brief || "").slice(0, 400), sentiment, model: MODEL };
  } catch (err) {
    console.error("openrouter read failed", err.message);
    lastBriefError = "unavailable";
    return null;
  }
}
