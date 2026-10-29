# Paper Trader

Who opens this: me, about to test a trade idea with fake money, who needs the
live price and my own P&L in the first five seconds.

**Live:** https://paper-trader-virid.vercel.app/

## What it does

You search a coin or a US stock, or pick one off the tape, and buy or sell a
paper amount of it at the live price. Prices tick in real time from
Coinbase's public feed, so your P&L moves while you watch. The page keeps
your cash, positions, orders and trades in your browser and works out what
every position is worth right now, your profit or loss on each one, and your
total since you started.

Your Trade Check rules come along and grow: a max number of trades a day and
a daily loss limit that block the Buy and Sell buttons when you hit them, plus
a risk per trade and a stop distance that turn into a suggested position
size with one click.

Around the price: a chart over 1D to 1Y with a hover readout and your own
trades marked on it; limit, stop-loss and take-profit orders that fill on the
live price; a performance panel with an equity curve, win rate, profit factor
and max drawdown; and a CSV export of the log.

Two more things sit next to the price. The Crypto Fear & Greed Index says what
mood the whole market is in. And the five latest headlines about the coin get
a sentiment score from my own word lists, so the page can tell you the news
reads positive, mixed or negative before you buy. A model reads the same five
headlines through the class OpenRouter key and gives a two-sentence brief and
its own sentiment, shown beside mine so the two can be compared.

## The APIs

- **CoinGecko** (free, no key): https://docs.coingecko.com/reference/coins-markets
  - `GET /api/v3/search?query=sol` to find a coin by name.
  - `GET /api/v3/coins/markets?vs_currency=usd&ids=bitcoin,solana&price_change_percentage=24h,7d`
    for the price, 24h and 7d change of the selected coin and every coin I
    hold, in one request. Refreshed every 60 seconds.
- **Crypto Fear & Greed Index** by alternative.me (free, no key):
  https://alternative.me/crypto/fear-and-greed-index/
  - `GET https://api.alternative.me/fng/?limit=1` for today's number and label.
- **Coinbase Exchange ticker feed** (free, no key, WebSocket):
  https://docs.cdp.coinbase.com/exchange/docs/websocket-overview
  - `wss://ws-feed.exchange.coinbase.com`, channel `ticker`, one product per
    subscribe message, so a coin Coinbase does not list only rejects itself.
- **GNews** (free key, 100 requests a day): https://gnews.io/docs/v4
  - Called only from `api/news.js`, the one Vercel function. The page asks
    `/api/news?q=bitcoin`, the function adds the key from Vercel's settings
    and answers with a one-hour cache header, so the news updates hourly and
    the key is in no file in this repo.
- **Finnhub** (free key): https://finnhub.io/docs/api
  - Called only from `api/stocks.js`: symbol search, quotes polled every 15
    seconds, and company news. Its WebSocket is not used because the key
    would have to sit in the page.
- **Twelve Data** (free key, 800 calls a day): https://twelvedata.com/docs
  - Called only from `api/stocks.js` for the stock chart, cached five minutes.
- **OpenRouter** (the class key, one model): https://openrouter.ai/docs
  - Called from the same function, right after GNews, with the five
    headlines. Cached with them for an hour. Without the key the page still
    shows the headlines and my own score.

## How to use it

1. Pick **Crypto** or **Stocks**, then type a name or ticker and press Enter,
   or click one on the tape. Its live price, 24h and 7d change and chart appear, with the
   news on the right and the mood under the trade forms.
2. Type a dollar amount under **Buy** and press Enter or Buy. Cash goes down,
   a row appears in the portfolio. Buying more of the same coin updates its
   average price.
3. **Sell** a dollar amount, or **Sell all**. Cash comes back and the trade log
   shows the realized profit or loss on that sale.
4. Read the portfolio: value and P&L per coin and in total, and the header
   for your total since the start.
5. Place an **order** instead of trading now: buy when the price drops to a
   level, or sell all if it falls to a stop or rises to a target. It fills
   on the live price and shows up in the log with its type.
6. Read **Performance** for the equity curve and the numbers behind it, and
   **Export CSV** to take the log elsewhere.
7. **Edit** the rules at the bottom: starting cash, max trades a day, daily
   loss limit, risk per trade and stop distance. **Start over** puts cash
   back and clears positions, orders and trades.

## Files

- `PROPOSAL.md`: what I planned before any code, in my words.
- `PRD.md`: the plan in detail, with every state of the page.
- `DESIGN.md`: colors, type and layout. The CSS only uses values from it.
- `AGENTS.md`: the rules the agent follows.
- `index.html`, `css/styles.css`, `js/app.js`: the page. Everything saved
  lives in `state` in `js/app.js`.
- `js/live.js`: the Coinbase ticker feed, with reconnects.
- `js/charts.js`: the price chart, the equity curve and the sparklines, as
  inline SVG.
- `api/news.js`: crypto news through GNews, with the model's read.
- `api/stocks.js`: stock search, quotes, chart and news through Finnhub and
  Twelve Data, with the model's read.
- `api/_read.js`: the model call both functions share. Underscore files in
  `api/` are helpers, not routes.

## Every state

- **Empty:** first visit, no coin picked, no positions, no trades. Each section
  says so in words.
- **Loading:** "Loading…" in muted text where the content will go, and the
  button that would repeat the request is disabled.
- **Error:** the message in red with a Retry button, per section. The rest of
  the page keeps working. Turn the network off in DevTools and search to see
  it. If the news key is missing, the function answers 503 and the page says
  "News is not set up yet."
- **Invalid input:** the message under the field, nothing saved. Empty, text,
  zero, more than your cash, more than you hold.
- **In use:** the price, both forms, the mood, five headlines with their
  scores, the portfolio and the log.

## Design direction

I built three throwaway pages with the same content and three looks, in
commit `57e9b2f`: a light broker app with cards, a dark terminal desk, and a
white editorial page with serif type. The desk stayed. It uses the same
surface and signal colors as Trade Check, so the two tools read as one set.
DESIGN.md was committed (`c2d2517`) before any CSS was written.

## Where it differed from what I expected

I expected to need one price request per coin I hold. CoinGecko's
`coins/markets` endpoint takes a list of ids, so the selected coin and every
position come back in one request, and the refresh timer makes one call a
minute no matter how many coins I own.

## The required question

**Pick one piece of AI output I did not accept as-is. What did it give me,
what did I change, and how did I know it needed changing? Point at the commit.**

[Zayd: write this after your review, about the commit where you changed
something the agent built. Say what it gave you, what you changed, and how you
knew. One candidate from the build: the first search results (commit
`588aee3`) put the coin names from CoinGecko into the page with `innerHTML`,
which would run anything the API sent. That was changed to `textContent` in
commit `51a6feb` after a review of the commit, before the news headlines, which
are the same kind of outside text, were added.]
