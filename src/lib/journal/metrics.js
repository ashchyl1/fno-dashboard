// Pure, framework-free analytics for trade entry/exit analysis.
// A trade: { id, symbol, instrument, direction, entryDate, exitDate,
//   entryPrice, exitPrice, quantity, lotSize, stopLoss, target, fees,
//   setup, emotion, mistake, tags[], notes, path: [{t, p}] }
// All price-path metrics (MFE/MAE/capture) are computed per unit and
// scaled by quantity so they are comparable with P&L.

const DAY_MS = 24 * 60 * 60 * 1000;

export function directionMult(trade) {
  return trade.direction === 'short' ? -1 : 1;
}

export function enrichTrade(trade) {
  const mult = directionMult(trade);
  const qty = trade.quantity || 0;
  const grossPnL = (trade.exitPrice - trade.entryPrice) * mult * qty;
  const netPnL = grossPnL - (trade.fees || 0);
  const riskPerUnit = trade.stopLoss != null
    ? Math.abs(trade.entryPrice - trade.stopLoss)
    : null;
  const risk = riskPerUnit ? riskPerUnit * qty : null;
  const rMultiple = risk ? netPnL / risk : null;

  const holdMins = trade.entryDate && trade.exitDate
    ? Math.max(0, (new Date(trade.exitDate) - new Date(trade.entryDate)) / 60000)
    : null;

  let mfe = null; // peak favorable excursion, ₹ (per whole position)
  let mae = null; // deepest adverse excursion, ₹ (positive number)
  if (Array.isArray(trade.path) && trade.path.length > 1) {
    let bestFav = 0;
    let worstAdv = 0;
    for (const point of trade.path) {
      const move = (point.p - trade.entryPrice) * mult;
      if (move > bestFav) bestFav = move;
      if (move < worstAdv) worstAdv = move;
    }
    mfe = bestFav * qty;
    mae = Math.abs(worstAdv) * qty;
  }

  // Capture rate only counts when the trade had a meaningful favorable move
  // (≥0.2R when risk is defined) — otherwise every stop-out reads as "0%
  // captured" and drowns the signal.
  const realizedFavorable = (trade.exitPrice - trade.entryPrice) * mult * qty;
  const meaningfulMfe = mfe > 0 && (risk == null || mfe / risk >= 0.2);
  const captureRate = meaningfulMfe
    ? Math.max(0, Math.min(realizedFavorable / mfe, 1))
    : null;

  return {
    ...trade,
    grossPnL,
    netPnL,
    risk,
    rMultiple,
    holdMins,
    mfe,
    mae,
    mfeR: mfe != null && risk ? mfe / risk : null,
    maeR: mae != null && risk ? mae / risk : null,
    captureRate,
    isWin: netPnL > 0,
  };
}

export function enrichAll(trades) {
  return trades.map(enrichTrade);
}

// ---- aggregates -----------------------------------------------------------

export function aggregate(trades) {
  const closed = trades.filter((t) => t.exitPrice != null);
  const wins = closed.filter((t) => t.netPnL > 0);
  const losses = closed.filter((t) => t.netPnL <= 0);
  const netPnL = sum(closed.map((t) => t.netPnL));
  const grossWins = sum(wins.map((t) => t.netPnL));
  const grossLosses = Math.abs(sum(losses.map((t) => t.netPnL)));
  const rTrades = closed.filter((t) => t.rMultiple != null);
  const captureTrades = closed.filter((t) => t.captureRate != null && t.mfe > 0);

  const curve = equityCurve(closed);
  const dd = maxDrawdown(curve);

  return {
    count: closed.length,
    netPnL,
    winRate: closed.length ? wins.length / closed.length : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : 0),
    expectancyR: rTrades.length ? sum(rTrades.map((t) => t.rMultiple)) / rTrades.length : null,
    avgWin: wins.length ? grossWins / wins.length : 0,
    avgLoss: losses.length ? grossLosses / losses.length : 0,
    avgCapture: captureTrades.length
      ? sum(captureTrades.map((t) => t.captureRate)) / captureTrades.length
      : null,
    maxDrawdown: dd.depth,
    equityCurve: curve,
    streaks: streaks(closed),
  };
}

export function equityCurve(trades) {
  const sorted = [...trades].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  let equity = 0;
  return sorted.map((t) => {
    equity += t.netPnL;
    return { date: t.exitDate, equity, tradeId: t.id };
  });
}

export function maxDrawdown(curve) {
  let peak = 0;
  let depth = 0;
  for (const point of curve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    if (dd > depth) depth = dd;
  }
  return { depth };
}

export function streaks(trades) {
  const sorted = [...trades].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  let currentWin = 0;
  let currentLoss = 0;
  let bestWin = 0;
  let worstLoss = 0;
  for (const t of sorted) {
    if (t.netPnL > 0) {
      currentWin += 1;
      currentLoss = 0;
    } else {
      currentLoss += 1;
      currentWin = 0;
    }
    if (currentWin > bestWin) bestWin = currentWin;
    if (currentLoss > worstLoss) worstLoss = currentLoss;
  }
  return { currentWin, currentLoss, bestWin, worstLoss };
}

export function dailyPnL(trades) {
  const byDay = new Map();
  for (const t of trades) {
    if (!t.exitDate) continue;
    const key = t.exitDate.slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + t.netPnL);
  }
  return byDay;
}

// Composite discipline score, 0-100: process quality, not profits.
export function disciplineScore(trades) {
  if (!trades.length) return { total: 0, parts: [] };
  const withStop = trades.filter((t) => t.stopLoss != null).length / trades.length;
  const journaled = trades.filter((t) => (t.notes && t.notes.length > 4) || t.setup).length / trades.length;
  const agg = aggregate(trades);
  const capture = agg.avgCapture != null ? Math.min(agg.avgCapture / 0.6, 1) : 0;
  const winRate = Math.min(agg.winRate / 0.55, 1);
  const parts = [
    { label: 'Stops defined', value: withStop },
    { label: 'Journaled', value: journaled },
    { label: 'Capture rate', value: capture },
    { label: 'Win rate', value: winRate },
  ];
  const total = Math.round(parts.reduce((acc, p) => acc + p.value * 25, 0));
  return { total, parts };
}

// ---- breakdowns -----------------------------------------------------------

export function breakdownBy(trades, keyFn) {
  const groups = new Map();
  for (const t of trades) {
    const key = keyFn(t);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()].map(([key, group]) => {
    const wins = group.filter((t) => t.netPnL > 0).length;
    const rTrades = group.filter((t) => t.rMultiple != null);
    return {
      key,
      count: group.length,
      netPnL: sum(group.map((t) => t.netPnL)),
      winRate: wins / group.length,
      avgR: rTrades.length ? sum(rTrades.map((t) => t.rMultiple)) / rTrades.length : null,
    };
  });
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function holdBucket(mins) {
  if (mins == null) return null;
  if (mins < 15) return '<15m';
  if (mins < 60) return '15m-1h';
  if (mins < 240) return '1h-4h';
  if (mins < 24 * 60) return '4h-1d';
  return '>1d';
}

export const HOLD_BUCKET_ORDER = ['<15m', '15m-1h', '1h-4h', '4h-1d', '>1d'];

// ---- what-if simulator ----------------------------------------------------

// Replays each trade's price path with a modified stop distance
// (stopScale × original) and an optional fixed take-profit at targetR × risk.
// Returns re-simulated trades (netPnL adjusted) for comparison curves.
export function simulateWhatIf(trades, { stopScale = 1, targetR = null }) {
  return trades.map((t) => {
    if (!Array.isArray(t.path) || t.path.length < 2 || t.stopLoss == null) return t;
    const mult = directionMult(t);
    const riskPerUnit = Math.abs(t.entryPrice - t.stopLoss) * stopScale;
    if (riskPerUnit <= 0) return t;
    const targetPerUnit = targetR ? riskPerUnit * targetR : null;

    let exitMove = null; // favorable move per unit at simulated exit
    for (const point of t.path) {
      const move = (point.p - t.entryPrice) * mult;
      if (move <= -riskPerUnit) { exitMove = -riskPerUnit; break; }
      if (targetPerUnit != null && move >= targetPerUnit) { exitMove = targetPerUnit; break; }
    }
    if (exitMove == null) {
      exitMove = (t.exitPrice - t.entryPrice) * mult;
    }
    const netPnL = exitMove * t.quantity - (t.fees || 0);
    return { ...t, netPnL, simulated: true };
  });
}

// ---- utils ----------------------------------------------------------------

export function sum(values) {
  return values.reduce((acc, v) => acc + v, 0);
}

export function formatINR(value, { compact = true } = {}) {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (compact && abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (compact && abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (compact && abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function formatHold(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 24 * 60) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / (24 * 60)).toFixed(1)}d`;
}

export function periodDelta(trades, days) {
  const now = Date.now();
  const currentStart = now - days * DAY_MS;
  const prevStart = now - 2 * days * DAY_MS;
  const current = trades.filter((t) => new Date(t.exitDate) >= currentStart);
  const previous = trades.filter((t) => {
    const d = new Date(t.exitDate);
    return d >= prevStart && d < currentStart;
  });
  return { current, previous };
}
