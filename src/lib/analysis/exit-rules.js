/**
 * MODULE 12: Exit Rules for the Momentum Calendar
 *
 * Entries are easy to specify; exits are where calendar spreads are won or
 * lost. A calendar has an exit problem no directional trade has: it can be
 * showing a profit and still be one gap away from being unmanageable, because
 * the short front leg goes into gamma overdrive in its final days.
 *
 * So the plan is a LADDER of six rules, evaluated every day in priority order.
 * The first one that fires wins, and each one is a hard number fixed at entry —
 * not a judgement call made while the position is moving.
 *
 *   1. TIME STOP        Close 2-3 sessions before the FRONT leg expires.
 *                       Non-negotiable, and the single most important rule.
 *                       Everything good about a calendar has already happened
 *                       by then; what is left is pin risk and assignment risk
 *                       on the short leg.
 *
 *   2. SIGNAL EXIT      The reason you entered has gone. An opposite Rohit
 *                       momentum crossover, RSI crossing back through 50, or a
 *                       close back through the Wavy Tunnel Filter against you.
 *                       This is the exit that pairs the position with the entry
 *                       logic — take it on the close of the signal bar, whether
 *                       the trade is green or red.
 *
 *   3. HARD STOP        Spread value falls to 50% of the net debit. The debit
 *                       is the theoretical max loss, but riding a calendar to
 *                       zero is a choice, not a risk. Half the debit is the
 *                       cut.
 *
 *   4. TENT BREACH      The underlying leaves the profit zone (the breakevens
 *                       of the tent). Past those levels the structure cannot
 *                       make money at front expiry no matter how much time is
 *                       left. Exit or roll the tent to a new strike.
 *
 *   5. PROFIT TARGET    Spread value reaches 125% of the net debit (+25%).
 *                       Calendars rarely reach their theoretical peak — that
 *                       requires the underlying to pin the strike exactly on
 *                       expiry day. Banking 20-30% is the realistic outcome.
 *
 *   6. VOL EXIT         Front IV drops below back IV by more than 3 points
 *                       after entry. The theta edge you sold has been repriced
 *                       away; the trade has become a pure long-vega bet you
 *                       did not sign up for.
 *
 * ROLLING: if rule 1 fires with the thesis still intact (momentum unchanged,
 * underlying still inside the tent), buy back the front leg and sell the next
 * expiry at the same strike instead of closing. That converts the position into
 * a fresh calendar without paying the full entry cost again.
 */

import { bsPrice, intrinsic, yearsToExpiry, daysBetween } from './black-scholes';
import { readMomentumState } from './rohit-momentum';
import { readRsiState } from './entry-signals';
import { readTunnelState } from './wavy-tunnel';

export const EXIT_DEFAULTS = {
    profitTargetPct: 0.25, // +25% on the net debit
    stopLossPct: 0.5, // -50% on the net debit
    timeStopDays: 3, // close this many days before front expiry
    ivCollapsePoints: 0.03, // 3 vol points of adverse term-structure move
    tentWarnPct: 0.2, // warn once inside 20% of the distance to a breakeven
};

/**
 * Turns a calendar plan into a concrete, numbered exit plan. Every level is a
 * price or a date you can put into an order ticket on day one.
 */
export const buildExitPlan = (plan, config = {}) => {
    if (!plan?.viable) return null;
    const c = { ...EXIT_DEFAULTS, ...config };

    const lot = plan.lotSize || 1;
    const targetValue = plan.netDebit * (1 + c.profitTargetPct);
    const stopValue = plan.netDebit * (1 - c.stopLossPct);

    const timeStopDate = new Date(plan.front.date.getTime() - c.timeStopDays * 86400000);

    return {
        config: c,

        rules: [
            {
                id: 'TIME_STOP',
                priority: 1,
                label: 'Time stop',
                trigger: `On or before ${timeStopDate.toISOString().slice(0, 10)} (${
                    c.timeStopDays
                } days before the ${plan.front.expiry} front leg expires)`,
                action: 'Close both legs, or roll the short leg to the next expiry if the thesis is intact',
                date: timeStopDate,
                rationale:
                    'Gamma on the short front leg goes vertical in the last sessions. This is the one rule with no exceptions.',
            },
            {
                id: 'SIGNAL_EXIT',
                priority: 2,
                label: 'Signal invalidation',
                trigger: `Opposite Rohit momentum crossover, RSI crossing back through 50, or a daily close through the Wavy Tunnel Filter against a ${String(
                    plan.bias
                ).toLowerCase()} position`,
                action: 'Close on that day\'s close, regardless of open P&L',
                rationale:
                    'The strike was placed where it is because of the entry signal. When the signal flips, the tent is in the wrong place.',
            },
            {
                id: 'HARD_STOP',
                priority: 3,
                label: 'Hard stop',
                trigger: `Spread value falls to ${stopValue.toFixed(2)} (${(
                    c.stopLossPct * 100
                ).toFixed(0)}% of the ${plan.netDebit.toFixed(2)} debit)`,
                action: 'Close both legs',
                level: stopValue,
                moneyPerLot: (plan.netDebit - stopValue) * lot,
                rationale: `Max loss is the full ${(plan.netDebit * lot).toFixed(
                    0
                )} debit, but you cut at half of it. That is what the position size was calculated against.`,
            },
            {
                id: 'TENT_BREACH',
                priority: 4,
                label: 'Profit-zone breach',
                trigger: plan.profitZone
                    ? `Underlying closes outside ${plan.profitZone.low.toFixed(
                          2
                      )} — ${plan.profitZone.high.toFixed(2)}`
                    : 'Underlying moves decisively away from the strike',
                action: 'Close, or roll the whole spread to a strike centred on the new price',
                zone: plan.profitZone,
                rationale:
                    'Outside the breakevens the structure cannot profit at front expiry. Holding on is hoping, not managing.',
            },
            {
                id: 'PROFIT_TARGET',
                priority: 5,
                label: 'Profit target',
                trigger: `Spread value reaches ${targetValue.toFixed(2)} (+${(
                    c.profitTargetPct * 100
                ).toFixed(0)}% on the debit)`,
                action: 'Close both legs, or close half and trail the rest to the time stop',
                level: targetValue,
                moneyPerLot: (targetValue - plan.netDebit) * lot,
                rationale: `Theoretical max is ${plan.maxProfit.toFixed(
                    0
                )} per lot, but that needs the underlying to pin ${plan.strike} on expiry day. Take the realistic number.`,
            },
            {
                id: 'VOL_EXIT',
                priority: 6,
                label: 'Volatility exit',
                trigger: `Front IV falls more than ${(c.ivCollapsePoints * 100).toFixed(
                    0
                )} points below back IV (entry edge was ${(plan.ivEdge * 100).toFixed(1)} points)`,
                action: 'Close — the theta edge has been repriced away',
                rationale:
                    'A calendar is long vega. Once the term structure flattens against you, you are holding a volatility bet rather than a decay trade.',
            },
        ],

        levels: {
            netDebit: plan.netDebit,
            targetValue,
            stopValue,
            timeStopDate,
            profitZone: plan.profitZone,
            maxLossPerLot: plan.netDebit * lot,
            targetProfitPerLot: (targetValue - plan.netDebit) * lot,
        },

        rollPlan: {
            when: 'Time stop reached with momentum unchanged and the underlying still inside the tent',
            how: `Buy back the ${plan.strike} ${plan.type} ${plan.front.expiry} and sell the same strike in the expiry after ${plan.back.expiry}`,
            caution:
                'Only roll a winner or a flat position. Rolling a loser is averaging down with extra steps.',
        },
    };
};

/**
 * Marks a live position to market and reports which exit rules have fired.
 *
 * `current` carries whatever you actually know today:
 *   { date, spot, frontPrice, backPrice, ivFront, ivBack, bars }
 *
 * `spreadValue` is computed from live leg prices when supplied, and modelled
 * from Black-Scholes otherwise, so the check still works on a stale chain.
 */
export const evaluateExit = (plan, exitPlan, current = {}, signalConfig = {}) => {
    if (!plan?.viable || !exitPlan) return null;

    const c = exitPlan.config;
    const asOf = current.date || plan.asOfDate;
    const spot = current.spot ?? plan.spot;

    // --- current value of the spread ----------------------------------------
    let spreadValue;
    let valuationBasis;

    if (current.frontPrice > 0 && current.backPrice > 0) {
        spreadValue = current.backPrice - current.frontPrice;
        valuationBasis = 'live leg prices';
    } else {
        const tFront = yearsToExpiry(asOf, plan.front.date);
        const tBack = yearsToExpiry(asOf, plan.back.date);
        const ivF = current.ivFront ?? plan.ivFront;
        const ivB = current.ivBack ?? plan.ivBack;
        const front = bsPrice(spot, plan.strike, tFront, 0.065, ivF, plan.type);
        const back = bsPrice(spot, plan.strike, tBack, 0.065, ivB, plan.type);
        spreadValue = back - front;
        valuationBasis = 'Black-Scholes model value';
    }

    const pnlPerShare = spreadValue - plan.netDebit;
    const pnlPct = plan.netDebit > 0 ? pnlPerShare / plan.netDebit : 0;
    const triggered = [];

    // --- 1. Time stop --------------------------------------------------------
    const daysToFront = daysBetween(asOf, plan.front.date);
    if (daysToFront !== null && daysToFront <= c.timeStopDays) {
        triggered.push({
            id: 'TIME_STOP',
            priority: 1,
            severity: 'EXIT',
            message: `Front leg expires in ${daysToFront} day(s) — at or inside the ${c.timeStopDays}-day time stop. Close or roll now.`,
        });
    }

    // --- 2. Signal invalidation ---------------------------------------------
    if (current.bars && current.bars.length > 0 && plan.bias) {
        const closes = current.bars.map((b) => b.close);
        const wanted = plan.bias;

        if (current.momentumSeries) {
            const m = readMomentumState(current.momentumSeries, null, { freshness: 1 });
            if (m.ready && m.direction && m.direction !== wanted && m.triggered) {
                triggered.push({
                    id: 'SIGNAL_EXIT',
                    priority: 2,
                    severity: 'EXIT',
                    message: `Rohit momentum has crossed back the other way (now ${m.direction}). The entry thesis is gone.`,
                });
            }
        }

        const r = readRsiState(closes, null, wanted, signalConfig.rsiConfig);
        if (r.ready) {
            const flipped =
                (wanted === 'BULLISH' && r.value < 50) || (wanted === 'BEARISH' && r.value > 50);
            if (flipped) {
                triggered.push({
                    id: 'SIGNAL_EXIT',
                    priority: 2,
                    severity: 'EXIT',
                    message: `RSI has crossed back through 50 (now ${r.value.toFixed(
                        1
                    )}) against the position.`,
                });
            }
        }

        if (current.tunnelSeries) {
            const t = readTunnelState(current.tunnelSeries, current.bars, null, wanted);
            if (t.ready && t.structure !== 'MIXED' && t.structure !== wanted) {
                triggered.push({
                    id: 'SIGNAL_EXIT',
                    priority: 2,
                    severity: 'EXIT',
                    message: `Price has closed through the Wavy Tunnel Filter against the position (structure now ${t.structure}).`,
                });
            }
        }
    }

    // --- 3. Hard stop --------------------------------------------------------
    if (spreadValue <= exitPlan.levels.stopValue) {
        triggered.push({
            id: 'HARD_STOP',
            priority: 3,
            severity: 'EXIT',
            message: `Spread at ${spreadValue.toFixed(2)} has hit the ${exitPlan.levels.stopValue.toFixed(
                2
            )} stop (${(pnlPct * 100).toFixed(0)}% on the debit).`,
        });
    }

    // --- 4. Tent breach ------------------------------------------------------
    if (plan.profitZone) {
        const { low, high } = plan.profitZone;
        if (spot < low || spot > high) {
            triggered.push({
                id: 'TENT_BREACH',
                priority: 4,
                severity: 'EXIT',
                message: `Underlying ${spot.toFixed(2)} is outside the ${low.toFixed(2)}—${high.toFixed(
                    2
                )} profit zone. Close or re-centre the spread.`,
            });
        } else {
            const width = high - low;
            const edge = Math.min(spot - low, high - spot);
            if (width > 0 && edge / width < c.tentWarnPct) {
                triggered.push({
                    id: 'TENT_BREACH',
                    priority: 4,
                    severity: 'WARN',
                    message: `Underlying ${spot.toFixed(2)} is drifting toward the edge of the ${low.toFixed(
                        2
                    )}—${high.toFixed(2)} profit zone.`,
                });
            }
        }
    }

    // --- 5. Profit target ----------------------------------------------------
    if (spreadValue >= exitPlan.levels.targetValue) {
        triggered.push({
            id: 'PROFIT_TARGET',
            priority: 5,
            severity: 'EXIT',
            message: `Spread at ${spreadValue.toFixed(2)} has reached the ${exitPlan.levels.targetValue.toFixed(
                2
            )} target (+${(pnlPct * 100).toFixed(0)}%). Bank it or take half off.`,
        });
    }

    // --- 6. Vol exit ---------------------------------------------------------
    if (current.ivFront != null && current.ivBack != null) {
        const edge = current.ivFront - current.ivBack;
        if (edge < plan.ivEdge - c.ivCollapsePoints) {
            triggered.push({
                id: 'VOL_EXIT',
                priority: 6,
                severity: 'WARN',
                message: `Term structure has moved against you: IV edge is now ${(edge * 100).toFixed(
                    1
                )} points versus ${(plan.ivEdge * 100).toFixed(1)} at entry.`,
            });
        }
    }

    triggered.sort((a, b) => a.priority - b.priority);
    const exits = triggered.filter((t) => t.severity === 'EXIT');

    return {
        asOf,
        spot,
        spreadValue,
        valuationBasis,
        pnlPerShare,
        pnlPerLot: pnlPerShare * (plan.lotSize || 1),
        pnlPct,
        daysToFront,
        triggered,
        action: exits.length > 0 ? 'EXIT' : triggered.length > 0 ? 'WATCH' : 'HOLD',
        primary: exits[0] || triggered[0] || null,
        summary:
            exits.length > 0
                ? exits[0].message
                : triggered.length > 0
                ? triggered[0].message
                : `Hold. Spread at ${spreadValue.toFixed(2)} versus ${plan.netDebit.toFixed(
                      2
                  )} debit, ${daysToFront} day(s) to the front expiry.`,
    };
};
