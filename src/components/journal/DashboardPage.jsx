import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { aggregate, dailyPnL, disciplineScore, formatINR, periodDelta } from '../../lib/journal/metrics';
import { PALETTE, pnlColor } from '../../lib/journal/palette';
import { Card, StatCard, DirectionBadge } from './ui';

function rolling(trades, valueFn, window = 20) {
  const values = [];
  const buffer = [];
  for (const t of trades) {
    const v = valueFn(t);
    if (v == null) continue;
    buffer.push(v);
    if (buffer.length > window) buffer.shift();
    values.push(buffer.reduce((a, b) => a + b, 0) / buffer.length);
  }
  return values;
}

export default function DashboardPage({ trades, onSelectTrade, onDayClick }) {
  const sorted = useMemo(() => [...trades].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate)), [trades]);
  const agg = useMemo(() => aggregate(sorted), [sorted]);
  const discipline = useMemo(() => disciplineScore(sorted), [sorted]);
  const delta = useMemo(() => {
    const { current, previous } = periodDelta(sorted, 30);
    const cur = aggregate(current).netPnL;
    const prev = aggregate(previous).netPnL;
    return { value: cur - prev, label: `${formatINR(cur - prev)} vs prev 30d` };
  }, [sorted]);

  const curveData = useMemo(() => {
    let peak = 0;
    return agg.equityCurve.map((p, i) => {
      peak = Math.max(peak, p.equity);
      return { i, date: p.date.slice(0, 10), equity: Math.round(p.equity), peak: Math.round(peak), dd: [Math.round(p.equity), Math.round(peak)] };
    });
  }, [agg.equityCurve]);

  const equitySpark = useMemo(() => curveData.map((p) => p.equity), [curveData]);
  const winRateSpark = useMemo(() => rolling(sorted, (t) => (t.isWin ? 1 : 0)), [sorted]);
  const captureSpark = useMemo(() => rolling(sorted, (t) => t.captureRate), [sorted]);
  const rSpark = useMemo(() => rolling(sorted, (t) => t.rMultiple), [sorted]);

  if (!sorted.length) {
    return <Card><p className="py-10 text-center text-sm text-muted-foreground">No trades match the current filters. Add a trade or widen the date range.</p></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Net P&L" value={agg.netPnL} format={(v) => formatINR(v)} tone={agg.netPnL >= 0 ? 'good' : 'bad'} spark={equitySpark} sparkColor={agg.netPnL >= 0 ? PALETTE.win : PALETTE.loss} delta={delta.value} deltaLabel={delta.label} />
        <StatCard label="Win rate" value={agg.winRate * 100} format={(v) => `${v.toFixed(1)}%`} spark={winRateSpark} />
        <StatCard label="Profit factor" value={Number.isFinite(agg.profitFactor) ? agg.profitFactor : 0} format={(v) => v.toFixed(2)} tone={agg.profitFactor >= 1.3 ? 'good' : agg.profitFactor < 1 ? 'bad' : 'neutral'} />
        <StatCard label="Expectancy" value={agg.expectancyR != null ? agg.expectancyR : 0} format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`} tone={agg.expectancyR > 0 ? 'good' : 'bad'} spark={rSpark} sparkColor={PALETTE.series2} />
        <StatCard label="Avg capture" value={agg.avgCapture != null ? agg.avgCapture * 100 : null} format={(v) => `${v.toFixed(0)}%`} tone={agg.avgCapture >= 0.5 ? 'good' : 'bad'} spark={captureSpark} sparkColor={PALETTE.series3} />
        <StatCard label="Max drawdown" value={agg.maxDrawdown} format={(v) => formatINR(-v)} tone="bad" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Equity curve */}
        <Card className="xl:col-span-2" title="Equity curve" subtitle="Cumulative net P&L by exit; red band shows drawdown from peak">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curveData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: PALETTE.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: PALETTE.neutral }} minTickGap={48} />
                <YAxis tick={{ fill: PALETTE.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v)} width={64} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="text-muted-foreground">{d.date}</p>
                        <p className="font-semibold tabular-nums">{formatINR(d.equity, { compact: false })}</p>
                        {d.peak > d.equity && <p className="text-[#e66767] tabular-nums">Drawdown {formatINR(d.equity - d.peak)}</p>}
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke={PALETTE.neutral} />
                <Area dataKey="dd" stroke="none" fill={PALETTE.lossSoft} activeDot={false} isAnimationActive={false} />
                <Area dataKey="equity" stroke={PALETTE.series1} strokeWidth={2} fill={PALETTE.series1} fillOpacity={0.12} isAnimationActive={false} activeDot={{ r: 3 }} />
                <Line dataKey="peak" stroke={PALETTE.axis} strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Discipline score */}
        <Card title="Discipline score" subtitle="Process quality — stops, journaling, exits, hit rate">
          <DisciplineGauge discipline={discipline} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Daily P&L calendar" subtitle="Click a day to drill into its trades">
          <CalendarHeatmap trades={sorted} onDayClick={onDayClick} />
        </Card>

        <Card title="Recent trades">
          <ul className="divide-y divide-border -mx-2">
            {[...sorted].slice(-8).reverse().map((t) => (
              <li key={t.id}>
                <button onClick={() => onSelectTrade(t.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.symbol}</p>
                    <p className="text-[11px] text-muted-foreground">{t.exitDate.slice(0, 10)} · <DirectionBadge direction={t.direction} /></p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${t.netPnL >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]'}`}>
                    {formatINR(t.netPnL)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function DisciplineGauge({ discipline }) {
  const { total, parts } = discipline;
  const r = 56;
  const circumference = Math.PI * r; // half circle
  const filled = (total / 100) * circumference;
  const color = total >= 70 ? PALETTE.win : total >= 45 ? PALETTE.series3 : PALETTE.loss;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="160" height="96" viewBox="0 0 160 96" role="img" aria-label={`Discipline score ${total} of 100`}>
        <path d={`M 20 88 A ${r} ${r} 0 0 1 140 88`} fill="none" stroke={PALETTE.neutral} strokeWidth="12" strokeLinecap="round" />
        <path d={`M 20 88 A ${r} ${r} 0 0 1 140 88`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} style={{ transition: 'stroke-dasharray 600ms ease' }} />
        <text x="80" y="78" textAnchor="middle" fill={PALETTE.ink} fontSize="30" fontWeight="600">{total}</text>
        <text x="80" y="93" textAnchor="middle" fill={PALETTE.inkMuted} fontSize="10">/ 100</text>
      </svg>
      <ul className="w-full space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">{p.label}</span>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-[#3987e5]" style={{ width: `${Math.round(p.value * 100)}%`, transition: 'width 600ms ease' }} />
            </div>
            <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round(p.value * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEEKDAY_ROWS = [1, 2, 3, 4, 5]; // Mon-Fri
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function CalendarHeatmap({ trades, onDayClick }) {
  const { weeks, maxAbs, monthLabels } = useMemo(() => {
    const byDay = dailyPnL(trades);
    if (byDay.size === 0) return { weeks: [], maxAbs: 0, monthLabels: [] };
    const days = [...byDay.keys()].sort();
    const first = new Date(`${days[0]}T00:00:00Z`);
    const last = new Date(`${days[days.length - 1]}T00:00:00Z`);
    // Align to Monday of the first week.
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const weekCols = [];
    const labels = [];
    let cursor = new Date(start);
    let lastMonth = null;
    while (cursor <= last) {
      const col = [];
      for (const dow of WEEKDAY_ROWS) {
        const cell = new Date(cursor);
        cell.setUTCDate(cell.getUTCDate() + dow - 1);
        const key = cell.toISOString().slice(0, 10);
        col.push({ key, pnl: byDay.has(key) ? byDay.get(key) : null });
      }
      const month = cursor.toISOString().slice(0, 7);
      labels.push(month !== lastMonth ? cursor.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }) : '');
      lastMonth = month;
      weekCols.push(col);
      cursor = new Date(cursor.getTime() + 7 * 86400000);
    }
    const maxAbsVal = Math.max(...[...byDay.values()].map(Math.abs), 1);
    return { weeks: weekCols, maxAbs: maxAbsVal, monthLabels: labels };
  }, [trades]);

  if (!weeks.length) return <p className="text-sm text-muted-foreground">No closed trades in range.</p>;

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-[3px] pl-9 text-[10px] text-muted-foreground">
          {monthLabels.map((m, i) => <span key={i} className="w-[15px] shrink-0">{m}</span>)}
        </div>
        {WEEKDAY_ROWS.map((dow, rowIdx) => (
          <div key={dow} className="flex items-center gap-[3px]">
            <span className="w-8 shrink-0 text-[10px] text-muted-foreground">{WEEKDAY_LABELS[rowIdx]}</span>
            {weeks.map((col, wi) => {
              const cell = col[rowIdx];
              const color = cell.pnl == null ? 'transparent' : pnlColor(cell.pnl, maxAbs);
              return (
                <button
                  key={wi}
                  disabled={cell.pnl == null}
                  onClick={() => onDayClick(cell.key)}
                  title={cell.pnl == null ? cell.key : `${cell.key}: ${formatINR(cell.pnl, { compact: false })}`}
                  aria-label={cell.pnl == null ? undefined : `${cell.key}, ${formatINR(cell.pnl)}`}
                  className="size-[15px] shrink-0 rounded-[3px] border border-border/60 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1.5 pl-9 text-[10px] text-muted-foreground">
          <span>Loss</span>
          {['#9c2626', '#d03b3b', '#e66767', '#30302e', '#4fbf4f', '#0ca30c', '#006300'].map((c) => (
            <span key={c} className="size-[11px] rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          <span>Win</span>
        </div>
      </div>
    </div>
  );
}
