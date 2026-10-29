// Live prices from Coinbase's public ticker feed. No key, no library: the
// browser's own WebSocket. Coins that Coinbase does not list keep the
// CoinGecko price from the 60-second poll, so nothing here can break the page.

const LIVE_FEED = "wss://ws-feed.exchange.coinbase.com";

const live = {
  socket: null,
  wanted: new Set(),      // "BTC-USD" product ids the page wants right now
  subscribed: new Set(),  // product ids Coinbase accepted
  unsupported: new Set(), // product ids Coinbase said do not exist
  retryIn: 1000,
};

// Called by app.js with the symbols on screen, like ["BTC", "SOL"].
function liveWatch(symbols) {
  const next = new Set(symbols.map((s) => `${s.toUpperCase()}-USD`).filter((p) => !live.unsupported.has(p)));
  live.wanted = next;
  if (!live.socket || live.socket.readyState > 1) {
    liveConnect();
    return;
  }
  if (live.socket.readyState === 1) liveSync();
}

function liveConnect() {
  if (live.socket && live.socket.readyState <= 1) return;
  try {
    live.socket = new WebSocket(LIVE_FEED);
  } catch {
    return; // no WebSocket support: polling only
  }
  live.socket.onopen = () => {
    live.retryIn = 1000;
    live.subscribed.clear();
    liveSync();
  };
  live.socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ticker" && msg.price) {
      applyTick(msg.product_id.replace("-USD", ""), Number(msg.price));
    } else if (msg.type === "subscriptions") {
      live.subscribed = new Set((msg.channels || []).flatMap((c) => c.product_ids || []));
      liveStatusChanged();
    } else if (msg.type === "error" && /not a valid product/i.test(msg.message || "")) {
      const bad = (msg.message.match(/([A-Z0-9]+-USD)/) || [])[1];
      if (bad) live.unsupported.add(bad);
      liveStatusChanged();
    }
  };
  live.socket.onclose = () => {
    live.subscribed.clear();
    liveStatusChanged();
    // Come back, waiting a little longer each time, up to 30 seconds.
    setTimeout(liveConnect, live.retryIn);
    live.retryIn = Math.min(live.retryIn * 2, 30000);
  };
  live.socket.onerror = () => {
    // onclose follows and handles the retry.
  };
}

// Subscribe to what is wanted and drop what is not. One product per message,
// so one unknown coin cannot reject the whole list.
function liveSync() {
  for (const p of live.wanted) {
    if (!live.subscribed.has(p)) {
      live.socket.send(JSON.stringify({ type: "subscribe", product_ids: [p], channels: ["ticker"] }));
    }
  }
  for (const p of live.subscribed) {
    if (!live.wanted.has(p)) {
      live.socket.send(JSON.stringify({ type: "unsubscribe", product_ids: [p], channels: ["ticker"] }));
    }
  }
}

function liveHas(symbol) {
  return live.subscribed.has(`${symbol.toUpperCase()}-USD`);
}
