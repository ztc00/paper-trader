# Proposal: Paper Trader

## What I am building
A page where I can practice buying and selling crypto with fake money, using live prices, and see if I am actually making or losing money.

## Who it is for
Me. I trade and I want to test ideas and my own rules without putting real money on the line. It builds on my Trade Check project, which only tracked the result of trades I typed in. This one gets the prices itself.

## The API
### Main API: CoinGecko (prices)
CoinGecko, free, no key needed.
Docs: https://docs.coingecko.com/reference/coins-markets

URL I opened in the browser:
https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&price_change_percentage=24h,7d

It sends back a list, one object per coin. Fields I will use:
- `id` (e.g. "bitcoin") to ask for the coin again later
- `symbol` and `name` to show it
- `current_price`
- `price_change_percentage_24h`
- `price_change_percentage_7d_in_currency`
- `last_updated`

I will also use the search endpoint so I can type a name and find the coin's id:
https://api.coingecko.com/api/v3/search?query=sol

### Second API: GNews (news for the selected coin)
Docs: https://gnews.io/docs/v4
Needs a free key, so the key lives in one Vercel function in `api/` and the page calls that function instead of GNews directly. The function caches the answer for an hour, so the news updates hourly and I stay well under the 100 requests a day limit.

URL shape (key removed):
https://gnews.io/api/v4/search?q=bitcoin&lang=en&max=5&apikey=...

Fields I will use from each article: `title`, `source.name`, `url`, `publishedAt`.

### Third API: Crypto Fear & Greed Index (market sentiment)
Docs: https://alternative.me/crypto/fear-and-greed-index/
Free, no key. One number for the whole crypto market, updated once a day.

URL I opened in the browser:
https://api.alternative.me/fng/?limit=1

Fields I will use: `data[0].value` (0 to 100) and `data[0].value_classification` (e.g. "Neutral", "Extreme Fear").

## What the user chooses
- Which coin to look up (search by name).
- Buy or sell, and how many dollars.
- Starting balance, max trades per day, and daily loss limit (same idea as my Trade Check rules).

## What the page works out
- How many units a dollar amount buys at the current price.
- For each open position: what I paid, what it is worth now, and profit or loss in dollars and percent.
- Total portfolio value and total profit or loss since I started.
- Whether I am still allowed to trade today based on my rules, or blocked.
- A sentiment score for the news: each headline gets +1, 0 or -1 from a list of positive and negative words, and the page adds them up and labels the news positive, mixed or negative. No library, just my own word lists in JavaScript.

## Features
1. Search a coin and see its live price and 24h / 7d change.
2. Buy or sell a paper amount. Positions and cash are saved in localStorage so they survive a refresh.
3. Portfolio table with live value and P&L per position and in total.
4. Rules from Trade Check: trade count and daily loss limit, with the buy button disabled when I hit one.
5. Latest news for the coin I am looking at, refreshed every hour, so I can see what is moving the price.
6. A mood card: the Fear & Greed index and my headline sentiment score. If the market is in fear or the news is negative, a warning shows under the buy button. My rules block, the mood only warns.
7. Reset button to start over with a fresh balance.

## What I do not know yet
- How `fetch` with `async` and `await` works, and where the `try/catch` goes around it.
- How to check `response.ok` and show an error when CoinGecko is down or I am offline.
- How to refresh prices every so often without hitting the rate limit (CoinGecko allows about 30 calls a minute).
- How to show a loading state while the request runs.
- How to fetch prices for several coins in one request instead of one call per position.
- How to loop over the headlines and count matching words without making the code messy.
- How to write the Vercel function that holds the GNews key and caches the result for an hour, and how to deploy the whole project on Vercel instead of GitHub Pages.
