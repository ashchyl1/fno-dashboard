/**
 * MODULE 11: Calendar Spread Construction
 *
 * A calendar (horizontal) spread: SELL the near-month option and BUY the
 * same-strike option in the next expiry.
 *
 *   Net debit  = back premium - front premium   (you pay to put it on)
 *   Max loss   = the net debit. Defined risk, always.
 *   Max profit = at the strike, on front-month expiry day.
 *
 * It makes money three ways: the front option decays faster than the back one
 * (positive theta), the position is long vega so a volatility rise helps, and
 * it profits if the underlying sits near the strike.
 *
 * Directional bias is expressed through STRIKE PLACEMENT, not through picking
 * calls vs puts for delta:
 *
 *   BULLISH  -> call calendar a strike or two ABOVE spot; you want price to
 *               drift UP into the peak of the tent by front expiry
 *   BEARISH  -> put calendar a strike or two BELOW spot
 *   NEUTRAL  -> at-the-money calendar
 *
 * That is the key reason this pairs well with a momentum crossover: momentum
 * tells you which side of spot to place the tent, and the calendar gets paid
 * by time even if the move is slow — which is exactly what a fresh crossover
 * on a daily chart usually delivers.
 */

import {
    bsPrice,
    greeks,
    impliedVol,
    intrinsic,
    parseExpiry,
    daysBetween,
    yearsToExpiry,
    DEFAULT_RISK_FREE_RATE,
} from './black-scholes';

export const CALENDAR_DEFAULTS = {
    riskFreeRate: DEFAULT_RISK_FREE_RATE,
    strikeOffset: 1, // strikes away from spot, in the direction of the bias
    minFrontDte: 5, // never sell a front leg inside this many days (gamma risk)
    maxFrontDte: 45, // front leg further out than this decays too slowly
    minLegOi: 100, // liquidity floor per leg, in contracts
    minNetDebit: 0.05, // reject non-sensical / stale quotes
    tentSteps: 161, // resolution of the payoff scan
    tentRange: 0.25, // scan spot +/- 25%
};

/** Groups a symbol's contracts into expiry buckets, sorted soonest first. */
export const buildExpiryLadder = (contracts, asOfDate) => {
    const buckets = new Map();

    contracts.forEach((row) => {
        const date = parseExpiry(row.expiry);
        if (!date) return;
        const key = date.toISOString().slice(0, 10);

        if (!buckets.has(key)) {
            buckets.set(key, { key, expiry: row.expiry, date, strikes: new Map(), totalOi: 0 });
        }
        const bucket = buckets.get(key);

        if (!bucket.strikes.has(row.strike)) {
            bucket.strikes.set(row.strike, { strike: row.strike });
        }
        const strike = bucket.strikes.get(row.strike);

        strike[`${row.type}_LTP`] = row.close;
        strike[`${row.type}_OI`] = row.oi;
        strike[`${row.type}_VOL`] = row.volume;
        bucket.totalOi += row.oi || 0;
    });

    return Array.from(buckets.values())
        .map((b) => ({ ...b, dte: daysBetween(asOfDate, b.date) }))
        .filter((b) => b.dte !== null && b.dte > 0)
        .sort((a, b) => a.date - b.date);
};

/** Smallest gap between adjacent strikes — the instrument's strike step. */
const strikeStep = (strikes) => {
    const sorted = [...strikes].sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < sorted.length; i++) {
        const d = sorted[i] - sorted[i - 1];
        if (d > 0) step = Math.min(step, d);
    }
    return Number.isFinite(step) ? step : null;
};

/**
 * Picks the strike for the tent: `offset` steps from spot in the bias
 * direction, snapped to a strike that actually trades in BOTH expiries.
 */
const selectStrike = (frontStrikes, backStrikes, spot, bias, offset, type) => {
    const common = [...frontStrikes.keys()].filter((k) => backStrikes.has(k));
    if (common.length === 0) return null;

    const step = strikeStep(common) ?? 0;
    const direction = bias === 'BULLISH' ? 1 : bias === 'BEARISH' ? -1 : 0;
    const target = spot + direction * offset * step;

    // Among strikes that carry a real quote on both legs, take the closest to
    // target. An unquoted leg cannot be traded, however good the strike looks.
    const quoted = common.filter(
        (k) =>
            (frontStrikes.get(k)[`${type}_LTP`] || 0) > 0 &&
            (backStrikes.get(k)[`${type}_LTP`] || 0) > 0
    );
    const pool = quoted.length > 0 ? quoted : common;

    return pool.reduce((best, k) =>
        Math.abs(k - target) < Math.abs(best - target) ? k : best
    );
};

/**
 * Values the spread at front-month expiry across a range of underlying prices.
 * At that moment the short front leg is worth exactly its intrinsic value, and
 * the long back leg still carries (backExpiry - frontExpiry) days of time value.
 *
 * Assumes back-month IV is unchanged. That is the standard planning assumption;
 * it is also the assumption the "IV crush" exit rule exists to protect against.
 */
export const projectPayoff = (params) => {
    const {
        spot, strike, type, backIv, riskFreeRate, netDebit, frontDate, backDate,
        steps = CALENDAR_DEFAULTS.tentSteps, range = CALENDAR_DEFAULTS.tentRange,
    } = params;

    const residualYears = yearsToExpiry(frontDate, backDate);
    const points = [];

    const lo = spot * (1 - range);
    const hi = spot * (1 + range);
    const stepSize = (hi - lo) / (steps - 1);

    for (let i = 0; i < steps; i++) {
        const S = lo + i * stepSize;
        const backValue = bsPrice(S, strike, residualYears, riskFreeRate, backIv, type);
        const frontValue = intrinsic(S, strike, type);
        const spreadValue = backValue - frontValue;
        points.push({ underlying: S, spreadValue, pnl: spreadValue - netDebit });
    }

    // Peak of the tent.
    const peak = points.reduce((a, b) => (b.pnl > a.pnl ? b : a), points[0]);

    // Breakevens: linear interpolation across each sign change in P&L.
    const breakevens = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (a.pnl === 0) breakevens.push(a.underlying);
        else if (a.pnl < 0 !== b.pnl < 0) {
            const t = -a.pnl / (b.pnl - a.pnl);
            breakevens.push(a.underlying + t * (b.underlying - a.underlying));
        }
    }

    return {
        points,
        maxProfitPerShare: peak.pnl,
        peakUnderlying: peak.underlying,
        lowerBreakeven: breakevens.length ? Math.min(...breakevens) : null,
        upperBreakeven: breakevens.length ? Math.max(...breakevens) : null,
        residualDays: daysBetween(frontDate, backDate),
    };
};

/**
 * Builds a full calendar spread plan for one symbol.
 *
 * Returns `{ viable, ...plan }`. When `viable` is false, `reasons` explains
 * exactly which condition failed — the dashboard surfaces those rather than
 * hiding the symbol, because "no tradable calendar here" is useful information.
 */
export const buildCalendarSpread = ({
    symbol,
    contracts,
    spot,
    bias = null,
    asOfDate,
    lotSize = 0,
    config = {},
}) => {
    const c = { ...CALENDAR_DEFAULTS, ...config };
    const reasons = [];
    const warnings = [];

    if (!contracts || contracts.length === 0) {
        return { viable: false, symbol, reasons: ['No option chain data for this symbol'] };
    }
    if (!(spot > 0)) {
        return { viable: false, symbol, reasons: ['No usable spot price'] };
    }

    const ladder = buildExpiryLadder(contracts, asOfDate);
    if (ladder.length < 2) {
        return {
            viable: false,
            symbol,
            reasons: [
                `A calendar needs two expiries; the chain only has ${ladder.length}. Upload an options file that spans the current and next month.`,
            ],
        };
    }

    // Skip a front month that is inside the gamma danger zone.
    let frontIdx = ladder.findIndex((e) => e.dte >= c.minFrontDte);
    if (frontIdx === -1 || frontIdx + 1 >= ladder.length) frontIdx = 0;

    const front = ladder[frontIdx];
    const back = ladder[frontIdx + 1];

    if (!back) {
        return { viable: false, symbol, reasons: ['No back month available behind the front expiry'] };
    }
    if (front.dte < c.minFrontDte) {
        warnings.push(
            `Front expiry is only ${front.dte} day(s) out — expiry-week gamma makes the short leg jumpy`
        );
    }
    if (front.dte > c.maxFrontDte) {
        warnings.push(`Front expiry is ${front.dte} days out — theta is still slow at this distance`);
    }

    const type = bias === 'BEARISH' ? 'PE' : 'CE';
    const strike = selectStrike(front.strikes, back.strikes, spot, bias, c.strikeOffset, type);

    if (strike === null) {
        return { viable: false, symbol, reasons: ['No strike is listed in both expiries'] };
    }

    const frontLeg = front.strikes.get(strike);
    const backLeg = back.strikes.get(strike);
    const frontPrice = frontLeg[`${type}_LTP`] || 0;
    const backPrice = backLeg[`${type}_LTP`] || 0;

    if (!(frontPrice > 0) || !(backPrice > 0)) {
        return {
            viable: false,
            symbol,
            reasons: [`No traded price on the ${strike} ${type} in one or both expiries`],
        };
    }

    const netDebit = backPrice - frontPrice;
    if (netDebit < c.minNetDebit) {
        return {
            viable: false,
            symbol,
            reasons: [
                `Back month (${backPrice.toFixed(2)}) is not priced above the front (${frontPrice.toFixed(
                    2
                )}). Inverted or stale quotes — a calendar cannot be built here.`,
            ],
        };
    }

    // --- Implied volatility and term structure -------------------------------
    const tFront = yearsToExpiry(asOfDate, front.date);
    const tBack = yearsToExpiry(asOfDate, back.date);

    const ivFront = impliedVol(frontPrice, spot, strike, tFront, c.riskFreeRate, type);
    const ivBack = impliedVol(backPrice, spot, strike, tBack, c.riskFreeRate, type);

    if (ivFront === null || ivBack === null) {
        warnings.push(
            'Implied volatility could not be solved on one leg — payoff projection falls back to a volatility estimate'
        );
    }

    const usableIvBack = ivBack ?? ivFront ?? 0.3;
    const usableIvFront = ivFront ?? usableIvBack;
    const ivEdge = usableIvFront - usableIvBack;

    // The classic calendar edge: sell rich near-term vol, own cheaper far-term
    // vol. A flat or inverted-the-wrong-way term structure removes that edge.
    if (ivEdge < -0.02) {
        warnings.push(
            `Front IV (${(usableIvFront * 100).toFixed(1)}%) is below back IV (${(
                usableIvBack * 100
            ).toFixed(1)}%) — you are selling the cheaper option. Weakest version of this trade.`
        );
    }

    // --- Liquidity -----------------------------------------------------------
    const frontOi = frontLeg[`${type}_OI`] || 0;
    const backOi = backLeg[`${type}_OI`] || 0;
    if (frontOi < c.minLegOi || backOi < c.minLegOi) {
        warnings.push(
            `Thin open interest (front ${frontOi}, back ${backOi}) — expect slippage getting in and out`
        );
    }

    // --- Greeks --------------------------------------------------------------
    const gFront = greeks(spot, strike, tFront, c.riskFreeRate, usableIvFront, type);
    const gBack = greeks(spot, strike, tBack, c.riskFreeRate, usableIvBack, type);

    const net = {
        delta: gBack.delta - gFront.delta,
        gamma: gBack.gamma - gFront.gamma,
        theta: gBack.theta - gFront.theta, // positive = the position earns per day
        vega: gBack.vega - gFront.vega, // positive = long volatility
    };

    // --- Payoff --------------------------------------------------------------
    const payoff = projectPayoff({
        spot,
        strike,
        type,
        backIv: usableIvBack,
        riskFreeRate: c.riskFreeRate,
        netDebit,
        frontDate: front.date,
        backDate: back.date,
    });

    const maxProfit = payoff.maxProfitPerShare * (lotSize || 1);
    const maxLoss = netDebit * (lotSize || 1);

    if (!lotSize) {
        warnings.push('Lot size unknown for this symbol — money values are shown per share');
    }

    return {
        viable: true,
        symbol,
        name: `${bias === 'BEARISH' ? 'Put' : 'Call'} Calendar Spread`,
        bias,
        type,
        strike,
        spot,
        asOfDate,
        lotSize,

        front: {
            expiry: front.expiry,
            date: front.date,
            dte: front.dte,
            price: frontPrice,
            iv: ivFront,
            oi: frontOi,
            greeks: gFront,
        },
        back: {
            expiry: back.expiry,
            date: back.date,
            dte: back.dte,
            price: backPrice,
            iv: ivBack,
            oi: backOi,
            greeks: gBack,
        },

        legs: [
            {
                action: 'SELL',
                instrument: `${strike} ${type} ${front.expiry}`,
                price: frontPrice,
                qty: lotSize,
            },
            {
                action: 'BUY',
                instrument: `${strike} ${type} ${back.expiry}`,
                price: backPrice,
                qty: lotSize,
            },
        ],

        netDebit,
        maxLoss,
        maxProfit,
        riskReward: maxLoss > 0 ? `1:${(maxProfit / maxLoss).toFixed(2)}` : '-',
        ivFront: usableIvFront,
        ivBack: usableIvBack,
        ivEdge,
        netGreeks: net,
        payoff,
        profitZone:
            payoff.lowerBreakeven !== null && payoff.upperBreakeven !== null
                ? { low: payoff.lowerBreakeven, high: payoff.upperBreakeven }
                : null,
        warnings,
        reasons,
    };
};

/**
 * Position sizing off the account's risk budget.
 *
 * Sized against the STOP, not against max loss. The exit plan cuts the trade at
 * `stopPct` of the debit, so that — not the full debit — is the loss you are
 * actually underwriting.
 */
export const sizePosition = (plan, { accountEquity, riskPct = 1, stopPct = 0.5 } = {}) => {
    if (!plan?.viable || !(accountEquity > 0)) return null;

    const riskBudget = accountEquity * (riskPct / 100);
    const perLotDebit = plan.netDebit * (plan.lotSize || 1);
    const perLotRisk = perLotDebit * stopPct;

    if (!(perLotRisk > 0)) return null;

    const lots = Math.floor(riskBudget / perLotRisk);

    return {
        riskBudget,
        perLotDebit,
        perLotRisk,
        lots,
        totalOutlay: lots * perLotDebit,
        totalRisk: lots * perLotRisk,
        note:
            lots === 0
                ? `One lot risks ${perLotRisk.toFixed(0)} at the stop, which is more than your ${riskPct}% budget of ${riskBudget.toFixed(0)}. Skip it or raise the budget — do not take a half-position you cannot stop out of.`
                : `${lots} lot(s): ${(lots * perLotDebit).toFixed(0)} outlay, ${(
                      lots * perLotRisk
                  ).toFixed(0)} at risk to the ${(stopPct * 100).toFixed(0)}% stop`,
    };
};
