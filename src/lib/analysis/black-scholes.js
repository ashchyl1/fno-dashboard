/**
 * MODULE 7: Black-Scholes Pricing, Implied Volatility and Greeks
 *
 * A calendar spread is a pure volatility / time-decay structure. Without a
 * pricing model there is no way to answer the two questions that actually
 * matter for it:
 *
 *   1. Is front-month IV richer than back-month IV? (the entry edge)
 *   2. Where does the profit "tent" collapse? (the exit trigger)
 *
 * So we carry a small, dependency-free Black-Scholes implementation. Indian
 * stock options are European-style, which is exactly what Black-Scholes prices.
 *
 * Conventions:
 *   S     spot / underlying
 *   K     strike
 *   T     time to expiry in YEARS
 *   r     risk-free rate as a decimal (0.065 = 6.5%)
 *   sigma volatility as a decimal (0.28 = 28%)
 *   type  'CE' (call) or 'PE' (put)
 */

export const DEFAULT_RISK_FREE_RATE = 0.065; // ~India 10y / MIBOR area
export const DAYS_PER_YEAR = 365;

/** Abramowitz & Stegun 7.1.26 error-function approximation (|err| < 1.5e-7). */
const erf = (x) => {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);

    const t = 1 / (1 + 0.3275911 * ax);
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
            0.254829592) *
            t *
            Math.exp(-ax * ax);

    return sign * y;
};

/** Standard normal CDF. */
export const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

/** Standard normal PDF. */
export const normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

const d1d2 = (S, K, T, r, sigma) => {
    const vt = sigma * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / vt;
    return { d1, d2: d1 - vt, vt };
};

/** Intrinsic value at expiry. */
export const intrinsic = (S, K, type) =>
    type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);

/** Black-Scholes theoretical price. Degrades to intrinsic at T <= 0. */
export const bsPrice = (S, K, T, r, sigma, type) => {
    if (!(S > 0) || !(K > 0)) return 0;
    if (T <= 0 || sigma <= 0) return intrinsic(S, K, type);

    const { d1, d2 } = d1d2(S, K, T, r, sigma);
    const disc = Math.exp(-r * T);

    return type === 'CE'
        ? S * normCdf(d1) - K * disc * normCdf(d2)
        : K * disc * normCdf(-d2) - S * normCdf(-d1);
};

/** Full greek set. Theta is PER DAY, vega is per 1 volatility POINT (1%). */
export const greeks = (S, K, T, r, sigma, type) => {
    if (T <= 0 || sigma <= 0 || !(S > 0) || !(K > 0)) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    }

    const { d1, d2 } = d1d2(S, K, T, r, sigma);
    const disc = Math.exp(-r * T);
    const sqrtT = Math.sqrt(T);

    const delta = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1;
    const gamma = normPdf(d1) / (S * sigma * sqrtT);
    const vega = (S * normPdf(d1) * sqrtT) / 100;

    const termA = -(S * normPdf(d1) * sigma) / (2 * sqrtT);
    const thetaAnnual =
        type === 'CE'
            ? termA - r * K * disc * normCdf(d2)
            : termA + r * K * disc * normCdf(-d2);

    return { delta, gamma, theta: thetaAnnual / DAYS_PER_YEAR, vega };
};

/**
 * Implied volatility by bisection.
 *
 * Bisection rather than Newton-Raphson on purpose: deep OTM contracts on
 * illiquid NSE stock options have near-zero vega, where Newton diverges wildly.
 * Bisection is slower but always converges inside the bracket.
 *
 * Returns null when the quoted price is unreachable (below intrinsic, zero, or
 * beyond the 500% vol ceiling) — a null IV is a signal to skip the contract,
 * not to substitute a guess.
 */
export const impliedVol = (
    marketPrice,
    S,
    K,
    T,
    r,
    type,
    { lo = 0.005, hi = 5, tolerance = 1e-5, maxIterations = 100 } = {}
) => {
    if (!(marketPrice > 0) || !(S > 0) || !(K > 0) || T <= 0) return null;
    if (marketPrice < intrinsic(S, K, type) - 1e-6) return null;

    let low = lo;
    let high = hi;

    if (bsPrice(S, K, T, r, high, type) < marketPrice) return null; // beyond ceiling
    if (bsPrice(S, K, T, r, low, type) > marketPrice) return null; // below floor

    for (let i = 0; i < maxIterations; i++) {
        const mid = (low + high) / 2;
        const price = bsPrice(S, K, T, r, mid, type);
        const diff = price - marketPrice;

        if (Math.abs(diff) < tolerance) return mid;
        if (diff > 0) high = mid;
        else low = mid;
    }
    return (low + high) / 2;
};

// --- Date helpers ------------------------------------------------------------

const MONTHS = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/**
 * Parses the expiry formats that show up in NSE dumps:
 * "24-FEB-2026", "24-Feb-2026", "2026-02-24".
 * Returns a Date at UTC midnight, or null.
 */
export const parseExpiry = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const s = String(value).trim();

    const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (dmy) {
        const month = MONTHS[dmy[2].toUpperCase()];
        if (month === undefined) return null;
        return new Date(Date.UTC(Number(dmy[3]), month, Number(dmy[1])));
    }

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
        return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    }

    const fallback = new Date(s);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
};

/** Calendar days between two dates (never negative). */
export const daysBetween = (from, to) => {
    if (!from || !to) return null;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
};

/** Time to expiry in years, floored just above zero so pricing stays finite. */
export const yearsToExpiry = (fromDate, expiryDate) => {
    const days = daysBetween(fromDate, expiryDate);
    if (days === null) return null;
    return Math.max(days, 0.5) / DAYS_PER_YEAR;
};
