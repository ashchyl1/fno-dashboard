// Builds an OHLC candle series around a trade for the detail chart.
// In-trade candles are bucketed from the trade's stored price path;
// context candles before entry and after exit are synthesized with a
// deterministic walk seeded from the trade id, so the same trade always
// renders the same chart.

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bucketPath(path, targetCandles) {
  const bucketSize = Math.max(1, Math.ceil(path.length / targetCandles));
  const candles = [];
  for (let i = 0; i < path.length; i += bucketSize) {
    const slice = path.slice(i, i + bucketSize);
    const prices = slice.map((pt) => pt.p);
    candles.push({
      time: slice[0].t,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      inTrade: true,
    });
  }
  return candles;
}

function contextCandles(rng, { anchorPrice, anchorTime, count, stepSecs, vol, forward }) {
  const candles = [];
  let price = anchorPrice;
  for (let i = 1; i <= count; i += 1) {
    const open = price;
    const move = (rng() - 0.5) * anchorPrice * vol * 2;
    const close = open + move;
    const wick = anchorPrice * vol * rng();
    const time = anchorTime + (forward ? i : -i) * stepSecs;
    candles.push({
      time,
      open: Number(open.toFixed(2)),
      close: Number(close.toFixed(2)),
      high: Number((Math.max(open, close) + wick).toFixed(2)),
      low: Number((Math.min(open, close) - wick).toFixed(2)),
      inTrade: false,
    });
    price = close;
  }
  if (!forward) candles.reverse();
  return candles;
}

export function buildTradeCandles(trade, { context = 20, targetCandles = 40 } = {}) {
  if (!Array.isArray(trade.path) || trade.path.length < 2) return null;
  const inTrade = bucketPath(trade.path, targetCandles);
  const stepSecs = Math.max(
    60,
    Math.round((inTrade[inTrade.length - 1].time - inTrade[0].time) / Math.max(inTrade.length - 1, 1)),
  );
  const rng = mulberry32(hashSeed(trade.id));
  const vol = 0.0035;
  const before = contextCandles(rng, {
    anchorPrice: trade.entryPrice,
    anchorTime: inTrade[0].time,
    count: context,
    stepSecs,
    vol,
    forward: false,
  });
  const after = contextCandles(rng, {
    anchorPrice: trade.exitPrice,
    anchorTime: inTrade[inTrade.length - 1].time,
    count: Math.round(context / 2),
    stepSecs,
    vol,
    forward: true,
  });
  // Guard against duplicate/unsorted timestamps at the seams.
  const all = [...before, ...inTrade, ...after];
  const seen = new Set();
  return all
    .filter((c) => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}
