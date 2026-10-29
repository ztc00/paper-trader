# How this tool is built

- Plain HTML, CSS and JavaScript. No frameworks, no libraries, no build step,
  no npm, nothing loaded from a CDN. Use the simplest code that works, and add
  nothing I did not ask for.
- The page calls CoinGecko and alternative.me directly from the browser. The
  one keyed API, GNews, is called only from `api/news.js`, the one function in
  `api/`. It reads the key from `process.env.GNEWS_API_KEY`. The key goes in
  no file in this repo, and everything else stays static.
- Every `fetch` sits inside `try/catch` and checks `response.ok`. Every
  section that fetches has an empty, loading, error and in-use state, as
  PRD.md describes. No mock or made-up data when a request fails: show the
  error.
- Files: `index.html`, `css/styles.css`, `js/app.js`, `api/news.js`. Styles
  follow DESIGN.md. If you need a color, font or size that is not in it, stop
  and tell me.
- All saved data lives in the `state` object in `js/app.js`. Every change goes
  through a function that updates it, saves, and calls `render()`. Prices,
  mood and news are kept in memory only.
- No `alert()`, `confirm()` or `prompt()`. Messages appear on the page.
- One feature per request, and tell me which lines you changed.
