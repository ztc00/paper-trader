# How this tool is built

- Plain HTML, CSS and JavaScript. No frameworks, no libraries, no build step,
  no npm, nothing loaded from a CDN. Use the simplest code that works, and add
  nothing I did not ask for.
- The page calls CoinGecko, alternative.me and Coinbase's public ticker feed
  directly from the browser. Every keyed API is called only from `api/`:
  `news.js` (GNews, OpenRouter) and `stocks.js` (Finnhub, Twelve Data,
  OpenRouter), with the model call shared in `_read.js`. Keys come from
  `process.env` only. No key goes in any file in this repo, and everything
  else stays static.
- Every `fetch` sits inside `try/catch` and checks `response.ok`. Every
  section that fetches has an empty, loading, error and in-use state, as
  PRD.md describes. No mock or made-up data when a request fails: show the
  error.
- Files: `index.html` with `js/app.js` (the desk), `markets.html` with
  `js/markets.js`, `portfolio.html` with `js/portfolio.js`, `trades.html`
  with `js/trades.js`, and shared by all of them `js/shared.js` (state,
  formatting, helpers, quotes, theme, nav), `js/charts.js` (SVG charts),
  `js/live.js` (the Coinbase ticker feed, desk only), `css/styles.css`,
  `api/news.js`, `api/stocks.js`, `api/_read.js`. Styles follow DESIGN.md. If you need a color, font
  or size that is not in it, stop and tell me.
- All saved data lives in the `state` object in `js/shared.js`. Only the
  desk changes it; the other pages read it. Every change goes through a
  function that updates it, saves, and calls `render()`. Prices, mood and
  news are kept in memory only.
- No `alert()`, `confirm()` or `prompt()`. Messages appear on the page.
- One feature per request, and tell me which lines you changed.
