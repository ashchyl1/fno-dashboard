/**
 * Numerical sanity harness for the momentum -> calendar strategy modules.
 *
 * The project has no test runner, so this is a plain script that asserts the
 * maths against closed-form values and synthetic data with a known answer.
 *
 *   npm run verify
 *
 * It is bundled with esbuild first because the source uses extensionless
 * imports (Vite resolution), which bare Node ESM will not resolve.
 */

import { ema, sma, rsi, roc } from '../src/lib/analysis/indicators';
import { bsPrice, impliedVol, greeks, parseExpiry, yearsToExpiry } from '../src/lib/analysis/black-scholes';
import { computeRohitMomentum, crossoverHistory, readMomentumState } from '../src/lib/analysis/rohit-momentum';
import { computeWavyTunnel, readTunnelState } from '../src/lib/analysis/wavy-tunnel';
import { evaluateEntry } from '../src/lib/analysis/entry-signals';
import { buildCalendarSpread, sizePosition } from '../src/lib/analysis/calendar-spread';
import { buildExitPlan, evaluateExit } from '../src/lib/analysis/exit-rules';
import { runMomentumScan, analyzeSymbol } from '../src/lib/analysis/momentum-pipeline';
import { parseFuturesData, parseOptionsData } from '../src/lib/parsers';

let passed = 0;
let failed = 0;

const check = (name, condition, detail = '') => {
    if (condition) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
        failed++;
        console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

// ---------------------------------------------------------------------------
section('1. Indicator primitives');

const flat = new Array(50).fill(100);
check('SMA of a constant series is the constant', sma(flat, 10)[20] === 100);
check('EMA of a constant series is the constant', near(ema(flat, 10)[30], 100));
check('EMA warm-up is null before the seed', ema(flat, 10)[8] === null);
check('EMA first print lands at index period-1', ema(flat, 10)[9] === 100);

// EMA against a hand-computed case: seed = SMA(1..5) = 3, then k = 2/6.
const ramp = [1, 2, 3, 4, 5, 6, 7];
const rampEma = ema(ramp, 5);
const expected5 = 3 + (6 - 3) * (2 / 6);
const expected6 = expected5 + (7 - expected5) * (2 / 6);
check('EMA seed equals the SMA of the first window', near(rampEma[4], 3));
check('EMA recursion matches hand calculation', near(rampEma[5], expected5) && near(rampEma[6], expected6));

const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
check('RSI pins at 100 on an unbroken advance', near(rsi(rising, 14)[30], 100, 1e-6));
const falling = Array.from({ length: 40 }, (_, i) => 200 - i);
check('RSI pins at 0 on an unbroken decline', near(rsi(falling, 14)[30], 0, 1e-6));
check('RSI first print is at index = period', rsi(rising, 14)[13] === null && rsi(rising, 14)[14] !== null);

const alternating = Array.from({ length: 80 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1));
const altRsi = rsi(alternating, 14)[70];
check('RSI of a symmetric zig-zag sits near 50', altRsi > 40 && altRsi < 60, `RSI=${altRsi.toFixed(1)}`);

check('ROC computes percentage change', near(roc([100, 100, 110], 2)[2], 10));

// ---------------------------------------------------------------------------
section('2. Black-Scholes');

// Textbook reference: S=100, K=100, T=1, r=5%, sigma=20%.
const refCall = bsPrice(100, 100, 1, 0.05, 0.2, 'CE');
const refPut = bsPrice(100, 100, 1, 0.05, 0.2, 'PE');
check('Call matches the reference value 10.4506', near(refCall, 10.4506, 0.001), `got ${refCall.toFixed(4)}`);
check('Put matches the reference value 5.5735', near(refPut, 5.5735, 0.001), `got ${refPut.toFixed(4)}`);

// Put-call parity: C - P = S - K*e^(-rT)
const parity = refCall - refPut;
const parityExpected = 100 - 100 * Math.exp(-0.05);
check('Put-call parity holds', near(parity, parityExpected, 0.001), `${parity.toFixed(4)} vs ${parityExpected.toFixed(4)}`);

check('At T=0 the price collapses to intrinsic', bsPrice(110, 100, 0, 0.05, 0.2, 'CE') === 10);

const solved = impliedVol(bsPrice(1000, 1020, 0.08, 0.065, 0.331, 'CE'), 1000, 1020, 0.08, 0.065, 'CE');
check('Implied vol round-trips to the input vol', near(solved, 0.331, 1e-3), `solved ${solved.toFixed(4)}`);
check('Implied vol returns null below intrinsic', impliedVol(1, 1100, 1000, 0.1, 0.065, 'CE') === null);
check('Implied vol returns null on a zero price', impliedVol(0, 1000, 1000, 0.1, 0.065, 'CE') === null);

const g = greeks(1000, 1000, 0.25, 0.065, 0.3, 'CE');
check('ATM call delta is around 0.55', g.delta > 0.5 && g.delta < 0.65, `delta=${g.delta.toFixed(3)}`);
check('Theta is negative for a long option', g.theta < 0, `theta=${g.theta.toFixed(4)}/day`);
check('Gamma and vega are positive', g.gamma > 0 && g.vega > 0);

// A nearer-dated option must decay faster than a further-dated one.
const thetaNear = greeks(1000, 1000, 20 / 365, 0.065, 0.3, 'CE').theta;
const thetaFar = greeks(1000, 1000, 50 / 365, 0.065, 0.3, 'CE').theta;
check('Front-month theta is more negative than back-month', thetaNear < thetaFar,
    `${thetaNear.toFixed(4)} < ${thetaFar.toFixed(4)}`);

check('Expiry parser reads NSE "24-FEB-2026"', parseExpiry('24-FEB-2026').getUTCMonth() === 1);
check('Expiry parser reads ISO "2026-02-24"', parseExpiry('2026-02-24').getUTCDate() === 24);
check('yearsToExpiry converts 30 days correctly',
    near(yearsToExpiry(new Date(Date.UTC(2026, 1, 1)), new Date(Date.UTC(2026, 2, 3))), 30 / 365, 1e-6));

// ---------------------------------------------------------------------------
section('3. Rohit Momentum crossovers');

// A clean sine wave must produce alternating crossovers.
const wave = Array.from({ length: 260 }, (_, i) => 1000 + 80 * Math.sin((i / 30) * Math.PI));
const series = computeRohitMomentum(wave);
const events = crossoverHistory(series);

check('Crossovers are detected on an oscillating series', events.length >= 6, `${events.length} crosses`);
check('Crossovers strictly alternate UP/DOWN',
    events.every((e, i) => i === 0 || e.direction !== events[i - 1].direction));

const upDown = events.filter((e) => e.direction === 'UP').length;
check('UP and DOWN counts are balanced on a symmetric wave',
    Math.abs(upDown - (events.length - upDown)) <= 1);

for (const mode of ['roc', 'stochrsi', 'macd']) {
    const s = computeRohitMomentum(wave, { mode });
    const st = readMomentumState(s);
    check(`Mode '${mode}' produces a readable state`, st.ready && st.regime !== undefined);
}

// 260 bars so the 169 EMA Tunnel is fully warmed up, not just the 34 EMA Wave.
const trendUp = Array.from({ length: 260 }, (_, i) => 1000 * Math.pow(1.004, i));
const trendState = readMomentumState(computeRohitMomentum(trendUp));
check('A persistent uptrend reads as a bullish regime', trendState.regime === 'BULLISH',
    `fast=${trendState.fast?.toFixed(3)}`);

// ---------------------------------------------------------------------------
section('4. Wavy Tunnel');

const bars = trendUp.map((c) => ({ high: c * 1.01, low: c * 0.99, close: c }));
const tunnel = computeWavyTunnel(bars);
const tState = readTunnelState(tunnel, bars, null, 'BULLISH');

check('Wave band is detected when high/low differ', tunnel.waveBandAvailable);
check('Tunnel is fully warmed up with 260 bars', tState.tunnelReady);
check('Tunnel confirms a clean uptrend', tState.confirms, tState.setupLabel);
check('Tunnel does NOT confirm the opposite direction',
    !readTunnelState(tunnel, bars, null, 'BEARISH').confirms);
check('Tunnel reports tunnelReady=false with too little history',
    readTunnelState(computeWavyTunnel(bars.slice(0, 60)), bars.slice(0, 60), null, 'BULLISH').tunnelReady === false);

const closeOnly = trendUp.map((c) => ({ high: c, low: c, close: c }));
check('Wave band flagged unavailable when only closes exist',
    computeWavyTunnel(closeOnly).waveBandAvailable === false);

// ---------------------------------------------------------------------------
section('5. Entry gate');

const toBars = (closes) => closes.map((c) => ({ high: c * 1.008, low: c * 0.992, close: c }));

// Downtrend that has just turned up — a fresh bullish crossover.
const turnBars = toBars([
    ...Array.from({ length: 200 }, (_, i) => 1400 - i * 2),
    ...Array.from({ length: 3 }, (_, i) => 1000 + (i + 1) * 9),
]);
const entry = evaluateEntry(turnBars);

check('Reversal produces a bullish bias', entry.bias === 'BULLISH', `score ${entry.score}`);
check('A fresh crossover is flagged as triggered', entry.momentum.triggered,
    `${entry.momentum.barsSinceCross} bars since the cross`);
check('Reversal with RSI agreement is eligible', entry.eligible, entry.grade);
check('Entry carries a graded score in 0..10', entry.score >= 0 && entry.score <= 10);
check('Every check row has a name and a boolean pass',
    entry.checks.every((c) => typeof c.name === 'string' && typeof c.pass === 'boolean'));

// The OR gate in action: here RSI alone carries the confirmation, because after
// a long decline price is still under the Wave and the Tunnel cannot confirm.
check('RSI alone can confirm an entry', entry.confirmedBy.includes('RSI'),
    `confirmed by ${entry.confirmedBy.join(' + ')}`);
check('An eligible entry always has at least one confirmation',
    !entry.eligible || entry.confirmedBy.length > 0);

// A noisy uptrend: crossovers occur naturally as price wobbles around trend.
// Rather than hand-tune one bar, walk the last 120 endpoints and confirm the
// Tunnel path fires somewhere — that is what exercises the second confirmation.
let lcg = 42;
const rand = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
const noisyTrend = [];
let px = 800;
for (let i = 0; i < 420; i++) {
    px *= 1 + 0.0025 + rand() * 0.035;
    noisyTrend.push(px);
}
const noisyBars = toBars(noisyTrend);

const walk = [];
for (let end = noisyBars.length - 120; end <= noisyBars.length; end++) {
    walk.push(evaluateEntry(noisyBars.slice(0, end)));
}
const tunnelConfirmed = walk.filter((e) => e.confirmedBy.includes('Wavy Tunnel'));
const dualConfirmed = walk.filter((e) => e.confirmedBy.length === 2);
const eligible = walk.filter((e) => e.eligible);

check('The Wavy Tunnel confirmation path fires on a real-looking trend',
    tunnelConfirmed.length > 0, `${tunnelConfirmed.length}/${walk.length} bars`);
check('Some bars are confirmed by RSI and the Tunnel together',
    dualConfirmed.length > 0, `${dualConfirmed.length} dual-confirmed bars`);
// Only compare bars that actually carry a fresh trigger — a stale cross scores
// no trigger points however many confirmations agree, which is by design.
const dualFresh = dualConfirmed.filter((e) => e.momentum.triggered);
check('A fresh, dual-confirmed bar always grades B or better',
    dualFresh.length > 0 && dualFresh.every((e) => e.score >= 6),
    `${dualFresh.length} bars, min score ${Math.min(...dualFresh.map((e) => e.score))}`);
check('Eligible entries are a strict subset of triggered crossovers',
    eligible.every((e) => e.momentum.triggered), `${eligible.length} eligible bars`);
check('Eligible entries never carry an end-of-trend Tunnel veto',
    eligible.every((e) => !e.tunnel.contradicts));

const knownSetups = ['BO-1', 'BO-2', 'BO-3', 'BO-4', 'PW', 'FG', 'WAVE-ONLY'];
const seenSetups = [...new Set(walk.map((e) => e.tunnel.setup).filter(Boolean))];
check('Setups classified on the walk are all recognised labels',
    seenSetups.length > 0 && seenSetups.every((s) => knownSetups.includes(s)),
    seenSetups.join(', '));

// A parabolic blow-off must be classified PW and must VETO a long entry, even
// though momentum and RSI are both screaming bullish. This is the guard that
// stops the scanner buying the top of a move.
const blowOffCloses = [
    ...Array.from({ length: 220 }, (_, i) => 1000 * Math.pow(1.003, i)),
    ...Array.from({ length: 12 }, (_, i) => 1000 * Math.pow(1.003, 219) * (1 + (i + 1) * 0.022)),
    1000 * Math.pow(1.003, 219) * 1.264 * 0.999,
];
const blowOffBars = toBars(blowOffCloses);
const blowOffTunnel = readTunnelState(computeWavyTunnel(blowOffBars), blowOffBars, null, 'BULLISH');
check('A hyper-extended blow-off is classified PW', blowOffTunnel.setup === 'PW',
    blowOffTunnel.setupLabel);
check('PW contradicts a trend-following entry', blowOffTunnel.contradicts);
const blowOffEntry = evaluateEntry(blowOffBars);
check('The PW veto blocks the entry even with bullish momentum',
    !blowOffEntry.eligible && blowOffEntry.blockers.some((b) => b.includes('PW')),
    blowOffEntry.blockers.join(' | '));

// Stale cross: same reversal, but ten bars later it is no longer a trigger.
const staleBars = toBars([
    ...Array.from({ length: 200 }, (_, i) => 1400 - i * 2),
    ...Array.from({ length: 12 }, (_, i) => 1000 + (i + 1) * 9),
]);
const stale = evaluateEntry(staleBars);
check('A stale crossover does not qualify as an entry',
    !stale.momentum.triggered && !stale.eligible,
    `${stale.momentum.barsSinceCross} bars since the cross`);

const short = evaluateEntry(turnBars.slice(0, 10));
check('Too little history is rejected with a reason', !short.eligible && short.blockers.length > 0,
    short.blockers[0]);

// ---------------------------------------------------------------------------
section('6. Calendar spread construction');

// Synthetic chain: front expiry 25 days out at 35% IV, back 53 days at 30% IV.
const asOf = new Date(Date.UTC(2026, 1, 2));
const frontDate = new Date(Date.UTC(2026, 1, 27));
const backDate = new Date(Date.UTC(2026, 2, 27));
const spot = 1000;
const IV_FRONT = 0.35;
const IV_BACK = 0.3;

const chain = [];
for (let k = 900; k <= 1100; k += 20) {
    for (const [date, expiry, iv] of [
        [frontDate, '27-FEB-2026', IV_FRONT],
        [backDate, '27-MAR-2026', IV_BACK],
    ]) {
        for (const type of ['CE', 'PE']) {
            chain.push({
                symbol: 'TEST',
                expiry,
                type,
                strike: k,
                close: bsPrice(spot, k, yearsToExpiry(asOf, date), 0.065, iv, type),
                oi: 5000,
                volume: 1200,
                underlying: spot,
            });
        }
    }
}

const plan = buildCalendarSpread({
    symbol: 'TEST', contracts: chain, spot, bias: 'BULLISH', asOfDate: asOf, lotSize: 250,
});

check('Calendar is viable on a well-formed chain', plan.viable, plan.reasons?.[0] || '');
check('Front leg is sold, back leg is bought',
    plan.legs[0].action === 'SELL' && plan.legs[1].action === 'BUY');
check('Both legs share the same strike', plan.legs[0].instrument.startsWith(String(plan.strike))
    && plan.legs[1].instrument.startsWith(String(plan.strike)));
check('Bullish bias places the strike at or above spot', plan.strike >= spot, `strike ${plan.strike}`);
check('Bullish bias uses calls', plan.type === 'CE');
check('Net debit is positive', plan.netDebit > 0, `debit ${plan.netDebit.toFixed(2)}`);
check('Recovered front IV matches the input 35%', near(plan.ivFront, IV_FRONT, 0.005),
    `${(plan.ivFront * 100).toFixed(2)}%`);
check('Recovered back IV matches the input 30%', near(plan.ivBack, IV_BACK, 0.005),
    `${(plan.ivBack * 100).toFixed(2)}%`);
check('IV edge is positive (selling the richer front)', plan.ivEdge > 0,
    `${(plan.ivEdge * 100).toFixed(2)} points`);
check('Net theta is positive (position earns time)', plan.netGreeks.theta > 0,
    `${plan.netGreeks.theta.toFixed(4)}/day`);
check('Net vega is positive (position is long volatility)', plan.netGreeks.vega > 0,
    `${plan.netGreeks.vega.toFixed(4)}`);
check('Max loss equals the debit paid', near(plan.maxLoss, plan.netDebit * 250, 1e-6));

const peak = plan.payoff.peakUnderlying;
check('Payoff peaks at the strike', Math.abs(peak - plan.strike) / plan.strike < 0.02,
    `peak ${peak.toFixed(0)} vs strike ${plan.strike}`);
check('Profit zone brackets the strike',
    plan.profitZone && plan.profitZone.low < plan.strike && plan.profitZone.high > plan.strike,
    plan.profitZone ? `${plan.profitZone.low.toFixed(0)}—${plan.profitZone.high.toFixed(0)}` : 'none');
check('Max profit is positive', plan.maxProfit > 0, `${plan.maxProfit.toFixed(0)}`);
check('Far from the strike the spread loses money',
    plan.payoff.points[0].pnl < 0 && plan.payoff.points.at(-1).pnl < 0);

const bear = buildCalendarSpread({
    symbol: 'TEST', contracts: chain, spot, bias: 'BEARISH', asOfDate: asOf, lotSize: 250,
});
check('Bearish bias uses puts below spot', bear.type === 'PE' && bear.strike <= spot,
    `${bear.strike} PE`);

const singleExpiry = chain.filter((r) => r.expiry === '27-FEB-2026');
const noBack = buildCalendarSpread({
    symbol: 'TEST', contracts: singleExpiry, spot, bias: 'BULLISH', asOfDate: asOf, lotSize: 250,
});
check('A one-expiry chain is rejected with an explanation',
    !noBack.viable && /two expiries/i.test(noBack.reasons[0]));

const sized = sizePosition(plan, { accountEquity: 1000000, riskPct: 1, stopPct: 0.5 });
check('Position sizing returns a whole number of lots', Number.isInteger(sized.lots) && sized.lots >= 0,
    `${sized.lots} lots`);
check('Risk at the stop stays inside the budget', sized.totalRisk <= sized.riskBudget + 1e-6,
    `${sized.totalRisk.toFixed(0)} <= ${sized.riskBudget.toFixed(0)}`);

// ---------------------------------------------------------------------------
section('7. Exit ladder');

const exitPlan = buildExitPlan(plan);
check('Exit plan has all six rules', exitPlan.rules.length === 6);
check('Rules are ordered by priority',
    exitPlan.rules.every((r, i) => i === 0 || r.priority >= exitPlan.rules[i - 1].priority));
check('Time stop lands before front expiry', exitPlan.levels.timeStopDate < plan.front.date);
check('Target is above the debit, stop is below',
    exitPlan.levels.targetValue > plan.netDebit && exitPlan.levels.stopValue < plan.netDebit,
    `${exitPlan.levels.stopValue.toFixed(2)} < ${plan.netDebit.toFixed(2)} < ${exitPlan.levels.targetValue.toFixed(2)}`);

const holdCheck = evaluateExit(plan, exitPlan, { date: asOf, spot });
check('A fresh position at entry reads HOLD', holdCheck.action === 'HOLD', holdCheck.summary);
check('Entry-day P&L is approximately flat', Math.abs(holdCheck.pnlPct) < 0.02,
    `${(holdCheck.pnlPct * 100).toFixed(2)}%`);

const breach = evaluateExit(plan, exitPlan, { date: asOf, spot: plan.profitZone.high * 1.1 });
check('Leaving the profit zone fires TENT_BREACH',
    breach.triggered.some((t) => t.id === 'TENT_BREACH' && t.severity === 'EXIT'), breach.summary);
check('A tent breach results in an EXIT action', breach.action === 'EXIT');

const nearExpiry = new Date(plan.front.date.getTime() - 2 * 86400000);
const timeStop = evaluateExit(plan, exitPlan, { date: nearExpiry, spot });
check('Approaching front expiry fires TIME_STOP',
    timeStop.triggered.some((t) => t.id === 'TIME_STOP'), timeStop.summary);
check('TIME_STOP outranks every other rule', timeStop.primary.id === 'TIME_STOP');

const stopHit = evaluateExit(plan, exitPlan, {
    date: asOf, spot, frontPrice: 100, backPrice: 100 + exitPlan.levels.stopValue * 0.5,
});
check('A collapsed spread fires HARD_STOP',
    stopHit.triggered.some((t) => t.id === 'HARD_STOP'), stopHit.summary);

const targetHit = evaluateExit(plan, exitPlan, {
    date: asOf, spot, frontPrice: 50, backPrice: 50 + exitPlan.levels.targetValue * 1.05,
});
check('A spread above target fires PROFIT_TARGET',
    targetHit.triggered.some((t) => t.id === 'PROFIT_TARGET'), targetHit.summary);

// Leg prices pinned at the entry debit so the P&L rules stay quiet and only
// the term-structure rule can fire.
const volCrush = evaluateExit(plan, exitPlan, {
    date: asOf,
    spot,
    frontPrice: 100,
    backPrice: 100 + plan.netDebit,
    ivFront: IV_BACK - 0.06,
    ivBack: IV_BACK,
});
check('An adverse term-structure move fires VOL_EXIT',
    volCrush.triggered.some((t) => t.id === 'VOL_EXIT'), volCrush.summary);
check('VOL_EXIT alone is a WARN, not a forced exit', volCrush.action === 'WATCH', volCrush.action);

// Signal invalidation: feed bars whose momentum has flipped against a long.
const flipDown = [
    ...Array.from({ length: 120 }, (_, i) => 900 + i * 2),
    ...Array.from({ length: 20 }, (_, i) => 1140 - i * 12),
];
const flipBars = flipDown.map((c) => ({ high: c * 1.008, low: c * 0.992, close: c }));
const flipSignal = evaluateExit(plan, exitPlan, {
    date: asOf,
    spot,
    bars: flipBars,
    momentumSeries: computeRohitMomentum(flipBars.map((b) => b.close)),
    tunnelSeries: computeWavyTunnel(flipBars),
});
check('A momentum/RSI flip against the position fires SIGNAL_EXIT',
    flipSignal.triggered.some((t) => t.id === 'SIGNAL_EXIT'), flipSignal.summary);

// ---------------------------------------------------------------------------
section('8. End-to-end through the real CSV parsers');

// Rows shaped like the NSE dumps the dashboard actually ingests, pushed through
// parseFuturesData / parseOptionsData rather than hand-built objects. This is
// the seam that breaks on real files: date formats, contract descriptors and
// symbol matching between the two files.
const SESSIONS = 260;
const sessionDate = (i) => {
    const d = new Date(Date.UTC(2025, 4, 1) + i * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
    return `${dd}-${mon}-${d.getUTCFullYear()}`;
};

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);

const futuresRows = [];
const symbols = [
    { name: 'RELIANCE', start: 1400, drift: 0.0022 },
    { name: 'TATASTEEL', start: 160, drift: -0.0018 },
];

const lastClose = {};
symbols.forEach((s) => {
    let p = s.start;
    for (let i = 0; i < SESSIONS; i++) {
        p *= 1 + s.drift + rnd() * 0.03;
        futuresRows.push({
            Symbol: s.name,
            Date: sessionDate(i),
            Time: '15:30:00',
            Close: p.toFixed(2),
            High: (p * 1.009).toFixed(2),
            Low: (p * 0.991).toFixed(2),
            'Open Interest': String(Math.round(500000 + rnd() * 90000)),
            Volume: String(Math.round(1200000 + rnd() * 300000)),
        });
    }
    lastClose[s.name] = p;
});

const parsedFutures = parseFuturesData(futuresRows);
check('Futures parser returns one row per symbol per session',
    parsedFutures.length === SESSIONS * symbols.length, `${parsedFutures.length} rows`);
check('Futures parser carries High and Low through',
    parsedFutures.every((r) => r.high > r.close && r.low < r.close));

const optionRows = [];
const finalDate = new Date(Date.UTC(2025, 4, 1) + (SESSIONS - 1) * 86400000);
const expiries = [
    { label: '29-JAN-2026', date: new Date(Date.UTC(2026, 0, 29)), iv: 0.34 },
    { label: '26-FEB-2026', date: new Date(Date.UTC(2026, 1, 26)), iv: 0.3 },
];

symbols.forEach((s) => {
    const underlying = lastClose[s.name];
    const step = underlying > 500 ? 20 : 5;
    const atm = Math.round(underlying / step) * step;

    for (let n = -5; n <= 5; n++) {
        const k = atm + n * step;
        expiries.forEach((exp) => {
            ['CE', 'PE'].forEach((type) => {
                const t = yearsToExpiry(finalDate, exp.date);
                optionRows.push({
                    'Contract Descriptor': `OPTSTK${s.name}${exp.label}${type}${k}`,
                    Close: bsPrice(underlying, k, t, 0.065, exp.iv, type).toFixed(2),
                    'Open Interest': '8000',
                    Volume: '2500',
                    Underlying: underlying.toFixed(2),
                });
            });
        });
    }
});

const parsedOptions = parseOptionsData(optionRows);
check('Options parser decodes the contract descriptor',
    parsedOptions.length === optionRows.length, `${parsedOptions.length} contracts`);
check('Options parser recovers symbol, expiry, type and strike',
    parsedOptions.every((r) => symbols.some((s) => s.name === r.symbol) && r.expiry && r.type && r.strike > 0));
check('Both expiries survive parsing',
    new Set(parsedOptions.map((r) => r.expiry)).size === 2);

const scan = runMomentumScan(parsedFutures, parsedOptions);
check('Scan infers the as-of date from the futures history',
    scan.asOfDate instanceof Date && scan.asOfDate.getTime() === finalDate.getTime(),
    scan.asOfDate?.toISOString().slice(0, 10));
check('Scan returns a result for every symbol', scan.results.length === symbols.length);
check('Results are sorted by descending score',
    scan.results.every((r, i) => i === 0 || r.entry.score <= scan.results[i - 1].entry.score));
check('Every result explains itself',
    scan.results.every((r) => r.entry.eligible || r.entry.blockers.length > 0));
check('Tradable rows always carry a viable calendar and an exit plan',
    scan.tradable.every((r) => r.calendar?.viable && r.exitPlan?.rules.length === 6),
    `${scan.tradable.length} tradable`);
check('Tradable rows are priced off the option chain spot, not the futures close',
    scan.tradable.every((r) => r.usedFuturesAsSpot === false));

// Force a tradable row so the full chain is exercised even when the random
// walk happens not to produce a fresh crossover on the final bar.
const forced = analyzeSymbolEndToEnd(parsedFutures, parsedOptions, finalDate);
check('A forced eligible symbol produces a complete plan',
    forced.ok, forced.detail);

function analyzeSymbolEndToEnd(futures, options, asOfDate) {
    const bySymbol = new Map();
    futures.forEach((r) => {
        if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
        bySymbol.get(r.symbol).push(r);
    });

    for (const [symbol, rows] of bySymbol) {
        const contracts = options.filter((o) => o.symbol === symbol);
        // Walk backwards to find a bar where the entry gate genuinely opens.
        for (let end = rows.length; end > rows.length - 60; end--) {
            const slice = rows.slice(0, end);
            const res = analyzeSymbol({ symbol, bars: slice, contracts, asOfDate });
            if (res.entry.eligible && res.calendar?.viable) {
                const ok =
                    res.exitPlan.levels.stopValue < res.calendar.netDebit &&
                    res.exitPlan.levels.targetValue > res.calendar.netDebit &&
                    res.exitCheck !== null &&
                    res.calendar.profitZone !== null;
                return {
                    ok,
                    detail: `${symbol} ${res.entry.bias} ${res.calendar.strike} ${res.calendar.type}, debit ${res.calendar.netDebit.toFixed(
                        2
                    )}, zone ${res.calendar.profitZone.low.toFixed(0)}—${res.calendar.profitZone.high.toFixed(
                        0
                    )}, day-zero ${res.exitCheck.action}`,
                };
            }
        }
    }
    return { ok: false, detail: 'no eligible bar found in the last 60 sessions' };
}

// ---------------------------------------------------------------------------
console.log(`\n\x1b[1mResult:\x1b[0m ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
