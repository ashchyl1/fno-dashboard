// Auto-generated plain-language insights: each rule inspects the enriched
// trade set and speaks up only when its pattern is present and material.
import { aggregate, breakdownBy, sum, formatINR, WEEKDAYS } from './metrics';

export function generateInsights(trades) {
  const insights = [];
  if (trades.length < 10) return insights;
  const agg = aggregate(trades);

  // Exit quality: capture rate.
  if (agg.avgCapture != null) {
    const pct = Math.round(agg.avgCapture * 100);
    const mfeTrades = trades.filter((t) => t.mfeR != null && t.rMultiple != null && t.mfeR > 0.2);
    const avgMfeR = mfeTrades.length ? sum(mfeTrades.map((t) => t.mfeR)) / mfeTrades.length : null;
    const avgExitR = mfeTrades.length ? sum(mfeTrades.map((t) => t.rMultiple)) / mfeTrades.length : null;
    if (agg.avgCapture < 0.5 && avgMfeR != null) {
      insights.push({
        severity: 'serious',
        title: 'Exits are your biggest leak',
        body: `Your average trade reaches ${avgMfeR.toFixed(1)}R of open profit but closes at ${avgExitR.toFixed(1)}R — a capture rate of ${pct}%. Below 50%, recalibrating exits usually improves results more than any entry tweak.`,
      });
    } else if (agg.avgCapture >= 0.6) {
      insights.push({
        severity: 'good',
        title: 'Disciplined exits',
        body: `You capture ${pct}% of the favorable move on average — above the 60% threshold that indicates structured, non-noisy exits.`,
      });
    }
  }

  // Entry quality: winners that were deep underwater first.
  const winners = trades.filter((t) => t.isWin && t.maeR != null);
  const deepWinners = winners.filter((t) => t.maeR > 0.7);
  if (winners.length >= 10 && deepWinners.length / winners.length > 0.35) {
    insights.push({
      severity: 'warning',
      title: 'Entries are early',
      body: `${Math.round((deepWinners.length / winners.length) * 100)}% of your winners first went more than 0.7R against you. Your ideas are right but your timing is early — a tighter trigger or smaller initial size would cut heat significantly.`,
    });
  }

  // Emotion correlation.
  const byEmotion = breakdownBy(trades.filter((t) => t.emotion), (t) => t.emotion)
    .filter((g) => g.count >= 8 && g.avgR != null);
  const worst = [...byEmotion].sort((a, b) => a.avgR - b.avgR)[0];
  const best = [...byEmotion].sort((a, b) => b.avgR - a.avgR)[0];
  if (worst && worst.avgR < -0.15) {
    insights.push({
      severity: 'serious',
      title: `"${worst.key}" trades are costing you`,
      body: `Trades tagged ${worst.key} average ${worst.avgR.toFixed(2)}R across ${worst.count} trades (${formatINR(worst.netPnL)} total). ${best && best.avgR > 0 ? `Compare ${best.key}: +${best.avgR.toFixed(2)}R.` : ''} A pre-trade checklist gate would filter most of these.`,
    });
  }

  // Setup edge.
  const bySetup = breakdownBy(trades.filter((t) => t.setup), (t) => t.setup)
    .filter((g) => g.count >= 10);
  const bestSetup = [...bySetup].sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0))[0];
  const worstSetup = [...bySetup].sort((a, b) => (a.avgR ?? 0) - (b.avgR ?? 0))[0];
  if (bestSetup && bestSetup.avgR > 0.2) {
    insights.push({
      severity: 'good',
      title: `${bestSetup.key} is your edge`,
      body: `${bestSetup.key} averages +${bestSetup.avgR.toFixed(2)}R over ${bestSetup.count} trades with a ${Math.round(bestSetup.winRate * 100)}% win rate. Consider concentrating size here${worstSetup && worstSetup.avgR < 0 ? ` and cutting ${worstSetup.key} (${worstSetup.avgR.toFixed(2)}R avg)` : ''}.`,
    });
  }

  // Day-of-week pattern.
  const byDay = breakdownBy(trades, (t) => WEEKDAYS[new Date(t.entryDate).getDay()])
    .filter((g) => g.count >= 10 && g.avgR != null);
  const worstDay = [...byDay].sort((a, b) => a.avgR - b.avgR)[0];
  if (worstDay && worstDay.avgR < -0.2) {
    insights.push({
      severity: 'warning',
      title: `${worstDay.key}s are a drag`,
      body: `You average ${worstDay.avgR.toFixed(2)}R on ${worstDay.key}s (${worstDay.count} trades, ${formatINR(worstDay.netPnL)}). Worth reviewing whether the market regime or your routine differs that day.`,
    });
  }

  // Risk discipline.
  const noStop = trades.filter((t) => t.stopLoss == null);
  if (noStop.length / trades.length > 0.12) {
    const pnl = sum(noStop.map((t) => t.netPnL));
    insights.push({
      severity: 'serious',
      title: 'Trades without a stop',
      body: `${Math.round((noStop.length / trades.length) * 100)}% of trades have no defined stop-loss (net ${formatINR(pnl)}). Every undefined-risk trade makes R-based analysis blind to your true exposure.`,
    });
  }

  return insights;
}

const BADGES = [
  { id: 'journal-25', label: 'Scribe', desc: '25 trades journaled with notes or setup', test: (t) => t.filter((x) => x.notes || x.setup).length >= 25 },
  { id: 'stops-95', label: 'Risk First', desc: '95%+ of trades with a defined stop', test: (t) => t.length >= 20 && t.filter((x) => x.stopLoss != null).length / t.length >= 0.95 },
  { id: 'capture-55', label: 'Clean Exits', desc: 'Average capture rate above 55%', test: (t) => { const a = aggregate(t); return a.avgCapture != null && a.avgCapture >= 0.55; } },
  { id: 'trades-100', label: 'Century', desc: '100 trades logged', test: (t) => t.length >= 100 },
  { id: 'green-month', label: 'Green Month', desc: 'A calendar month with positive net P&L', test: hasGreenMonth },
];

function hasGreenMonth(trades) {
  const byMonth = new Map();
  for (const t of trades) {
    const key = t.exitDate?.slice(0, 7);
    if (key) byMonth.set(key, (byMonth.get(key) || 0) + t.netPnL);
  }
  return [...byMonth.values()].some((v) => v > 0);
}

export function earnedBadges(trades) {
  return BADGES.map((b) => ({ ...b, earned: b.test(trades) }));
}

// Journaling streak: consecutive trading days (weekdays with trades) where
// every trade that day has notes, a setup tag, or an emotion recorded.
export function journalingStreak(trades) {
  const byDay = new Map();
  for (const t of trades) {
    const key = t.entryDate?.slice(0, 10);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  }
  const days = [...byDay.keys()].sort();
  let current = 0;
  let best = 0;
  for (const day of days) {
    const complete = byDay.get(day).every((t) => t.notes || t.setup || t.emotion);
    current = complete ? current + 1 : 0;
    if (current > best) best = current;
  }
  return { current, best, daysTracked: days.length };
}
