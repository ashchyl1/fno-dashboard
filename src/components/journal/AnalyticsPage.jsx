import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Line, Bar, BarChart,
  XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { cn } from '../../lib/utils';
import {
  aggregate, breakdownBy, equityCurve, simulateWhatIf, formatINR,
  WEEKDAYS, holdBucket, HOLD_BUCKET_ORDER, sum,
} from '../../lib/journal/metrics';
import { PALETTE } from '../../lib/journal/palette';
import { Card } from './ui';

const AXIS = { tick: { fill: PALETTE.axis, fontSize: 11 }, tickLine: false };

function ChartTip({ active, payload, render }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-xl">
      {render(payload)}
    </div>
  );
}

export default function AnalyticsPage({ trades, onSelectTrade }) {
  const withR = useMemo(() => trades.filter((t) => t.rMultiple != null), [trades]);
  const withExcursion = useMemo(() => trades.filter((t) => t.mfeR != null && t.rMultiple != null), [trades]);

  if (trades.length < 5) {
    return <Card><p className="py-10 text-center text-sm text-muted-foreground">Not enough trades in range for meaningful analytics (need at least 5).</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MfeScatter trades={withExcursion} onSelectTrade={onSelectTrade} />
        <MaeHistogram trades={withExcursion} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RHistogram trades={withR} />
        <CaptureTrend trades={trades} />
      </div>
      <WhatIfSimulator trades={trades} />
      <Breakdowns trades={trades} />
    </div>
  );
}

// ---- MFE vs realized R: profit left on the table -------------------------

const SCATTER_MAX = 5;

function MfeScatter({ trades, onSelectTrade }) {
  // Clamp outliers into the fixed axis window so one runner doesn't stretch
  // the whole plot; the tooltip still shows the true values.
  const data = useMemo(() => trades.map((t) => ({
    id: t.id, symbol: t.symbol,
    x: Math.min(t.mfeR, SCATTER_MAX), y: Math.max(-2, Math.min(t.rMultiple, SCATTER_MAX)),
    trueX: t.mfeR, trueY: t.rMultiple,
    win: t.isWin, capture: t.captureRate,
  })), [trades]);
  const maxAxis = SCATTER_MAX + 0.3;

  return (
    <Card title="Exit quality — peak profit vs. what you kept" subtitle="Each dot is a trade. Distance below the diagonal = profit given back before exit. Click a dot to open the trade.">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={PALETTE.grid} />
            <XAxis type="number" dataKey="x" name="MFE" domain={[0, maxAxis]} ticks={[0, 1, 2, 3, 4, 5]} tickFormatter={(v) => `${v}R`} {...AXIS} axisLine={{ stroke: PALETTE.neutral }}
              label={{ value: 'Peak open profit (MFE, R)', position: 'insideBottom', offset: -2, fill: PALETTE.axis, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Realized" domain={[-2, maxAxis]} ticks={[-2, -1, 0, 1, 2, 3, 4, 5]} tickFormatter={(v) => `${v}R`} width={42} {...AXIS} axisLine={false}
              label={{ value: 'Realized R', angle: -90, position: 'insideLeft', fill: PALETTE.axis, fontSize: 11 }} />
            <ZAxis range={[36, 36]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: maxAxis, y: maxAxis }]} stroke={PALETTE.axis} strokeDasharray="4 4"
              label={{ value: 'perfect exit', fill: PALETTE.axis, fontSize: 10, position: 'insideTopLeft' }} />
            <ReferenceLine y={0} stroke={PALETTE.neutral} />
            <Tooltip cursor={{ strokeDasharray: '3 3', stroke: PALETTE.axis }} content={(p) => (
              <ChartTip {...p} render={(payload) => {
                const d = payload[0].payload;
                return (
                  <>
                    <p className="font-medium text-foreground">{d.symbol}</p>
                    <p className="text-muted-foreground">Peaked at {d.trueX.toFixed(2)}R, exited {d.trueY >= 0 ? '+' : ''}{d.trueY.toFixed(2)}R</p>
                    {d.capture != null && <p className="text-[#eda100]">Captured {Math.round(d.capture * 100)}%</p>}
                  </>
                );
              }} />
            )} />
            <Scatter data={data} onClick={(d) => d?.id && onSelectTrade(d.id)} cursor="pointer" isAnimationActive={false} shape="circle">
              {data.map((d) => (
                <Cell key={d.id} fill={d.win ? PALETTE.win : PALETTE.loss} fillOpacity={0.75} stroke="#0b0f14" strokeWidth={1} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: PALETTE.win }} /> Winner</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: PALETTE.loss }} /> Loser</span>
      </div>
    </Card>
  );
}

// ---- MAE histogram: entry quality -----------------------------------------

function histogram(values, binSize, min, max) {
  const bins = [];
  for (let b = min; b < max; b += binSize) {
    bins.push({ from: b, to: b + binSize, label: `${b.toFixed(1)}–${(b + binSize).toFixed(1)}`, count: 0, winners: 0 });
  }
  for (const v of values) {
    const idx = Math.min(Math.floor((v.value - min) / binSize), bins.length - 1);
    if (idx >= 0) {
      bins[idx].count += 1;
      if (v.win) bins[idx].winners += 1;
    }
  }
  return bins;
}

function MaeHistogram({ trades }) {
  const bins = useMemo(() => {
    const values = trades.map((t) => ({ value: Math.min(t.maeR, 1.99), win: t.isWin }));
    return histogram(values, 0.25, 0, 2);
  }, [trades]);

  return (
    <Card title="Entry quality — heat taken before the outcome" subtitle="MAE distribution in R. Winners clustered at high MAE mean entries are early; losers near 1.0R died at the stop.">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS} axisLine={{ stroke: PALETTE.neutral }}
              label={{ value: 'Max adverse excursion (R)', position: 'insideBottom', offset: -2, fill: PALETTE.axis, fontSize: 11 }} />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={(p) => (
              <ChartTip {...p} render={(payload) => {
                const d = payload[0].payload;
                return (
                  <>
                    <p className="font-medium text-foreground">MAE {d.label}R</p>
                    <p className="text-muted-foreground">{d.count} trades · {d.winners} recovered to win</p>
                  </>
                );
              }} />
            )} />
            <Bar dataKey="count" fill={PALETTE.loss} fillOpacity={0.55} radius={[4, 4, 0, 0]} isAnimationActive={false} name="All trades" />
            <Bar dataKey="winners" fill={PALETTE.win} radius={[4, 4, 0, 0]} isAnimationActive={false} name="Ended as winners" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: PALETTE.loss, opacity: 0.55 }} /> All trades</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: PALETTE.win }} /> Ended as winners</span>
      </div>
    </Card>
  );
}

// ---- R-multiple distribution ----------------------------------------------

function RHistogram({ trades }) {
  const bins = useMemo(() => {
    const values = trades.map((t) => ({ value: Math.max(-2, Math.min(t.rMultiple, 3.99)), win: t.isWin }));
    return histogram(values, 0.5, -2, 4);
  }, [trades]);

  return (
    <Card title="R-multiple distribution" subtitle="Every trade normalized by its initial risk — the shape of your edge">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS} axisLine={{ stroke: PALETTE.neutral }} />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={(p) => (
              <ChartTip {...p} render={(payload) => {
                const d = payload[0].payload;
                return <p className="text-foreground">{d.count} trades between {d.label}R</p>;
              }} />
            )} />
            <ReferenceLine x="0.0–0.5" stroke={PALETTE.neutral} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {bins.map((b) => <Cell key={b.label} fill={b.from >= 0 ? PALETTE.win : PALETTE.loss} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---- Capture rate trend ----------------------------------------------------

function CaptureTrend({ trades }) {
  const data = useMemo(() => {
    const eligible = trades
      .filter((t) => t.captureRate != null && t.mfe > 0)
      .sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
    const buffer = [];
    return eligible.map((t) => {
      buffer.push(t.captureRate);
      if (buffer.length > 25) buffer.shift();
      return {
        date: t.exitDate.slice(0, 10),
        rate: Math.round((buffer.reduce((a, b) => a + b, 0) / buffer.length) * 100),
      };
    });
  }, [trades]);

  return (
    <Card title="Capture rate trend" subtitle="Rolling 25-trade average of profit captured vs. peak (50–60% band = disciplined exits)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="date" {...AXIS} axisLine={{ stroke: PALETTE.neutral }} minTickGap={48} />
            <YAxis domain={[0, 100]} {...AXIS} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
            <Tooltip content={(p) => (
              <ChartTip {...p} render={(payload) => {
                const d = payload[0].payload;
                return <p className="text-foreground">{d.date}: <span className="font-semibold">{d.rate}%</span> captured</p>;
              }} />
            )} />
            <ReferenceLine y={50} stroke={PALETTE.series3} strokeDasharray="4 4" label={{ value: '50%', fill: PALETTE.series3, fontSize: 10, position: 'right' }} />
            <Line dataKey="rate" stroke={PALETTE.series3} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---- What-if simulator ------------------------------------------------------

function WhatIfSimulator({ trades }) {
  const [stopScale, setStopScale] = useState(1);
  const [targetR, setTargetR] = useState(0); // 0 = off

  const { data, actualAgg, simAgg } = useMemo(() => {
    const eligible = trades.filter((t) => Array.isArray(t.path) && t.path.length > 1 && t.stopLoss != null);
    const simulated = simulateWhatIf(eligible, { stopScale, targetR: targetR || null });
    const actualCurve = equityCurve(eligible);
    const simCurve = equityCurve(simulated);
    const merged = actualCurve.map((p, i) => ({
      date: p.date.slice(0, 10),
      actual: Math.round(p.equity),
      simulated: Math.round(simCurve[i]?.equity ?? 0),
    }));
    return { data: merged, actualAgg: aggregate(eligible), simAgg: aggregate(simulated) };
  }, [trades, stopScale, targetR]);

  const diff = simAgg.netPnL - actualAgg.netPnL;

  return (
    <Card
      title="What-if simulator"
      subtitle="Replays every stored price path with a modified stop distance and an optional fixed take-profit"
      actions={(
        <span className={cn('rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums', diff >= 0 ? 'bg-[#0ca30c]/15 text-[#4fbf4f]' : 'bg-[#d03b3b]/15 text-[#e66767]')}>
          {diff >= 0 ? '+' : ''}{formatINR(diff)} vs actual
        </span>
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="w-28">Stop distance <span className="font-semibold text-foreground tabular-nums">{stopScale.toFixed(2)}×</span></span>
          <input type="range" min="0.5" max="2" step="0.05" value={stopScale} onChange={(e) => setStopScale(Number(e.target.value))} className="w-44 accent-[#9085e9]" />
        </label>
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="w-28">Take profit <span className="font-semibold text-foreground tabular-nums">{targetR ? `${targetR.toFixed(1)}R` : 'off'}</span></span>
          <input type="range" min="0" max="4" step="0.5" value={targetR} onChange={(e) => setTargetR(Number(e.target.value))} className="w-44 accent-[#9085e9]" />
        </label>
        <div className="flex gap-4 text-[11px] text-muted-foreground ml-auto">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: PALETTE.series1 }} /> Actual</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: PALETTE.series4 }} /> Simulated</span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 6 }}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="date" {...AXIS} axisLine={{ stroke: PALETTE.neutral }} minTickGap={48} />
            <YAxis {...AXIS} axisLine={false} tickFormatter={(v) => formatINR(v)} width={64} />
            <Tooltip content={(p) => (
              <ChartTip {...p} render={(payload) => {
                const d = payload[0].payload;
                return (
                  <>
                    <p className="text-muted-foreground">{d.date}</p>
                    <p className="text-foreground tabular-nums">Actual {formatINR(d.actual)}</p>
                    <p className="tabular-nums" style={{ color: PALETTE.series4 }}>Simulated {formatINR(d.simulated)}</p>
                  </>
                );
              }} />
            )} />
            <ReferenceLine y={0} stroke={PALETTE.neutral} />
            <Line dataKey="actual" stroke={PALETTE.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="simulated" stroke={PALETTE.series4} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Simulated: win rate {Math.round(simAgg.winRate * 100)}% (actual {Math.round(actualAgg.winRate * 100)}%),
        max drawdown {formatINR(-simAgg.maxDrawdown)} (actual {formatINR(-actualAgg.maxDrawdown)}).
        Only trades with a stored price path and stop are replayed.
      </p>
    </Card>
  );
}

// ---- Breakdowns --------------------------------------------------------------

function BreakdownList({ title, rows }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.netPnL)), 1);
  return (
    <Card title={title}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground">{r.key}</span>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 rounded-full"
                style={{
                  width: `${Math.round((Math.abs(r.netPnL) / maxAbs) * 100)}%`,
                  background: r.netPnL >= 0 ? PALETTE.win : PALETTE.loss,
                  opacity: 0.85,
                }}
              />
            </div>
            <span className="w-32 text-right tabular-nums">
              <span className={r.netPnL >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]'}>{formatINR(r.netPnL)}</span>
              <span className="text-muted-foreground"> · {Math.round(r.winRate * 100)}% · {r.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Breakdowns({ trades }) {
  const bySetup = useMemo(() => breakdownBy(trades.filter((t) => t.setup), (t) => t.setup).sort((a, b) => b.netPnL - a.netPnL), [trades]);
  const byDay = useMemo(() => {
    const rows = breakdownBy(trades, (t) => WEEKDAYS[new Date(t.entryDate).getDay()]);
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => rows.find((r) => r.key === d)).filter(Boolean);
  }, [trades]);
  const byHold = useMemo(() => {
    const rows = breakdownBy(trades, (t) => holdBucket(t.holdMins));
    return HOLD_BUCKET_ORDER.map((b) => rows.find((r) => r.key === b)).filter(Boolean);
  }, [trades]);
  const byHour = useMemo(() => {
    const rows = breakdownBy(trades, (t) => new Date(t.entryDate).getUTCHours() + 5.5 >= 24
      ? null
      : Math.floor((new Date(t.entryDate).getUTCMinutes() / 60 + new Date(t.entryDate).getUTCHours() + 5.5)));
    return rows.sort((a, b) => a.key - b.key).map((r) => ({ ...r, key: `${r.key}:00` }));
  }, [trades]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {bySetup.length > 0 && <BreakdownList title="P&L by setup — where your edge lives" rows={bySetup} />}
      <BreakdownList title="P&L by day of week" rows={byDay} />
      <BreakdownList title="P&L by holding time" rows={byHold} />
      <BreakdownList title="P&L by entry hour (IST)" rows={byHour} />
    </div>
  );
}
