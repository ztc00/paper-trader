# PRD: Paper Trader

## Goal

One page where I practice buying and selling crypto with fake money at live
prices, and see in dollars whether I am making or losing money, inside the
same kind of rules I set for myself in Trade Check.

## Audience and key action

Me, on a laptop or a phone, when I want to test a trade idea without risking
real money. Key action: search a coin, see its live price, and buy or sell a
paper amount. Second action: read the portfolio total and P&L.

## Features

Version 1 is one page, `index.html`, plus one Vercel function, `api/news.js`.
Top to bottom on a phone:

1. **Header.** The name, the portfolio value, and total P&L since the start
   in dollars and percent. Green when up, red when down.
2. **Find a coin.** A search box. Submit with Enter or the Search button. The
   page asks CoinGecko's search endpoint and shows up to five matches as
   buttons: name, symbol and market-cap rank. Picking one makes it the
   selected coin.
3. **The selected coin.** Name, symbol, live price in USD, 24h change and 7d
   change, from CoinGecko's `coins/markets` endpoint. Prices for the selected
   coin and every coin I hold come back in one request. They refresh every
   60 seconds while the page is open, with "Updated 12s ago" under the price.
4. **Trade.** Two forms side by side on a laptop, stacked on a phone.
   - Buy: a dollar amount, and a Buy button. The page works out units =
     dollars / price, takes the dollars from cash, and adds the units to the
     position. Buying more of a coin I hold updates its average price.
   - Sell: a dollar amount and a Sell button, plus Sell all. Units sold =
     dollars / price, capped at what I hold. Cash goes up, and the realized
     P&L of that sale, (price - average price) × units, is recorded on the
     trade.
   - Under the Buy button, a warning line from the mood card when the market
     is in fear or the news is negative. A warning does not block.
   - My rules can block. When blocked, both buttons are disabled and the
     reason is written where the warning goes: "5 of 5 trades today. Back
     tomorrow." or "Daily loss limit reached. Back tomorrow."
5. **Mood.** The Crypto Fear & Greed Index as a number out of 100 with its
   label, from alternative.me, and my headline sentiment: each headline in
   the news list scores +1, 0 or -1 against two short word lists in
   `js/app.js`, the scores are summed, and the news is labeled positive
   (sum ≥ 2), mixed, or negative (sum ≤ -2).
6. **News.** The five latest headlines about the selected coin, each with the
   source, how long ago, and a link. The page asks `/api/news?q=<coin name>`.
   The function adds the GNews key, which lives only in Vercel's settings,
   and answers with a one-hour cache header, so the news refreshes hourly and
   the key's 100 requests a day are never close to used up.
7. **Portfolio.** A table, one row per coin held: symbol, units, average
   price, current price, value, P&L in dollars and percent. A total row. Cash
   sits above the table.
8. **Trades.** The log, newest first: time, buy or sell, symbol, units, price,
   dollars, and realized P&L on sells.
9. **My rules.** Folded behind one line, with Edit: starting cash, max trades
   per day, daily loss limit in dollars (realized losses only). Save re-checks
   the block.
10. **Start over.** Puts cash back to the starting amount and clears
    positions and trades, in one tap. Rules stay.

Defaults: $10,000 starting cash, 5 trades a day, $500 daily loss limit.

Layout in words (my sketch): on a phone, header, search, the selected coin,
trade, mood, news, portfolio, trades, rules, start over, in that order. What
a phone shows before scrolling: the portfolio value, the search box and the
selected coin's price. On a laptop, two columns: left is search, the coin,
trade and mood; right is news, portfolio and trades. The price is the
biggest number on the page.

## Version 2, added 2026-10-29

After version 1 worked end to end, I asked for the tool to stop being basic.
Everything below is built on the same `state` and the same rules.

11. **Live prices.** The browser opens Coinbase's public ticker feed
    (`wss://ws-feed.exchange.coinbase.com`, no key) for the selected coin,
    every coin I hold and the tape. Prices tick in real time, the price
    flashes green or red on each move, and P&L updates live. Coins Coinbase
    does not list keep the 60-second CoinGecko price. The line under the
    price says which one is feeding it.
12. **Tape.** A strip under the header with the top 10 coins by market cap:
    symbol, live price, 24h change and a 7-day sparkline. Click one to select
    it. Refreshed every 60 seconds from CoinGecko.
13. **Chart.** The selected coin's price over 1D, 7D, 30D or 1Y from
    CoinGecko's `market_chart`, drawn as inline SVG with a hover crosshair and
    readout, faint grid lines with prices, and my own buys and sells marked
    as green and red dots. The live price is the last point. Cached five
    minutes per coin and range.
14. **Orders.** Limit buy ("buy $X when it drops to P"), stop-loss and
    take-profit ("sell all if it falls to / rises to P") on the selected
    coin. Checked on every live tick and every poll, filled at the price that
    crossed, logged with the order type. My rules hold an order until
    tomorrow when they block. Cancel from the list.
15. **Position size by my rules.** Two more rules: risk per trade as a % of
    cash, and the stop distance in %. The Buy label shows the size they
    imply, cash × risk% ÷ stop%, with a Use button that fills the field.
16. **Performance.** An equity curve of portfolio value over time (one point a
    minute at most, plus one per trade, capped at 1,000 points), and stats
    worked out from the log: realized and unrealized P&L, win rate, average
    win and loss, profit factor, best and worst trade, max drawdown.
17. **Export.** The trade log as a CSV file, from the browser, no server.
18. **AI read.** The news function also asks a model, through the class
    OpenRouter key, for a two-sentence brief and a one-word sentiment on the
    five headlines, and the page shows it beside my own word-list score so
    the two can be compared. The model's answer is cached with the news for
    an hour. Without the key the headlines and my score still show.

19. **Stocks.** A Crypto / Stocks toggle beside the search. On Stocks, the
    search, tape, price, chart and news come from `api/stocks.js`, the second
    function: Finnhub (key in Vercel as `FINNHUB_API_KEY`) for search, quotes
    and company news, Twelve Data (`TWELVEDATA_API_KEY`) for price history.
    Finnhub's live feed is not used because its key would have to sit in the
    page, so stock quotes are polled every 15 seconds through the function
    and the line under the price says so. The stock tape is ten fixed
    tickers (SPY, QQQ, AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD) with
    today's move, no sparkline. A stock's id is `stock:AAPL`, so positions,
    orders, the log and performance work across both markets in one
    portfolio. Mood on Stocks is the S&P 500's move today from the SPY quote.

20. **Pages.** Four pages share one saved state through `js/shared.js`:
    the Desk (`index.html`), **Markets** (`markets.html`: the top 50 coins
    with sparklines and the big US tickers, click a row to trade it on the
    Desk), **Portfolio** (`portfolio.html`: value, cash, since-start and
    today's realized cards, an allocation donut, every position with cost,
    weight, today's move and P&L, pending orders, and the performance panel),
    and **Trades** (`trades.html`: the whole log grouped by day with a total
    per day, filters by side, asset and text, and the CSV export). The header
    on every page carries the nav and the portfolio total. A change on one
    page reaches the others through the browser's storage event, so two tabs
    stay in step.
21. **Light and dark.** A button in the header. The first visit follows the
    system setting; the choice is saved on its own key so Start over never
    touches it. Charts redraw in the new colors.
22. **Charts, second pass.** Drawn at the element's real pixel width, so
    text and strokes are the same size on every screen, and redrawn on
    resize. Smooth lines, a faded area under them, the values in a right
    gutter, a dashed line and tag at the last value, a dashed baseline at
    the starting cash on the equity curve, and a boxed readout on hover.

States for the new parts:

- **Live:** "Live · Coinbase · 0s ago" with a green dot when ticks arrive;
  "Updated 12s ago · CoinGecko" otherwise. If the feed drops, it reconnects
  on its own, waiting longer each time up to 30 seconds, and the page falls
  back to the poll meanwhile.
- **Tape loading:** "Loading the top coins…"; **error:** "Could not load the
  top coins." and the strip stays as it was.
- **Chart loading:** "Loading…" beside the range buttons; **error:** "Chart
  is not available right now." and the old chart stays.
- **Orders invalid:** "Enter a price above 0.", "That is above the price now,
  $X. Just buy.", "A stop goes below the price now, $X.", "A take-profit goes
  above the price now, $X.", "You do not hold any BTC.", and the cash check.
- **Performance empty:** the curve is a flat line at the starting cash and the
  stats show "—" until there is a sell.
- **AI read missing:** the block is hidden; the headlines and my score show.
- **Portfolio empty:** "All cash. Nothing held yet." and "No positions yet."
  with the cards still showing cash and the total. **Trades empty:** "No
  trades yet. Make one on the Desk." and the filters hidden. **Markets
  loading / error:** "Loading…" under each heading, then the table, or a
  red line saying which source did not load, and the other table still
  works.
- **Stocks not set up:** without the Finnhub key, search, price and news say
  "Stocks are not set up yet."; without the Twelve Data key the chart says
  "Charts for stocks are not set up yet." and everything else works. An
  unknown ticker: "Finnhub has no price for that symbol." Outside market
  hours the price stands still and still says when it was last checked.

## Content and data

- Have: the three API URLs and the fields I use (in PROPOSAL.md), the rule
  defaults, the two word lists, every message in States.
- Data: one `state` object in `js/app.js` with `cash`, `startingCash`,
  `positions`, `trades`, `rules`, `selected` (the coin id), saved to
  localStorage under one key. Prices, mood and news are fetched and kept in
  memory only; they are not saved.
- Missing: the GNews key. I create it at gnews.io and paste it into Vercel's
  Environment Variables as `GNEWS_API_KEY`. It is in no file in the repo.

## Look

Follows DESIGN.md.

## States

- **Empty:** first visit. Portfolio value $10,000, P&L $0. The coin section
  says "Search a coin to start, like bitcoin or sol." The trade forms are
  disabled until a coin is selected. Portfolio says "No positions yet." The
  trades log says "No trades yet." News says "Pick a coin to see its news."
  A search with no matches says "No coin called that. Try the full name."
- **Loading:** while a search, price, mood or news request runs, that
  section shows "Loading…" in muted text in place of its content. Buttons
  that would send the same request again are disabled. Nothing else moves.
- **Error:** when a request fails, or answers with an error, that section
  shows the message in the error color with a Retry button: "Could not reach
  CoinGecko. Check your connection and retry." "News is not available right
  now." "Mood is not available right now." If the news function has no key
  it answers 503 and the page shows "News is not set up yet." The rest of
  the page keeps working with what it has. If the price request fails while
  I hold coins, the portfolio keeps the last prices and the "Updated" line
  says when.
- **Invalid input:** the message appears under the field, nothing happens.
  - Buy or sell empty, not a number, or zero or less: "Enter a dollar amount
    above 0, like 250."
  - Buy more than cash: "You have $1,234.56 in cash."
  - Sell more than the position is worth: "You hold $432.10 of BTC."
  - Sell with no position: "You do not hold any BTC."
  - A rule that is empty, zero, negative, or not a whole number: "Use a whole
    number above 0." under that rule.
  - An empty search: "Type a coin name."
- **In use (ideal):** the selected coin with its price, both forms live, the
  mood card, five headlines with the sentiment label, the portfolio with
  P&L, the trades log.
- **Blocked:** same layout, both trade buttons disabled, the reason under
  them. Lifts at midnight, or when the rules change.
- **Partial:** a coin that CoinGecko returns without a 7d change shows "—"
  in that spot. News with fewer than five articles shows what there is.

## Checks

1. On a first visit, search "bitcoin", pick it, and the live price appears.
2. Buy $500 of it. Cash drops by $500, a position row appears, and the
   portfolio value stays $10,000 (minus nothing, since the price has not
   moved).
3. Sell all. The position disappears, cash comes back, and the trade log shows
   both trades with the realized P&L on the sale.
4. Type "abc" or "-5" in Buy and the message appears under the field, and
   nothing changes. Set max trades to 1 and the second trade is blocked.
5. Refresh. Cash, positions, trades and rules are still there. News shows
   five headlines with a sentiment label, and the mood shows a number.
6. Turn the network off in DevTools and search. The error message and Retry
   appear, and the portfolio is still readable.

## Out of scope

Real money, broker connections, logins, short selling, options. No
frameworks, no libraries, nothing from a CDN.

## Later

- Short selling.
- Live stock ticks, if a feed that works without exposing a key turns up.
- Candlesticks instead of a line.
- A watchlist of my own coins, not only the top 10.
- Trailing stops.
