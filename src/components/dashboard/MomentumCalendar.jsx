import { useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronRight,
    Info,
    Settings2,
    ShieldAlert,
    Target,
    X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { runMomentumScan } from '../../lib/analysis/momentum-pipeline';
import { MOMENTUM_MODES } from '../../lib/analysis/rohit-momentum';
import CalendarPayoffChart from '../charts/CalendarPayoffChart';

const MODE_LABELS = {
    roc: 'Smoothed Rate of Change',
    stochrsi: 'Stochastic RSI (%K / %D)',
    macd: 'MACD (baseline)',
};

const num = (v, digits = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits);

const money = (v) =>
    v === null || v === undefined || Number.isNaN(v)
        ? '—'
        : `₹${Math.round(v).toLocaleString('en-IN')}`;

const Field = ({ label, children, hint }) => (
    <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {children}
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
    </label>
);

const inputClass =
    'bg-background border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

const Stat = ({ label, value, tone }) => (
    <div className="bg-card border rounded-lg p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-lg font-semibold mt-0.5', tone)}>{value}</div>
    </div>
);

const MomentumCalendar = ({ futuresData = [], optionsData = [] }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const [showRejected, setShowRejected] = useState(false);

    const [cfg, setCfg] = useState({
        mode: 'roc',
        momentumPeriod: 14,
        smoothingPeriod: 3,
        signalPeriod: 9,
        rsiPeriod: 14,
        freshnessBars: 2,
        strikeOffset: 1,
        minFrontDte: 5,
        profitTargetPct: 25,
        stopLossPct: 50,
        timeStopDays: 3,
        accountEquity: 1000000,
        riskPct: 1,
    });

    const set = (key) => (e) => {
        const raw = e.target.value;
        setCfg((prev) => ({
            ...prev,
            [key]: key === 'mode' ? raw : Number(raw),
        }));
    };

    const scan = useMemo(() => {
        if (!futuresData.length) return null;
        return runMomentumScan(futuresData, optionsData, {
            entry: {
                freshnessBars: cfg.freshnessBars,
                momentum: {
                    mode: cfg.mode,
                    momentumPeriod: cfg.momentumPeriod,
                    smoothingPeriod: cfg.smoothingPeriod,
                    signalPeriod: cfg.signalPeriod,
                },
                rsiConfig: { period: cfg.rsiPeriod },
            },
            calendar: { strikeOffset: cfg.strikeOffset, minFrontDte: cfg.minFrontDte },
            exit: {
                profitTargetPct: cfg.profitTargetPct / 100,
                stopLossPct: cfg.stopLossPct / 100,
                timeStopDays: cfg.timeStopDays,
            },
            sizing: {
                accountEquity: cfg.accountEquity,
                riskPct: cfg.riskPct,
                stopPct: cfg.stopLossPct / 100,
            },
        });
    }, [futuresData, optionsData, cfg]);

    if (!futuresData.length) {
        return (
            <div className="bg-card border rounded-xl p-8 text-center">
                <CalendarClock className="size-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold text-lg">No data loaded</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl mx-auto">
                    Upload a multi-day futures archive on the Scanner tab. The momentum crossover needs
                    price history, and the calendar spread needs an options file covering{' '}
                    <strong>two expiries</strong> — the current month and the next.
                </p>
            </div>
        );
    }

    const tradable = scan?.tradable || [];
    const triggeredButNoTrade = (scan?.results || []).filter(
        (r) => r.entry.eligible && !r.calendar?.viable
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* --- Header ---------------------------------------------------- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Activity className="size-6 text-primary" />
                        Momentum → Calendar
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Entry on a Rohit Momentum crossover, confirmed by RSI <em>or</em> the Wavy Tunnel,
                        expressed as a calendar spread with a fixed exit ladder.
                    </p>
                </div>
                <button
                    onClick={() => setShowSettings((s) => !s)}
                    className="self-start bg-primary/10 text-primary hover:bg-primary/20 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                    <Settings2 className="size-4" /> Strategy settings
                </button>
            </div>

            {/* --- Settings -------------------------------------------------- */}
            {showSettings && (
                <div className="bg-card border rounded-xl p-5 space-y-5">
                    <div>
                        <h3 className="font-semibold text-sm mb-1">Rohit Momentum</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            The published indicator is proprietary, so this is a configurable dual-line
                            oscillator with the same structure. Tune the mode and periods until the
                            crossover dates match your own chart, then leave them alone.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Field label="Mode">
                                <select className={inputClass} value={cfg.mode} onChange={set('mode')}>
                                    {MOMENTUM_MODES.map((m) => (
                                        <option key={m} value={m}>
                                            {MODE_LABELS[m]}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Momentum period">
                                <input type="number" min="2" className={inputClass} value={cfg.momentumPeriod} onChange={set('momentumPeriod')} />
                            </Field>
                            <Field label="Smoothing">
                                <input type="number" min="1" className={inputClass} value={cfg.smoothingPeriod} onChange={set('smoothingPeriod')} />
                            </Field>
                            <Field label="Signal period">
                                <input type="number" min="1" className={inputClass} value={cfg.signalPeriod} onChange={set('signalPeriod')} />
                            </Field>
                            <Field label="Freshness (bars)" hint="Crosses older than this are stale">
                                <input type="number" min="0" className={inputClass} value={cfg.freshnessBars} onChange={set('freshnessBars')} />
                            </Field>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-sm mb-3">Confirmation &amp; structure</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Field label="RSI period">
                                <input type="number" min="2" className={inputClass} value={cfg.rsiPeriod} onChange={set('rsiPeriod')} />
                            </Field>
                            <Field label="Strike offset" hint="Strikes from spot, toward the bias">
                                <input type="number" min="0" max="5" className={inputClass} value={cfg.strikeOffset} onChange={set('strikeOffset')} />
                            </Field>
                            <Field label="Min front DTE">
                                <input type="number" min="1" className={inputClass} value={cfg.minFrontDte} onChange={set('minFrontDte')} />
                            </Field>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-sm mb-3">Exit &amp; risk</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Field label="Profit target (% of debit)">
                                <input type="number" min="5" className={inputClass} value={cfg.profitTargetPct} onChange={set('profitTargetPct')} />
                            </Field>
                            <Field label="Stop (% of debit)">
                                <input type="number" min="5" max="100" className={inputClass} value={cfg.stopLossPct} onChange={set('stopLossPct')} />
                            </Field>
                            <Field label="Time stop (days before front expiry)">
                                <input type="number" min="0" className={inputClass} value={cfg.timeStopDays} onChange={set('timeStopDays')} />
                            </Field>
                            <Field label="Account equity (₹)">
                                <input type="number" min="0" step="10000" className={inputClass} value={cfg.accountEquity} onChange={set('accountEquity')} />
                            </Field>
                            <Field label="Risk per trade (%)">
                                <input type="number" min="0.1" step="0.1" className={inputClass} value={cfg.riskPct} onChange={set('riskPct')} />
                            </Field>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Summary --------------------------------------------------- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Symbols scanned" value={scan?.results.length ?? 0} />
                <Stat
                    label="Tradable calendars"
                    value={tradable.length}
                    tone={tradable.length > 0 ? 'text-green-500' : undefined}
                />
                <Stat label="Signal, no calendar" value={triggeredButNoTrade.length} />
                <Stat
                    label="As of"
                    value={scan?.asOfDate ? scan.asOfDate.toISOString().slice(0, 10) : '—'}
                />
            </div>

            {!optionsData.length && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <Info className="size-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm">
                        No options file loaded. Entry signals below are still valid, but no calendar spread
                        can be constructed — a calendar needs quoted prices in two expiries.
                    </p>
                </div>
            )}

            {/* --- Tradable list --------------------------------------------- */}
            {tradable.length > 0 ? (
                <div className="bg-card rounded-xl border overflow-hidden">
                    <div className="p-4 border-b bg-muted/30">
                        <h3 className="font-semibold">Setups ({tradable.length})</h3>
                    </div>
                    <div className="divide-y divide-border">
                        {tradable.map((row) => {
                            const plan = row.calendar;
                            const isOpen = expanded === row.symbol;
                            const bull = row.entry.bias === 'BULLISH';

                            return (
                                <div key={row.symbol}>
                                    <button
                                        onClick={() => setExpanded(isOpen ? null : row.symbol)}
                                        className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex flex-wrap items-center gap-x-6 gap-y-2"
                                    >
                                        {isOpen ? (
                                            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                                        )}

                                        <div className="min-w-32">
                                            <div className="font-semibold">{row.symbol}</div>
                                            <div className={cn('text-xs font-medium', bull ? 'text-green-500' : 'text-red-500')}>
                                                {row.entry.bias}
                                            </div>
                                        </div>

                                        <div className="min-w-40">
                                            <div className="text-sm">{plan.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {plan.strike} {plan.type} · {plan.front.expiry} / {plan.back.expiry}
                                            </div>
                                        </div>

                                        <div className="min-w-28">
                                            <div className="text-xs text-muted-foreground">Debit</div>
                                            <div className="text-sm font-mono">{num(plan.netDebit)}</div>
                                        </div>

                                        <div className="min-w-28">
                                            <div className="text-xs text-muted-foreground">Max risk</div>
                                            <div className="text-sm font-mono">{money(plan.maxLoss)}</div>
                                        </div>

                                        <div className="min-w-24">
                                            <div className="text-xs text-muted-foreground">IV edge</div>
                                            <div className={cn('text-sm font-mono', plan.ivEdge > 0 ? 'text-green-500' : 'text-amber-500')}>
                                                {plan.ivEdge > 0 ? '+' : ''}{num(plan.ivEdge * 100, 1)}
                                            </div>
                                        </div>

                                        <div className="ml-auto flex items-center gap-3">
                                            <span className="text-xs text-muted-foreground hidden md:inline">
                                                {row.entry.confirmedBy.join(' + ')}
                                            </span>
                                            <span
                                                className={cn(
                                                    'px-2 py-1 rounded text-xs font-bold border',
                                                    row.entry.score >= 7.5
                                                        ? 'bg-green-500/10 text-green-500 border-green-500/30'
                                                        : row.entry.score >= 6
                                                        ? 'bg-primary/10 text-primary border-primary/30'
                                                        : 'bg-muted text-muted-foreground border-border'
                                                )}
                                            >
                                                {row.entry.score}/10
                                            </span>
                                        </div>
                                    </button>

                                    {isOpen && <SetupDetail row={row} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="bg-card border rounded-xl p-8 text-center">
                    <h3 className="font-semibold">No qualifying setups today</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Every symbol failed at least one gate. That is the normal outcome on most days —
                        a fresh crossover with confirmation is not an everyday event.
                    </p>
                </div>
            )}

            {/* --- Why symbols were rejected --------------------------------- */}
            {triggeredButNoTrade.length > 0 && (
                <div className="bg-card border rounded-xl overflow-hidden">
                    <button
                        onClick={() => setShowRejected((s) => !s)}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                        <span className="font-semibold text-sm">
                            Signal fired but no calendar could be built ({triggeredButNoTrade.length})
                        </span>
                        {showRejected ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    {showRejected && (
                        <div className="divide-y divide-border border-t">
                            {triggeredButNoTrade.map((r) => (
                                <div key={r.symbol} className="p-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                    <span className="font-medium min-w-28">{r.symbol}</span>
                                    <span className={cn('text-xs', r.entry.bias === 'BULLISH' ? 'text-green-500' : 'text-red-500')}>
                                        {r.entry.bias}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                        {r.calendar?.reasons?.[0] || 'No option chain for this symbol'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------

const SetupDetail = ({ row }) => {
    const { entry, calendar: plan, exitPlan, sizing, exitCheck } = row;

    return (
        <div className="bg-muted/20 border-t p-5 space-y-6">
            {/* Entry checklist */}
            <section>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Target className="size-4 text-primary" /> Entry — why this fired
                </h4>
                <div className="grid md:grid-cols-2 gap-2">
                    {entry.checks.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm bg-card border rounded-lg p-3">
                            {c.pass ? (
                                <Check className="size-4 text-green-500 shrink-0 mt-0.5" />
                            ) : (
                                <X className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <div>
                                <div className={cn('font-medium', !c.pass && 'text-muted-foreground')}>{c.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    Grade: <strong className="text-foreground">{entry.grade}</strong> · confirmed by{' '}
                    {entry.confirmedBy.join(' and ')} · RSI {num(entry.rsi.value, 1)}
                    {row.usedFuturesAsSpot && ' · spot approximated from the futures close'}
                </p>
            </section>

            {/* The trade */}
            <section>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <CalendarClock className="size-4 text-primary" /> The trade
                </h4>
                <div className="grid lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <div className="bg-card border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-border">
                                    {plan.legs.map((leg, i) => (
                                        <tr key={i}>
                                            <td className="p-3">
                                                <span
                                                    className={cn(
                                                        'px-2 py-0.5 rounded text-xs font-bold',
                                                        leg.action === 'SELL'
                                                            ? 'bg-red-500/10 text-red-500'
                                                            : 'bg-green-500/10 text-green-500'
                                                    )}
                                                >
                                                    {leg.action}
                                                </span>
                                            </td>
                                            <td className="p-3 font-medium">{leg.instrument}</td>
                                            <td className="p-3 text-right font-mono">{num(leg.price)}</td>
                                            <td className="p-3 text-right text-muted-foreground text-xs">
                                                {leg.qty || '?'} qty
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-card border rounded-lg p-3">
                                <div className="text-xs text-muted-foreground">Net debit / max loss</div>
                                <div className="font-mono">{num(plan.netDebit)} · {money(plan.maxLoss)}</div>
                            </div>
                            <div className="bg-card border rounded-lg p-3">
                                <div className="text-xs text-muted-foreground">Theoretical max profit</div>
                                <div className="font-mono text-green-500">{money(plan.maxProfit)}</div>
                            </div>
                            <div className="bg-card border rounded-lg p-3">
                                <div className="text-xs text-muted-foreground">IV front / back</div>
                                <div className="font-mono">
                                    {num(plan.ivFront * 100, 1)}% / {num(plan.ivBack * 100, 1)}%
                                </div>
                            </div>
                            <div className="bg-card border rounded-lg p-3">
                                <div className="text-xs text-muted-foreground">Net theta / vega</div>
                                <div className="font-mono">
                                    <span className="text-green-500">+{num(plan.netGreeks.theta, 3)}</span> /{' '}
                                    {num(plan.netGreeks.vega, 3)}
                                </div>
                            </div>
                        </div>

                        {sizing && (
                            <div className="bg-card border rounded-lg p-3 text-sm">
                                <div className="text-xs text-muted-foreground mb-1">Position size</div>
                                <div>{sizing.note}</div>
                            </div>
                        )}
                    </div>

                    <div className="bg-card border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-2">
                            P&amp;L at {plan.front.expiry} expiry, per lot. Peak at the strike; red lines are
                            the breakevens.
                        </div>
                        <CalendarPayoffChart plan={plan} />
                    </div>
                </div>

                {plan.warnings.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {plan.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                                <span>{w}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Exit ladder */}
            <section>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <ShieldAlert className="size-4 text-primary" /> Exit ladder — decided now, not later
                </h4>
                <div className="bg-card border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs">
                            <tr>
                                <th className="p-3 text-left w-8">#</th>
                                <th className="p-3 text-left">Rule</th>
                                <th className="p-3 text-left">Trigger</th>
                                <th className="p-3 text-left">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {exitPlan.rules.map((rule) => (
                                <tr key={rule.id} className="align-top">
                                    <td className="p-3 text-muted-foreground">{rule.priority}</td>
                                    <td className="p-3 font-medium whitespace-nowrap">{rule.label}</td>
                                    <td className="p-3">
                                        {rule.trigger}
                                        <div className="text-xs text-muted-foreground mt-1">{rule.rationale}</div>
                                    </td>
                                    <td className="p-3 text-muted-foreground">{rule.action}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm">
                    <div className="bg-card border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">Roll instead of close</div>
                        <div>{exitPlan.rollPlan.how}</div>
                        <div className="text-xs text-muted-foreground mt-1">{exitPlan.rollPlan.caution}</div>
                    </div>
                    {exitCheck && (
                        <div
                            className={cn(
                                'border rounded-lg p-3',
                                exitCheck.action === 'EXIT'
                                    ? 'bg-destructive/10 border-destructive/30'
                                    : exitCheck.action === 'WATCH'
                                    ? 'bg-amber-500/10 border-amber-500/30'
                                    : 'bg-card'
                            )}
                        >
                            <div className="text-xs text-muted-foreground mb-1">
                                Day-zero check ({exitCheck.action})
                            </div>
                            <div>{exitCheck.summary}</div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default MomentumCalendar;
