---
version: alpha
name: Paper Trader
colors:
  bg: "#0B0F0D"
  surface: "#121816"
  well: "rgba(255, 255, 255, 0.06)"
  edge: "rgba(255, 255, 255, 0.16)"
  hairline: "rgba(255, 255, 255, 0.08)"
  text: "#E8EDEA"
  text-muted: "#93A39B"
  up: "#3DF28A"
  down: "#FF4B3E"
  warn: "#FFB01F"
  on-up: "#07110B"
typography:
  price:
    fontFamily: '"DIN Alternate", Bahnschrift, system-ui, sans-serif'
    fontSize: clamp(44px, 9vw, 64px)
    fontWeight: 700
    lineHeight: 1
    fontVariantNumeric: tabular-nums
    letterSpacing: -0.01em
  figures:
    fontFamily: '"DIN Alternate", Bahnschrift, system-ui, sans-serif'
    fontVariantNumeric: tabular-nums
    fontWeight: 700
  heading:
    fontFamily: '"DIN Condensed", "Bahnschrift Condensed", Bahnschrift, "Arial Narrow", sans-serif'
    fontSize: 15px
    fontWeight: 700
    textTransform: uppercase
    letterSpacing: 0.1em
  body:
    fontFamily: '"Helvetica Neue", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: 16px
    lineHeight: 1.5
  scale:
    small: 14px
    body: 16px
    large: 20px
    total: 24px
    mood: 40px
rounded:
  control: 6px
spacing:
  unit: 8px
  gutter: 20px
  section: 24px
  column: 1200px
components:
  button-buy:
    backgroundColor: "{colors.up}"
    textColor: "{colors.on-up}"
    borderColor: "{colors.up}"
    rounded: "{rounded.control}"
    height: 48px
  button-sell:
    backgroundColor: transparent
    textColor: "{colors.down}"
    borderColor: "{colors.down}"
    height: 48px
  button-quiet:
    backgroundColor: transparent
    textColor: "{colors.text}"
    borderColor: "{colors.edge}"
    height: 48px
  button-disabled:
    opacity: 0.4
    cursor: not-allowed
  input:
    height: 48px
    backgroundColor: "{colors.well}"
    borderColor: "{colors.edge}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  input-focus:
    borderColor: "{colors.up}"
    outline: 2px solid {colors.up}
  input-error:
    borderColor: "{colors.down}"
  field-message:
    textColor: "{colors.down}"
    fontSize: "{typography.scale.small}"
  warning-line:
    textColor: "{colors.warn}"
    fontSize: "{typography.scale.small}"
  link:
    textColor: "{colors.text}"
    textDecoration: underline
    hover: color {colors.up}
  table:
    headerColor: "{colors.text-muted}"
    rowDivider: "{colors.hairline}"
    numbersAlign: right
  result-button:
    backgroundColor: "{colors.well}"
    borderColor: "{colors.edge}"
    hover: borderColor {colors.up}
---

# Paper Trader

## Overview

Who opens this: me, about to test a trade idea with fake money, who needs the
live price and my own P&L in the first five seconds.

The direction is a trading desk at night, the sibling of Trade Check. One dark
surface, no cards, sections separated by hairlines. Every number is set in the
same tabular figures so columns line up and the eye can scan them. Only two
colors mean anything: green is up or buy, red is down or sell. Amber is the
one warning color, for the mood line under the Buy button. Everything else is
light text on the dark page. Nothing animates except the price refreshing.

Picked out of three on 2026-10-29: a light broker app with cards
(`option-a.html`), this terminal desk (`option-b.html`), and a white editorial
page with serif type (`option-c.html`). The broker look made the page feel
like someone else's product, and the editorial look made numbers hard to
scan. The desk keeps the same surface and signal colors as Trade Check, so the
two tools read as one set.

## Colors

- **bg** is the page. **surface** is one step lighter, for the folded rules
  box and the result buttons when open.
- **well** and **edge** are input fills and borders. **hairline** divides
  table rows and sections.
- **text** is everything that reads; **text-muted** is labels, table headers,
  timestamps and the "updated" line.
- **up** is a positive P&L or change, the Buy button and the focus ring.
  **down** is a negative P&L or change, the Sell button, and every error
  message. **warn** is the mood warning only. **on-up** is text on the Buy
  button.
- Zero P&L is plain text, not green.

## Typography

No web fonts. DIN Alternate and DIN Condensed on a Mac, Bahnschrift on
Windows, system fonts otherwise.

- **price** is the selected coin's price, the largest thing on the page.
- **figures** is every other number: totals, table cells, the mood number,
  the inputs.
- **heading** is section titles, condensed caps, muted. The only caps on the
  page.
- **body** is sentences, labels, headlines and messages.
- Five sizes: 14 for labels, helper text, table cells and messages; 16 for
  body and inputs; 20 for the coin name and the cash line; 24 for the
  portfolio total in the header; 40 for the Fear & Greed number. Plus the
  price. Nothing else.

## Layout

A thin header: the name on the left, the portfolio value and total P&L on the
right.

Phone, one column, 20px gutters: search, the selected coin with its price,
the two trade forms stacked, the mood line, the five headlines, cash and the
portfolio table, the trades log, My rules folded, Start over. First thing
seen: the price. Second: the portfolio value. Third: the search box. Nothing
is hidden behind a tab.

Laptop, 960px and up: two columns inside 1200px. Left, 40%: search, the coin,
trade, mood. Right, 60%: news, portfolio, trades. Rules and Start over sit on
one footer row across both columns. The page scrolls normally.

## Icon

A green rounded square on the dark page color with a small dark upward tick
in it. Reads at 16px.

## Elevation & Depth

Flat. No shadows, no gradients, no glass, no blur. Depth is only the wells
cut into the surface for inputs.

## Shapes

Every control is 6px rounded. Tables and sections are square.

## Motion

- The price text changes in place on every live tick, at most five times a
  second. If it went up it flashes **up** for 300ms, down flashes **down**,
  then it settles back to text color. With reduced motion on, no flash.
- The chart's crosshair follows the pointer with no easing.
- Nothing else moves. Loading is a word, not a spinner.

## Components

- **Buy button:** green fill, dark text. Hover brightens one step.
- **Sell button:** red border and text, transparent. **Sell all** is a quiet
  button beside it.
- **Quiet button:** edge border, light text, for Search, Retry, Edit, Save,
  Start over.
- **Disabled:** any button at 40% opacity with a not-allowed cursor. Used
  while a request runs, before a coin is selected, and when the rules block.
- **Input:** a well, 48px tall, figures face for numbers. Focus draws a green
  ring. An error turns the border red and puts the message under the field in
  red, 14px.
- **Result buttons:** the search matches, one per row, full width, well fill,
  name left, symbol and rank muted right. Hover turns the border green.
- **Warning line:** amber 14px text under the Buy button. The same spot holds
  the block reason, in red, when the rules block.
- **Mood:** the Fear & Greed number at 40px with its label, then "Headlines
  −3, negative" on the same row.
- **News list:** headline as an underlined link, source and age muted under it,
  hairline between items.
- **Tables:** header row muted, numbers right-aligned in figures, hairlines
  between rows, P&L cells colored up or down. A total row in bold.
- **Rules:** folded behind one line that says them in words, with Edit, like
  Trade Check.
- **Tape (v2):** one strip under the header, items 40px tall with the symbol
  in bold, the live price and 24h change in figures, and a 60×20 sparkline
  in up or down. The selected coin gets a green border. Scrolls sideways on
  a phone, no wrap.
- **Chart (v2):** inline SVG, 600×220 units, full width. The line is up or
  down by whether the range ended higher than it started, with the same
  color under it at 12% for the area. Three faint grid lines with the price
  in muted 11px figures, three time labels along the bottom. My buys are
  green dots, sells red dots, with a page-colored ring. Hover draws an edge
  line and a readout in figures. Range buttons are quiet, small, the active
  one green.
- **Live dot (v2):** an 8px green dot before "Live · Coinbase".
- **Orders (v2):** a select, a price well and a dollars well on one row with
  a quiet Place button; pending orders as plain rows with an underlined
  muted Cancel.
- **Performance (v2):** the equity curve in the chart style, then stats in a
  two-column grid (three on a laptop), label muted, value in figures and up
  or down where it is money.
- **AI read (v2):** a surface-colored box under the headlines, small text,
  the sentiment word in up or down.

## Do's and Don'ts

- Do keep the price the biggest thing on the page. My own rule: the only
  colors that carry meaning are green and red for money, so the search
  results, the links and the headlines get no color of their own. It costs
  me a colored source name per headline, which I accept.
- Do set every number in the figures face so columns align.
- Don't use cards, shadows, gradients, icons, emoji or a spinner.
- Don't use caps outside section headings.
- Don't add a color, font or size that is not in this file.
