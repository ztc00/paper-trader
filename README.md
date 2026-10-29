# Paper Trader

Who opens this: me, about to test a trade idea with fake money, who needs the
live price and my own P&L in the first five seconds.

**Live:** https://paper-trader-virid.vercel.app/

## What it does

You search a coin, see its live price, and buy or sell a paper amount of it.
The page keeps your cash, positions and trades in your browser and works out
what every position is worth right now, your profit or loss on each one, and
your total since you started. Your Trade Check rules come along: a max number
of trades a day and a daily loss limit that block the Buy and Sell buttons
when you hit them.

Two more things sit next to the price. The Crypto Fear & Greed Index says what
mood the whole market is in. And the five latest headlines about the coin get
a sentiment score from my own word lists, so the page can tell you the news
reads positive, mixed or negative before you buy.

## The APIs

- **CoinGecko** (free, no key): https://docs.coingecko.com/reference/coins-markets
  - `GET /api/v3/search?query=sol` to find a coin by name.
  - `GET /api/v3/coins/markets?vs_currency=usd&ids=bitcoin,solana&price_change_percentage=24h,7d`
    for the price, 24h and 7d change of the selected coin and every coin I
    hold, in one request. Refreshed every 60 seconds.
- **Crypto Fear & Greed Index** by alternative.me (free, no key):
  https://alternative.me/crypto/fear-and-greed-index/
  - `GET https://api.alternative.me/fng/?limit=1` for today's number and label.
- **GNews** (free key, 100 requests a day): https://gnews.io/docs/v4
  - Called only from `api/news.js`, the one Vercel function. The page asks
    `/api/news?q=bitcoin`, the function adds the key from Vercel's settings
    and answers with a one-hour cache header, so the news updates hourly and
    the key is in no file in this repo.

## How to use it

1. Type a coin name under **Find a coin** and press Enter. Pick one of the
   matches. Its live price, 24h and 7d change appear, with the news under it
   and the mood beside it.
2. Type a dollar amount under **Buy** and press Enter or Buy. Cash goes down,
   a row appears in the portfolio. Buying more of the same coin updates its
   average price.
3. **Sell** a dollar amount, or **Sell all**. Cash comes back and the trade log
   shows the realized profit or loss on that sale.
4. Read the portfolio: value and P&L per coin and in total, and the header
   for your total since the start.
5. **Edit** the rules at the bottom: starting cash, max trades a day, daily
   loss limit. **Start over** puts cash back and clears positions and trades.

## Files

- `PROPOSAL.md`: what I planned before any code, in my words.
- `PRD.md`: the plan in detail, with every state of the page.
- `DESIGN.md`: colors, type and layout. The CSS only uses values from it.
- `AGENTS.md`: the rules the agent follows.
- `index.html`, `css/styles.css`, `js/app.js`: the page. Everything saved
  lives in `state` in `js/app.js`.
- `api/news.js`: the one function. It holds the GNews key and nothing else.

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
