/**
 * MODULE 13: Momentum -> Calendar Pipeline
 *
 * Ties the pieces together for the whole universe:
 *
 *   bars -> Rohit momentum crossover (trigger)
 *        -> RSI or Wavy Tunnel (confirmation)
 *        -> calendar spread construction (the trade)
 *        -> exit ladder (the plan)
 *
 * Symbols that fail a gate are still returned, carrying the reason they failed.
 * A scanner that silently drops rows teaches you nothing about why the screen
 * is empty on a quiet day.
 */

import { evaluateEntry, ENTRY_DEFAULTS } from './entry-signals';
import { buildCalendarSpread, sizePosition, CALENDAR_DEFAULTS } from './calendar-spread';
import { buildExitPlan, evaluateExit, EXIT_DEFAULTS } from './exit-rules';
import { parseExpiry } from './black-scholes';
import { LOT_SIZES } from '../constants/lot-sizes';

export const PIPELINE_DEFAULTS = {
    entry: ENTRY_DEFAULTS,
    calendar: CALENDAR_DEFAULTS,
    exit: EXIT_DEFAULTS,
    sizing: { accountEquity: 0, riskPct: 1, stopPct: 0.5 },
};

/** Groups parsed futures rows into per-symbol, chronologically sorted bars. */
export const groupBars = (futuresData) => {
    const map = new Map();

    futuresData.forEach((row) => {
        if (!map.has(row.symbol)) map.set(row.symbol, []);
        map.get(row.symbol).push({ ...row, parsedDate: parseExpiry(row.date) });
    });

    map.forEach((bars, symbol) => {
        bars.sort((a, b) => {
            if (a.parsedDate && b.parsedDate) return a.parsedDate - b.parsedDate;
            return String(a.date).localeCompare(String(b.date));
        });
        map.set(symbol, bars);
    });

    return map;
};

/** Latest date present in the futures history — the pipeline's "today". */
export const inferAsOfDate = (futuresData) => {
    let latest = null;
    futuresData.forEach((row) => {
        const d = parseExpiry(row.date);
        if (d && (!latest || d > latest)) latest = d;
    });
    return latest || new Date();
};

/** Runs the full chain for one symbol. */
export const analyzeSymbol = ({ symbol, bars, contracts, asOfDate, config = {} }) => {
    const c = {
        ...PIPELINE_DEFAULTS,
        ...config,
        entry: { ...ENTRY_DEFAULTS, ...(config.entry || {}) },
        calendar: { ...CALENDAR_DEFAULTS, ...(config.calendar || {}) },
        exit: { ...EXIT_DEFAULTS, ...(config.exit || {}) },
        sizing: { ...PIPELINE_DEFAULTS.sizing, ...(config.sizing || {}) },
    };

    const entry = evaluateEntry(bars, c.entry);
    const last = bars[bars.length - 1];

    // Prefer the cash underlying quoted on the option chain; fall back to the
    // futures close, which carries basis and would skew strike selection.
    const quotedSpot = contracts?.find((r) => r.underlying > 0)?.underlying;
    const spot = quotedSpot || last?.close;

    const result = {
        symbol,
        asOfDate,
        spot,
        usedFuturesAsSpot: !quotedSpot,
        bars,
        entry,
        calendar: null,
        exitPlan: null,
        exitCheck: null,
        sizing: null,
    };

    if (!entry.eligible) return result;

    const calendar = buildCalendarSpread({
        symbol,
        contracts,
        spot,
        bias: entry.bias,
        asOfDate,
        lotSize: LOT_SIZES[symbol] || 0,
        config: c.calendar,
    });
    result.calendar = calendar;

    if (!calendar.viable) return result;

    result.exitPlan = buildExitPlan(calendar, c.exit);
    result.sizing = sizePosition(calendar, c.sizing);

    // Day-zero read of the exit ladder: confirms the entry is not already
    // sitting on top of one of its own exit triggers (it happens — a signal
    // that fires the day before front expiry, for instance).
    result.exitCheck = evaluateExit(
        calendar,
        result.exitPlan,
        {
            date: asOfDate,
            spot,
            bars,
            momentumSeries: entry.momentumSeries,
            tunnelSeries: entry.tunnelSeries,
        },
        c.entry
    );

    return result;
};

/**
 * Scans the whole universe.
 * Returns `{ asOfDate, results, tradable, rejected }`, sorted by conviction.
 */
export const runMomentumScan = (futuresData, optionsData, config = {}) => {
    if (!futuresData || futuresData.length === 0) {
        return { asOfDate: null, results: [], tradable: [], rejected: [] };
    }

    const asOfDate = config.asOfDate || inferAsOfDate(futuresData);
    const barsBySymbol = groupBars(futuresData);

    const contractsBySymbol = (optionsData || []).reduce((acc, row) => {
        if (!acc[row.symbol]) acc[row.symbol] = [];
        acc[row.symbol].push(row);
        return acc;
    }, {});

    const results = [];
    barsBySymbol.forEach((bars, symbol) => {
        results.push(
            analyzeSymbol({
                symbol,
                bars,
                contracts: contractsBySymbol[symbol] || [],
                asOfDate,
                config,
            })
        );
    });

    results.sort((a, b) => (b.entry.score || 0) - (a.entry.score || 0));

    return {
        asOfDate,
        results,
        tradable: results.filter((r) => r.entry.eligible && r.calendar?.viable),
        rejected: results.filter((r) => !r.entry.eligible || !r.calendar?.viable),
    };
};
