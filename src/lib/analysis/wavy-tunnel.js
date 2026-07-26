/**
 * MODULE 9: Wavy Tunnel
 *
 * Standard Wavy Tunnel chart furniture:
 *
 *   The Wave   — 34 EMA of High, 34 EMA of Close, 34 EMA of Low (a band)
 *   The Tunnel — 144 EMA and 169 EMA of Close (a channel)
 *   The Filter — 12 EMA of Close (early warning / entry confirmation line)
 *   CAO        — 5/34/5 momentum histogram, used for divergence
 *
 * Used here as the structural CONFIRMATION for a Rohit-momentum crossover:
 * momentum says "now", the tunnel says "and the structure agrees".
 *
 * Graceful degradation matters. NSE bhavcopy archives are often only a few
 * months deep, and the Tunnel needs 169 bars. When there aren't enough bars we
 * report `tunnelReady: false` and confirm on the Wave and Filter alone, rather
 * than silently confirming on EMAs that are still warming up.
 */

import { ema, slope } from './indicators';

export const TUNNEL_DEFAULTS = {
    wavePeriod: 34,
    tunnelFast: 144,
    tunnelSlow: 169,
    filterPeriod: 12,
    caoFast: 5,
    caoSlow: 34,
    caoSignal: 5,
};

/**
 * `bars` is `[{ high, low, close }]`. High/low fall back to close when the CSV
 * only carries settlement prices — the Wave then collapses to a single line,
 * which is flagged via `waveBandAvailable`.
 */
export const computeWavyTunnel = (bars, config = {}) => {
    const c = { ...TUNNEL_DEFAULTS, ...config };

    const highs = bars.map((b) => (Number.isFinite(b.high) ? b.high : b.close));
    const lows = bars.map((b) => (Number.isFinite(b.low) ? b.low : b.close));
    const closes = bars.map((b) => b.close);

    const waveBandAvailable = bars.some(
        (b) => Number.isFinite(b.high) && Number.isFinite(b.low) && b.high !== b.low
    );

    const waveHigh = ema(highs, c.wavePeriod);
    const waveClose = ema(closes, c.wavePeriod);
    const waveLow = ema(lows, c.wavePeriod);
    const tunnelFast = ema(closes, c.tunnelFast);
    const tunnelSlow = ema(closes, c.tunnelSlow);
    const filter = ema(closes, c.filterPeriod);

    // CAO: momentum of the median price, fast EMA minus slow EMA, plus signal.
    const median = bars.map((b, i) => (highs[i] + lows[i]) / 2);
    const caoFastLine = ema(median, c.caoFast);
    const caoSlowLine = ema(median, c.caoSlow);
    const cao = median.map((_, i) =>
        caoFastLine[i] === null || caoSlowLine[i] === null ? null : caoFastLine[i] - caoSlowLine[i]
    );
    const caoSignalLine = ema(cao, c.caoSignal);
    const caoHistogram = cao.map((v, i) =>
        v === null || caoSignalLine[i] === null ? null : v - caoSignalLine[i]
    );

    return {
        waveHigh,
        waveClose,
        waveLow,
        tunnelFast,
        tunnelSlow,
        filter,
        cao,
        caoSignal: caoSignalLine,
        caoHistogram,
        waveBandAvailable,
        config: c,
    };
};

/**
 * Classifies the price/Wave/Tunnel geometry at bar `i` into one of the six
 * Wavy Tunnel setups, and reports whether it confirms `bias`
 * ('BULLISH' | 'BEARISH').
 */
export const readTunnelState = (tunnel, bars, index = null, bias = null) => {
    const i = index === null ? bars.length - 1 : index;
    const {
        waveHigh, waveClose, waveLow, tunnelFast, tunnelSlow, filter, caoHistogram,
    } = tunnel;

    const close = bars[i]?.close;
    const waveTop = waveHigh[i];
    const waveBottom = waveLow[i];
    const waveMid = waveClose[i];
    const filt = filter[i];

    if (!Number.isFinite(close) || waveMid === null || filt === null) {
        return {
            ready: false,
            tunnelReady: false,
            confirms: false,
            setup: null,
            reason: `Need at least ${tunnel.config.wavePeriod} bars for the Wave`,
        };
    }

    const tunnelReady = tunnelFast[i] !== null && tunnelSlow[i] !== null;
    const tunnelTop = tunnelReady ? Math.max(tunnelFast[i], tunnelSlow[i]) : null;
    const tunnelBottom = tunnelReady ? Math.min(tunnelFast[i], tunnelSlow[i]) : null;

    const aboveFilter = close > filt;
    const aboveWave = close > waveTop;
    const belowWave = close < waveBottom;
    const waveSlope = slope(waveClose, i, 5);
    const filterSlope = slope(filter, i, 3);

    // --- setup classification -------------------------------------------------
    let setup = null;
    let setupLabel = 'No Wavy Tunnel setup';

    if (tunnelReady) {
        const waveAboveTunnel = waveMid > tunnelTop;
        const waveBelowTunnel = waveMid < tunnelBottom;
        const prevWave = waveClose[i - 1];
        const prevTunnelTop = Math.max(tunnelFast[i - 1] ?? tunnelTop, tunnelSlow[i - 1] ?? tunnelTop);
        const prevTunnelBottom = Math.min(
            tunnelFast[i - 1] ?? tunnelBottom,
            tunnelSlow[i - 1] ?? tunnelBottom
        );

        const waveJustCrossedUp = prevWave !== null && prevWave <= prevTunnelTop && waveAboveTunnel;
        const waveJustCrossedDown =
            prevWave !== null && prevWave >= prevTunnelBottom && waveBelowTunnel;

        // Distance of the Wave from the Tunnel, as a share of price. Small =
        // the Wave is hugging the Tunnel (BO-2 territory).
        const waveTunnelGap = Math.abs(waveMid - (tunnelTop + tunnelBottom) / 2) / close;

        if (waveJustCrossedUp || waveJustCrossedDown) {
            setup = 'BO-1';
            setupLabel = 'BO-1: Wave crossed the Tunnel (Wave 3 start)';
        } else if (waveTunnelGap < 0.01 && Math.abs(waveSlope ?? 0) > 0) {
            setup = 'BO-2';
            setupLabel = 'BO-2: Wave hugging the Tunnel and turning away';
        } else if (
            (waveAboveTunnel && close <= waveTop && close > tunnelTop) ||
            (waveBelowTunnel && close >= waveBottom && close < tunnelBottom)
        ) {
            setup = 'BO-3';
            setupLabel = 'BO-3: Price retraced to the Wave inside the trend';
        } else if (close <= tunnelTop && close >= tunnelBottom) {
            setup = 'BO-4';
            setupLabel = 'BO-4: Price testing the Tunnel (Wave 4 -> Wave 5)';
        }

        // End-of-trend overrides: price hyper-extended from the Wave with a CAO
        // that is no longer confirming ("rubber band effect").
        const stretch = Math.abs(close - waveMid) / close;
        const caoFading =
            caoHistogram[i] !== null &&
            caoHistogram[i - 1] !== null &&
            Math.abs(caoHistogram[i]) < Math.abs(caoHistogram[i - 1]);

        if (stretch > 0.08 && caoFading) {
            setup = 'PW';
            setupLabel = 'PW: Price hyper-extended from the Wave, momentum fading';
        } else if (
            ((waveAboveTunnel && (waveSlope ?? 0) < 0) || (waveBelowTunnel && (waveSlope ?? 0) > 0)) &&
            caoFading
        ) {
            setup = 'FG';
            setupLabel = 'FG: Wave turning back toward the Tunnel — gap to fill';
        }
    } else if (aboveWave || belowWave) {
        setup = 'WAVE-ONLY';
        setupLabel = `Wave/Filter only — fewer than ${tunnel.config.tunnelSlow} bars, Tunnel not yet valid`;
    }

    // --- does the structure agree with the momentum signal? -------------------
    const bullStructure =
        aboveFilter &&
        close > waveMid &&
        (filterSlope === null || filterSlope >= 0) &&
        (!tunnelReady || waveMid > tunnelBottom);

    const bearStructure =
        !aboveFilter &&
        close < waveMid &&
        (filterSlope === null || filterSlope <= 0) &&
        (!tunnelReady || waveMid < tunnelTop);

    const confirms =
        bias === 'BULLISH' ? bullStructure : bias === 'BEARISH' ? bearStructure : false;

    // PW and FG are counter-trend by construction — they contradict a
    // trend-following momentum cross rather than confirming it.
    const contradicts = setup === 'PW' || setup === 'FG';

    return {
        ready: true,
        tunnelReady,
        index: i,
        close,
        waveTop,
        waveMid,
        waveBottom,
        tunnelTop,
        tunnelBottom,
        filter: filt,
        aboveFilter,
        aboveWave,
        belowWave,
        waveSlope,
        filterSlope,
        setup,
        setupLabel,
        confirms: confirms && !contradicts,
        contradicts,
        structure: bullStructure ? 'BULLISH' : bearStructure ? 'BEARISH' : 'MIXED',
        reason: confirms
            ? `Price is on the ${bias === 'BULLISH' ? 'bull' : 'bear'} side of the Filter and Wave${
                  tunnelReady ? ' with the Tunnel aligned' : ' (Tunnel not yet valid)'
              }`
            : contradicts
            ? `${setup} is an end-of-trend setup — it argues against a fresh trend entry`
            : 'Price/Wave/Filter geometry does not support this direction',
    };
};
