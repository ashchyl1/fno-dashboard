/**
 * MODULE 10: Entry Signal Gate
 *
 * The entry rule this dashboard implements:
 *
 *   TRIGGER    a fresh Rohit-momentum crossover (mandatory)
 *   CONFIRM    RSI *or* the Wavy Tunnel agrees (mandatory — either one)
 *   VETO       the Tunnel is showing an end-of-trend setup (PW/FG) against it
 *
 * The confirmation is deliberately an OR, not an AND. RSI and the Wavy Tunnel
 * measure different things (internal strength vs. structural position) and
 * demanding both would reject most real signals. When both DO agree the setup
 * scores higher, which is what the conviction grade is for.
 */

import { rsi, slope } from './indicators';
import {
    computeRohitMomentum,
    readMomentumState,
    minimumBars,
    ROHIT_MOMENTUM_DEFAULTS,
} from './rohit-momentum';
import { computeWavyTunnel, readTunnelState, TUNNEL_DEFAULTS } from './wavy-tunnel';

export const RSI_DEFAULTS = {
    period: 14,
    midline: 50,
    overbought: 70,
    oversold: 30,
    slopeBars: 3,
};

export const ENTRY_DEFAULTS = {
    freshnessBars: 2, // a cross older than this is stale, not a trigger
    momentum: ROHIT_MOMENTUM_DEFAULTS,
    tunnel: TUNNEL_DEFAULTS,
    rsiConfig: RSI_DEFAULTS,
};

/** RSI confirmation read at bar `i` for a given directional bias. */
export const readRsiState = (closes, index = null, bias = null, config = {}) => {
    const c = { ...RSI_DEFAULTS, ...config };
    const values = rsi(closes, c.period);
    const i = index === null ? closes.length - 1 : index;
    const value = values[i];

    if (value === null) {
        return {
            ready: false,
            confirms: false,
            value: null,
            reason: `Need at least ${c.period + 1} bars for RSI(${c.period})`,
        };
    }

    const rsiSlope = slope(values, i, c.slopeBars);
    const rising = rsiSlope !== null && rsiSlope > 0;
    const falling = rsiSlope !== null && rsiSlope < 0;

    const bullConfirm = value > c.midline && rising;
    const bearConfirm = value < c.midline && falling;

    // "Exhausted" is not a rejection — momentum trades often start from an
    // extended RSI. But for a calendar spread, which needs the underlying to
    // settle NEAR the strike rather than run away, it is a real caution.
    const exhausted =
        (bias === 'BULLISH' && value > c.overbought) || (bias === 'BEARISH' && value < c.oversold);

    const confirms = bias === 'BULLISH' ? bullConfirm : bias === 'BEARISH' ? bearConfirm : false;

    return {
        ready: true,
        value,
        slope: rsiSlope,
        rising,
        falling,
        confirms,
        exhausted,
        series: values,
        reason: confirms
            ? `RSI ${value.toFixed(1)} is ${bias === 'BULLISH' ? 'above' : 'below'} ${
                  c.midline
              } and ${bias === 'BULLISH' ? 'rising' : 'falling'}${
                  exhausted ? ' — but already stretched' : ''
              }`
            : `RSI ${value.toFixed(1)} does not confirm a ${String(bias).toLowerCase()} entry`,
    };
};

const gradeFor = (score) => {
    if (score >= 7.5) return 'A — take the trade';
    if (score >= 6) return 'B — tradable, size down';
    if (score >= 4.5) return 'C — watchlist only';
    return 'No trade';
};

/**
 * Evaluates one symbol's bar series and returns the entry decision.
 *
 * `bars` must be chronologically sorted `[{ date, high, low, close, ... }]`.
 */
export const evaluateEntry = (bars, config = {}) => {
    const c = {
        ...ENTRY_DEFAULTS,
        ...config,
        momentum: { ...ROHIT_MOMENTUM_DEFAULTS, ...(config.momentum || {}) },
        tunnel: { ...TUNNEL_DEFAULTS, ...(config.tunnel || {}) },
        rsiConfig: { ...RSI_DEFAULTS, ...(config.rsiConfig || {}) },
    };

    const closes = bars.map((b) => b.close);
    const needed = minimumBars(c.momentum);

    if (closes.length < needed) {
        return {
            eligible: false,
            score: 0,
            grade: 'No trade',
            bias: null,
            blockers: [`Only ${closes.length} bars of history; need at least ${needed}`],
            checks: [],
        };
    }

    // --- 1. Trigger ----------------------------------------------------------
    const momentumSeries = computeRohitMomentum(closes, c.momentum);
    const momentumState = readMomentumState(momentumSeries, null, {
        freshness: c.freshnessBars,
    });

    const bias = momentumState.direction;

    // --- 2. Confirmations ----------------------------------------------------
    const rsiState = readRsiState(closes, null, bias, c.rsiConfig);
    const tunnelSeries = computeWavyTunnel(bars, c.tunnel);
    const tunnelState = readTunnelState(tunnelSeries, bars, null, bias);

    // --- 3. Score ------------------------------------------------------------
    let score = 0;
    const checks = [];
    const blockers = [];

    if (momentumState.triggered) {
        score += momentumState.barsSinceCross === 0 ? 3 : 2.5;
        checks.push({ name: 'Rohit Momentum crossover', pass: true, detail: momentumState.reason });
    } else {
        blockers.push(momentumState.reason);
        checks.push({ name: 'Rohit Momentum crossover', pass: false, detail: momentumState.reason });
    }

    if (momentumState.zeroConfirmed) {
        score += 1.5;
        checks.push({
            name: 'Zero-line regime',
            pass: true,
            detail: `Momentum is ${momentumState.fast > 0 ? 'above' : 'below'} zero — regime agrees with the cross`,
        });
    } else {
        checks.push({
            name: 'Zero-line regime',
            pass: false,
            detail: 'Cross has not been confirmed by a zero-line cross yet',
        });
    }

    if (momentumState.expanding) {
        score += 1;
        checks.push({
            name: 'Histogram expanding',
            pass: true,
            detail: 'Fast and signal lines are still separating',
        });
    }

    if (rsiState.confirms) {
        score += 2;
        if (!rsiState.exhausted) score += 0.5;
        else score -= 1;
    }
    checks.push({
        name: `RSI(${c.rsiConfig.period}) confirmation`,
        pass: rsiState.confirms,
        detail: rsiState.reason,
    });

    if (tunnelState.confirms) {
        score += 2.5;
        if (tunnelState.tunnelReady && String(tunnelState.setup).startsWith('BO')) score += 0.5;
    }
    checks.push({
        name: 'Wavy Tunnel confirmation',
        pass: tunnelState.confirms,
        detail: tunnelState.ready ? `${tunnelState.setupLabel} — ${tunnelState.reason}` : tunnelState.reason,
    });

    if (rsiState.confirms && tunnelState.confirms) {
        score += 1;
        checks.push({
            name: 'Both confirmations agree',
            pass: true,
            detail: 'RSI and Wavy Tunnel point the same way — highest-quality version of this setup',
        });
    }

    if (tunnelState.contradicts) {
        score -= 2;
        blockers.push(
            `Wavy Tunnel is showing ${tunnelState.setup}, an end-of-trend setup against this direction`
        );
    }

    // --- 4. Gate -------------------------------------------------------------
    const confirmed = rsiState.confirms || tunnelState.confirms;
    if (!confirmed) blockers.push('Neither RSI nor the Wavy Tunnel confirms the crossover');

    score = Math.max(0, Math.min(10, Number(score.toFixed(1))));
    const eligible = momentumState.triggered && confirmed && !tunnelState.contradicts;

    return {
        eligible,
        bias,
        score,
        grade: eligible ? gradeFor(score) : 'No trade',
        confirmedBy: [
            rsiState.confirms ? 'RSI' : null,
            tunnelState.confirms ? 'Wavy Tunnel' : null,
        ].filter(Boolean),
        momentum: momentumState,
        momentumSeries,
        rsi: rsiState,
        tunnel: tunnelState,
        tunnelSeries,
        checks,
        blockers,
    };
};
