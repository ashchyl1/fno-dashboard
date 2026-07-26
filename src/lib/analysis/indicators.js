/**
 * MODULE 6: Indicator Primitives
 *
 * Pure array-in / array-out helpers. Every function returns an array the SAME
 * LENGTH as the input, with `null` in the warm-up region so that index `i` of
 * the result always lines up with index `i` of the source series.
 *
 * Callers should treat `null` as "not enough history yet", never as zero.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Simple moving average. */
export const sma = (values, period) => {
    const out = new Array(values.length).fill(null);
    if (period <= 0) return out;

    let sum = 0;
    let count = 0;

    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (!isNum(v)) {
            // A gap resets the window: we cannot average across missing data.
            sum = 0;
            count = 0;
            continue;
        }
        sum += v;
        count++;

        if (count > period) {
            sum -= values[i - period];
            count = period;
        }
        if (count === period) out[i] = sum / period;
    }
    return out;
};

/**
 * Exponential moving average, seeded with the SMA of the first `period` values
 * (the convention used by most charting packages, including TradePoint).
 */
export const ema = (values, period) => {
    const out = new Array(values.length).fill(null);
    if (period <= 0) return out;

    const k = 2 / (period + 1);
    let prev = null;
    let seedSum = 0;
    let seedCount = 0;

    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (!isNum(v)) continue;

        if (prev === null) {
            seedSum += v;
            seedCount++;
            if (seedCount === period) {
                prev = seedSum / period;
                out[i] = prev;
            }
            continue;
        }
        prev = v * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
};

/** Wilder's smoothing (used inside RSI and ATR). */
export const wilderSmooth = (values, period) => {
    const out = new Array(values.length).fill(null);
    let prev = null;
    let seedSum = 0;
    let seedCount = 0;

    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (!isNum(v)) continue;

        if (prev === null) {
            seedSum += v;
            seedCount++;
            if (seedCount === period) {
                prev = seedSum / period;
                out[i] = prev;
            }
            continue;
        }
        prev = (prev * (period - 1) + v) / period;
        out[i] = prev;
    }
    return out;
};

/**
 * Wilder's RSI. Returns values in 0..100.
 * The first RSI print appears at index `period` (needs `period` price changes).
 */
export const rsi = (closes, period = 14) => {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;

    const gains = new Array(closes.length).fill(null);
    const losses = new Array(closes.length).fill(null);

    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains[i] = change > 0 ? change : 0;
        losses[i] = change < 0 ? -change : 0;
    }

    // Drop the leading null so the Wilder seed uses exactly `period` changes.
    const avgGain = wilderSmooth(gains.slice(1), period);
    const avgLoss = wilderSmooth(losses.slice(1), period);

    for (let i = 0; i < avgGain.length; i++) {
        const g = avgGain[i];
        const l = avgLoss[i];
        if (g === null || l === null) continue;
        // Zero average loss means an unbroken run of up-closes -> RSI pinned at 100.
        out[i + 1] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
};

/** Rate of change, in percent: (close / close[n bars ago] - 1) * 100. */
export const roc = (values, period) => {
    const out = new Array(values.length).fill(null);
    for (let i = period; i < values.length; i++) {
        const base = values[i - period];
        if (!isNum(base) || base === 0 || !isNum(values[i])) continue;
        out[i] = (values[i] / base - 1) * 100;
    }
    return out;
};

/** Absolute momentum: close - close[n bars ago]. */
export const momentum = (values, period) => {
    const out = new Array(values.length).fill(null);
    for (let i = period; i < values.length; i++) {
        if (!isNum(values[i]) || !isNum(values[i - period])) continue;
        out[i] = values[i] - values[i - period];
    }
    return out;
};

/** Wilder's Average True Range. `bars` is an array of {high, low, close}. */
export const atr = (bars, period = 14) => {
    const tr = new Array(bars.length).fill(null);
    for (let i = 1; i < bars.length; i++) {
        const h = bars[i].high;
        const l = bars[i].low;
        const pc = bars[i - 1].close;
        if (!isNum(h) || !isNum(l) || !isNum(pc)) continue;
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const smoothed = wilderSmooth(tr.slice(1), period);
    const out = new Array(bars.length).fill(null);
    for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i];
    return out;
};

/** Sample standard deviation of the last `period` values, rolling. */
export const stdev = (values, period) => {
    const out = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
        const window = values.slice(i - period + 1, i + 1);
        if (window.some((v) => !isNum(v))) continue;
        const mean = window.reduce((a, b) => a + b, 0) / period;
        const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / (period - 1);
        out[i] = Math.sqrt(variance);
    }
    return out;
};

/**
 * Annualised historical volatility from close-to-close log returns.
 * Returns a decimal (0.28 = 28%), suitable for feeding Black-Scholes.
 */
export const historicalVolatility = (closes, period = 20, tradingDays = 252) => {
    const returns = new Array(closes.length).fill(null);
    for (let i = 1; i < closes.length; i++) {
        if (!isNum(closes[i]) || !isNum(closes[i - 1]) || closes[i - 1] <= 0) continue;
        returns[i] = Math.log(closes[i] / closes[i - 1]);
    }
    const sd = stdev(returns, period);
    return sd.map((v) => (v === null ? null : v * Math.sqrt(tradingDays)));
};

/**
 * Detects a crossover of `fast` over `slow` at the last index where both exist.
 * Returns 'UP', 'DOWN' or null. `slow` may be a number (e.g. the zero line).
 */
export const crossAt = (fast, slow, i) => {
    const slowAt = (idx) => (typeof slow === 'number' ? slow : slow[idx]);

    const f0 = fast[i - 1];
    const f1 = fast[i];
    const s0 = slowAt(i - 1);
    const s1 = slowAt(i);

    if (![f0, f1, s0, s1].every(isNum)) return null;
    if (f0 <= s0 && f1 > s1) return 'UP';
    if (f0 >= s0 && f1 < s1) return 'DOWN';
    return null;
};

/**
 * How many bars ago the most recent cross happened, scanning back from `from`.
 * Returns { direction, barsAgo, index } or null if no cross inside `lookback`.
 */
export const lastCross = (fast, slow, from, lookback = 10) => {
    for (let i = from; i > Math.max(0, from - lookback); i--) {
        const dir = crossAt(fast, slow, i);
        if (dir) return { direction: dir, barsAgo: from - i, index: i };
    }
    return null;
};

/** Slope of the last `period` values, expressed per bar. */
export const slope = (values, i, period = 3) => {
    const start = i - period;
    if (start < 0) return null;
    const a = values[start];
    const b = values[i];
    if (!isNum(a) || !isNum(b)) return null;
    return (b - a) / period;
};
