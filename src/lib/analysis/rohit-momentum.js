/**
 * MODULE 8: Rohit's Momentum — dual-line momentum oscillator + crossover engine
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT — READ BEFORE TRUSTING THE NUMBERS
 * ---------------------------------------------------------------------------
 * "Rohit's Momentum Indicator" (Rohit Srivastava / Definedge, shipped in RZone
 * and TradePoint) is PROPRIETARY. Definedge publishes how to trade it but not
 * the formula, so this module does NOT claim to reproduce it bit-for-bit.
 *
 * What it does reproduce is the indicator's observable STRUCTURE, which is what
 * the trading rules actually key off:
 *
 *   - a fast momentum line and a slower signal line
 *   - a zero line separating bullish from bearish momentum
 *   - buy when fast crosses above signal, sell when it crosses below
 *   - the zero-line cross as the stronger, slower regime confirmation
 *
 * Three calculation MODES are provided so you can match whatever your platform
 * actually plots. Switch modes and tune the periods in the dashboard until the
 * crossover dates line up with your TradePoint chart, then leave them alone:
 *
 *   'roc'      (default) smoothed rate-of-change vs. its own EMA signal line
 *   'stochrsi' Stochastic-RSI %K vs %D — the variant most often described
 *              publicly as "Rohit's" momentum
 *   'macd'     classic MACD, as a familiar sanity baseline
 *
 * Every consumer of this module reads `fast`, `signal` and `histogram`, so a
 * mode change propagates through entries, confirmations and exits automatically.
 */

import { ema, sma, roc, rsi, crossAt, lastCross, slope } from './indicators';

export const MOMENTUM_MODES = ['roc', 'stochrsi', 'macd'];

export const ROHIT_MOMENTUM_DEFAULTS = {
    mode: 'roc',
    momentumPeriod: 14, // look-back for the raw rate-of-change
    smoothingPeriod: 3, // smoothing applied to the raw momentum -> fast line
    signalPeriod: 9, // EMA of the fast line -> signal line
    rsiPeriod: 14, // 'stochrsi' mode
    stochPeriod: 14, // 'stochrsi' mode
    kPeriod: 3, // 'stochrsi' mode
    dPeriod: 3, // 'stochrsi' mode
    macdFast: 12, // 'macd' mode
    macdSlow: 26, // 'macd' mode
};

/** Minimum bars needed before the chosen mode produces a usable signal line. */
export const minimumBars = (config = {}) => {
    const c = { ...ROHIT_MOMENTUM_DEFAULTS, ...config };
    switch (c.mode) {
        case 'stochrsi':
            return c.rsiPeriod + c.stochPeriod + c.kPeriod + c.dPeriod + 2;
        case 'macd':
            return c.macdSlow + c.signalPeriod + 2;
        default:
            return c.momentumPeriod + c.smoothingPeriod + c.signalPeriod + 2;
    }
};

const stochasticRsi = (closes, { rsiPeriod, stochPeriod, kPeriod, dPeriod }) => {
    const rsiVals = rsi(closes, rsiPeriod);
    const stoch = new Array(closes.length).fill(null);

    for (let i = 0; i < rsiVals.length; i++) {
        const window = rsiVals.slice(Math.max(0, i - stochPeriod + 1), i + 1);
        if (window.length < stochPeriod || window.some((v) => v === null)) continue;

        const lo = Math.min(...window);
        const hi = Math.max(...window);
        // A flat RSI window has no range; treat it as mid-scale rather than NaN.
        stoch[i] = hi === lo ? 50 : ((rsiVals[i] - lo) / (hi - lo)) * 100;
    }

    const k = sma(stoch, kPeriod);
    const d = sma(k, dPeriod);
    // Recentre on zero so the same zero-cross logic works across all modes.
    return { fast: k.map((v) => (v === null ? null : v - 50)), signal: d.map((v) => (v === null ? null : v - 50)) };
};

/**
 * Computes the oscillator over a close series.
 * Returns `{ fast, signal, histogram, config }` — all arrays aligned to `closes`.
 */
export const computeRohitMomentum = (closes, config = {}) => {
    const c = { ...ROHIT_MOMENTUM_DEFAULTS, ...config };
    let fast;
    let signal;

    if (c.mode === 'stochrsi') {
        ({ fast, signal } = stochasticRsi(closes, c));
    } else if (c.mode === 'macd') {
        const fastEma = ema(closes, c.macdFast);
        const slowEma = ema(closes, c.macdSlow);
        fast = closes.map((_, i) =>
            fastEma[i] === null || slowEma[i] === null ? null : fastEma[i] - slowEma[i]
        );
        signal = ema(fast, c.signalPeriod);
    } else {
        const raw = roc(closes, c.momentumPeriod);
        fast = ema(raw, c.smoothingPeriod);
        signal = ema(fast, c.signalPeriod);
    }

    const histogram = fast.map((v, i) =>
        v === null || signal[i] === null ? null : v - signal[i]
    );

    return { fast, signal, histogram, config: c };
};

/**
 * Reads the momentum state at bar `index` (defaults to the last bar).
 *
 * A trade is triggered by a FRESH signal-line cross — "fresh" meaning it
 * happened within `freshness` bars. Acting on a cross that is ten bars old is
 * chasing, not trading the signal, so stale crosses are reported but do not
 * set `triggered`.
 */
export const readMomentumState = (series, index = null, { freshness = 2, lookback = 15 } = {}) => {
    const { fast, signal, histogram } = series;
    const i = index === null ? fast.length - 1 : index;

    if (i < 1 || fast[i] === null || signal[i] === null) {
        return {
            ready: false,
            reason: 'Not enough price history for the momentum oscillator',
            triggered: false,
            direction: null,
        };
    }

    const signalCross = lastCross(fast, signal, i, lookback);
    const zeroCross = lastCross(fast, 0, i, lookback);
    const crossNow = crossAt(fast, signal, i);

    const direction = signalCross ? (signalCross.direction === 'UP' ? 'BULLISH' : 'BEARISH') : null;
    const isFresh = !!signalCross && signalCross.barsAgo <= freshness;

    // Histogram expanding = the two lines are still separating = momentum is
    // being added rather than bleeding away.
    const histSlope = slope(histogram, i, Math.min(3, i));
    const expanding =
        histSlope !== null &&
        ((direction === 'BULLISH' && histSlope > 0) || (direction === 'BEARISH' && histSlope < 0));

    return {
        ready: true,
        index: i,
        fast: fast[i],
        signal: signal[i],
        histogram: histogram[i],
        // Above/below zero is the regime; the signal cross is the trigger.
        regime: fast[i] > 0 ? 'BULLISH' : 'BEARISH',
        direction,
        triggered: isFresh,
        crossedThisBar: crossNow !== null,
        barsSinceCross: signalCross ? signalCross.barsAgo : null,
        signalCross,
        zeroCross,
        zeroConfirmed:
            !!zeroCross &&
            ((direction === 'BULLISH' && fast[i] > 0) || (direction === 'BEARISH' && fast[i] < 0)),
        expanding,
        reason: isFresh
            ? `Momentum crossed ${signalCross.direction} through its signal line ${
                  signalCross.barsAgo === 0 ? 'on the latest bar' : `${signalCross.barsAgo} bar(s) ago`
              }`
            : signalCross
            ? `Last cross was ${signalCross.barsAgo} bars ago — too stale to enter`
            : 'No momentum crossover in the look-back window',
    };
};

/**
 * Full crossover history — feeds the chart markers and any back-test.
 * Returns `[{ index, direction, fast, signal, aboveZero }]`.
 */
export const crossoverHistory = (series) => {
    const { fast, signal } = series;
    const events = [];

    for (let i = 1; i < fast.length; i++) {
        const dir = crossAt(fast, signal, i);
        if (!dir) continue;
        events.push({
            index: i,
            direction: dir,
            fast: fast[i],
            signal: signal[i],
            aboveZero: fast[i] > 0,
        });
    }
    return events;
};
