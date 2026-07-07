// Deterministic sample journal: ~300 Indian F&O trades over 6 months with
// realistic intraday price paths (a Brownian bridge from entry to exit, with
// stop-loss truncation). Seeded so the demo looks identical on every load.

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

const SYMBOLS = [
  { symbol: 'NIFTY', instrument: 'FUT', base: 24800, lotSize: 75, vol: 0.004 },
  { symbol: 'BANKNIFTY', instrument: 'FUT', base: 53500, lotSize: 30, vol: 0.006 },
  { symbol: 'RELIANCE', instrument: 'FUT', base: 2980, lotSize: 250, vol: 0.008 },
  { symbol: 'HDFCBANK', instrument: 'FUT', base: 1690, lotSize: 550, vol: 0.007 },
  { symbol: 'TCS', instrument: 'FUT', base: 4150, lotSize: 175, vol: 0.007 },
  { symbol: 'INFY', instrument: 'FUT', base: 1870, lotSize: 400, vol: 0.009 },
  { symbol: 'SBIN', instrument: 'FUT', base: 812, lotSize: 750, vol: 0.009 },
  { symbol: 'TATAMOTORS', instrument: 'FUT', base: 1030, lotSize: 550, vol: 0.011 },
  { symbol: 'NIFTY 24800 CE', instrument: 'CE', base: 185, lotSize: 75, vol: 0.05 },
  { symbol: 'BANKNIFTY 53500 PE', instrument: 'PE', base: 420, lotSize: 30, vol: 0.05 },
];

const SETUPS = ['ORB Breakout', 'VWAP Reversion', 'OI Buildup', 'Support Bounce', 'Trend Pullback', 'Max Pain Drift'];
const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Impatient', 'Revenge'];
const MISTAKES = [null, null, null, null, 'Chased entry', 'Early exit', 'Moved stop', 'Oversized'];
const NOTES = [
  '', '', 'Clean setup, followed the plan.', 'Entered on retest of breakout level.',
  'Exited into strength near resistance.', 'Should have waited for confirmation candle.',
  'OI supported the direction all day.', 'News spike, took profits early.',
  'Stop was too tight for the volatility.', 'Scaled out in two parts.',
];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Brownian bridge from entry to target exit; truncated at the stop if crossed.
function buildPath(rng, { entryPrice, exitTarget, stopPrice, mult, steps, startMs, endMs, vol }) {
  const path = [{ t: Math.floor(startMs / 1000), p: entryPrice }];
  const drift = exitTarget - entryPrice;
  const sigma = entryPrice * vol;
  let stopped = false;
  let stoppedAt = steps;
  let prevNoise = 0;
  for (let i = 1; i <= steps; i += 1) {
    const frac = i / steps;
    // Bridge noise: peaks mid-path, zero at both ends; random-walk correlated.
    prevNoise += (rng() - 0.5) * sigma * 0.38;
    const bridgeDamp = Math.sin(Math.PI * frac);
    let price = entryPrice + drift * frac + prevNoise * bridgeDamp;
    const adverse = (price - entryPrice) * mult;
    if (stopPrice != null && adverse <= -Math.abs(entryPrice - stopPrice)) {
      price = stopPrice;
      stopped = true;
      stoppedAt = i;
    }
    const t = Math.floor((startMs + (endMs - startMs) * frac) / 1000);
    path.push({ t, p: Number(price.toFixed(2)) });
    if (stopped) break;
  }
  return { path, stopped, stoppedAt };
}

export function generateSampleTrades(count = 300, seed = 20260107) {
  const rng = mulberry32(seed);
  const trades = [];
  const start = new Date('2026-01-05T00:00:00Z').getTime();
  const end = new Date('2026-07-03T00:00:00Z').getTime();

  for (let i = 0; i < count; i += 1) {
    const meta = pick(rng, SYMBOLS);
    const direction = rng() < 0.55 ? 'long' : 'short';
    const mult = direction === 'long' ? 1 : -1;

    // Entry on a weekday between 09:20 and 14:00 IST (03:50-08:30 UTC).
    let dayMs = start + rng() * (end - start);
    const weekday = new Date(dayMs).getUTCDay();
    if (weekday === 0) dayMs += 86400000;
    if (weekday === 6) dayMs += 2 * 86400000;
    const dayStart = Math.floor(dayMs / 86400000) * 86400000;
    const entryMs = dayStart + (3 * 60 + 50) * 60000 + Math.floor(rng() * 280) * 60000;

    // Price drifts over the six months so charts don't look flat.
    const seasonDrift = 1 + 0.08 * ((dayMs - start) / (end - start)) * (rng() < 0.7 ? 1 : -1);
    const entryPrice = Number((meta.base * seasonDrift * (0.97 + rng() * 0.06)).toFixed(2));

    const stopPct = 0.003 + rng() * 0.009;
    const stopDist = Number((entryPrice * stopPct).toFixed(2));
    const stopLoss = Number((entryPrice - mult * stopDist).toFixed(2));

    const emotion = pick(rng, EMOTIONS);
    const emotionPenalty = emotion === 'FOMO' || emotion === 'Revenge' ? 0.18 : 0;
    // Intended outcome; bridge noise still stops out a share of intended
    // winners, so the realized win rate lands in the low-to-mid 40s.
    const isWin = rng() < 0.58 - emotionPenalty;
    // Winners: 0.2R to ~3.8R (skewed low). Losers: -0.25R to -1.05R.
    const outcomeR = isWin
      ? 0.2 + Math.pow(rng(), 1.8) * 3.6
      : -(0.25 + rng() * 0.8);
    const exitTarget = Number((entryPrice + mult * outcomeR * stopDist).toFixed(2));

    const multiDay = rng() < 0.18;
    const holdMins = multiDay
      ? (1 + Math.floor(rng() * 4)) * 24 * 60 + Math.floor(rng() * 300)
      : 12 + Math.floor(rng() * 260);
    const exitMs = entryMs + holdMins * 60000;

    const steps = 36 + Math.floor(rng() * 60);
    const { path, stopped } = buildPath(rng, {
      entryPrice,
      exitTarget,
      stopPrice: stopLoss,
      mult,
      steps,
      startMs: entryMs,
      endMs: exitMs,
      vol: meta.vol,
    });

    const last = path[path.length - 1];
    const exitPrice = last.p;
    const lots = 1 + Math.floor(rng() * 4);
    const quantity = lots * meta.lotSize;
    const fees = Math.round(quantity * entryPrice * 0.00025 + 45);
    const targetR = 1.5 + Math.floor(rng() * 3) * 0.5;

    trades.push({
      id: `S${String(i + 1).padStart(4, '0')}`,
      symbol: meta.symbol,
      instrument: meta.instrument,
      direction,
      entryDate: new Date(entryMs).toISOString(),
      exitDate: new Date(last.t * 1000).toISOString(),
      entryPrice,
      exitPrice,
      quantity,
      lotSize: meta.lotSize,
      stopLoss: rng() < 0.92 ? stopLoss : null,
      target: Number((entryPrice + mult * targetR * stopDist).toFixed(2)),
      fees,
      setup: rng() < 0.9 ? pick(rng, SETUPS) : null,
      emotion,
      mistake: stopped && rng() < 0.3 ? 'Moved stop' : pick(rng, MISTAKES),
      tags: [],
      notes: pick(rng, NOTES),
      path,
      sample: true,
    });
  }

  trades.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  return trades;
}
