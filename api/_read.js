// Shared by news.js and stocks.js: ask the model, through the class
// OpenRouter key, for a two-sentence brief and a one-word sentiment on a few
// headlines. Answers null when there is no key or anything goes wrong, so the
// page still shows the headlines and my own word-list score. Files in api/
// that start with an underscore are helpers, not routes.

export const MODEL = "deepseek/deepseek-v4.1-flash-1017"; // the only model the class key allows

export async function readHeadlines(subject, titles) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
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
            content: "You read market headlines for a paper-trading tool. Answer with JSON only, no prose, in this shape: {\"brief\": \"two short sentences on what is moving the price\", \"sentiment\": \"positive\" | \"mixed\" | \"negative\"}. Be concrete and neutral. Never give trading advice.",
          },
          { role: "user", content: `Subject: ${subject}\nHeadlines:\n${titles.map((t) => "- " + t).join("\n")}` },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) {
      console.error("openrouter", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) {
      console.error("openrouter empty answer", JSON.stringify(data).slice(0, 300));
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
    return null;
  }
}

// Cache an answer for an hour when it is complete, a minute when the model
// read is missing, so a hiccup does not stick.
export function cacheFor(brief, articles) {
  return brief || !articles.length
    ? "public, s-maxage=3600, stale-while-revalidate=600"
    : "public, s-maxage=60";
}
