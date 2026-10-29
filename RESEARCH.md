# What the real paper-trading tools do

Looked at on 2026-10-29, before the version 4 rebuild of the trading flow.
The desk up to version 3 traded in dollars with two separate forms and a
third for orders, filled everything at the last price with no spread, no
fees and no confirmation, and had no order history, no watchlist and no
way to close a position in one click. None of the tools below work like
that. What they share, and what version 4 takes from each:

## TradingView Paper Trading
https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/

- One order ticket: Market, Limit and Stop orders, with size in units.
- Tabs for Positions, Orders, and a History of filled, rejected and
  cancelled orders, plus an account history of closed positions with
  realized P&L and a trading journal.
- Setup: starting balance, commission type and value, several accounts.
- Taken: the ticket, the working / history split, commissions as a setting,
  the journal.

## thinkorswim paperMoney (Schwab)
https://www.schwab.com/content/thinkorswim-papermoney-stock-trading-simulator

- Order types Market, Limit, Stop, Stop-limit, Trailing stop; time in force
  Day or Good Till Cancel. The ticket opens from the quote.
- A confirmation step before the order goes out, showing the buying-power
  effect and the resulting buying power.
- Positions can be closed from the positions list with one action.
- Taken: every order type and time in force, the review step with the
  buying-power effect, Close on each position.

## Webull paper trading
https://www.webull.com/help/faq/298-What-types-of-orders-can-I-place-on-Webull

- Market, Limit, Stop, Stop-limit, Trailing stop. Market orders fill only
  in regular hours; stop orders wait for their trigger.
- Watchlists that stay the same across devices; Reset to start fresh.
- Taken: the watchlist, the same order set, Reset kept as Start over.

## Exchange demos (Binance Mock Trading, Bitget demo)
https://www.bitget.cloud/academy/crypto-demo-trading

- Virtual USDT, spot and futures, the same ticket as the live exchange.
- Taken: nothing new; it confirms units, not dollars, as the size.

## What makes a simulator honest
https://fxreplay.com/learn/trading-simulator-for-futures-what-to-know and
https://tapeboard.com/manual/simulator

- Buy at the ask, sell at the bid, never at the last print. Slippage grows
  with size and speed. Fees belong in every fill. A ticket should show the
  likely fill before you submit. "The strongest sign of quality is that its
  P&L looks worse than a frictionless demo."
- Taken: fills at bid or ask (Coinbase's feed carries both for crypto; stocks
  get a small simulated spread), slippage and commission as two settings
  that default to a small slippage and no commission, and the estimate on
  the ticket.

## Not taken, and why

- Level 2, replay, leverage, margin rules, short selling: each needs data or
  rules that would double the code before the demo. Short selling is on the
  Later list.
- Multiple accounts and leaderboards: a leaderboard needs a server.
