import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { X, Play, Pause, SkipBack, StepForward, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { buildTradeCandles } from '../../lib/journal/candles';
import { formatINR, formatHold } from '../../lib/journal/metrics';
import { PALETTE } from '../../lib/journal/palette';
import { DirectionBadge, Field, inputClass } from './ui';

const SETUPS = ['ORB Breakout', 'VWAP Reversion', 'OI Buildup', 'Support Bounce', 'Trend Pullback', 'Max Pain Drift', 'Other'];
const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Impatient', 'Revenge'];
const MISTAKES = ['', 'Chased entry', 'Early exit', 'Moved stop', 'No stop', 'Oversized'];

export default function TradeDetail({ trade, onClose, onSave, onDelete }) {
  const candles = useMemo(() => buildTradeCandles(trade), [trade]);
  const [replayIdx, setReplayIdx] = useState(null); // null = full chart
  const [playing, setPlaying] = useState(false);
  const [form, setForm] = useState({ setup: trade.setup || '', emotion: trade.emotion || '', mistake: trade.mistake || '', notes: trade.notes || '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({ setup: trade.setup || '', emotion: trade.emotion || '', mistake: trade.mistake || '', notes: trade.notes || '' });
    setReplayIdx(null);
    setPlaying(false);
  }, [trade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Replay ticker.
  useEffect(() => {
    if (!playing || !candles) return undefined;
    const timer = setInterval(() => {
      setReplayIdx((idx) => {
        const next = (idx == null ? 0 : idx) + 1;
        if (next >= candles.length) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 180);
    return () => clearInterval(timer);
  }, [playing, candles]);

  const visibleCandles = useMemo(() => {
    if (!candles) return null;
    return replayIdx == null ? candles : candles.slice(0, Math.max(replayIdx, 1));
  }, [candles, replayIdx]);

  const handleSave = () => {
    onSave({ ...trade, setup: form.setup || null, emotion: form.emotion || null, mistake: form.mistake || null, notes: form.notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const stats = [
    { label: 'Entry', value: `₹${trade.entryPrice}` },
    { label: 'Exit', value: `₹${trade.exitPrice}` },
    { label: 'Qty', value: trade.quantity },
    { label: 'Net P&L', value: formatINR(trade.netPnL, { compact: false }), tone: trade.netPnL >= 0 ? 'good' : 'bad' },
    { label: 'R multiple', value: trade.rMultiple != null ? `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple.toFixed(2)}R` : '—', tone: trade.rMultiple >= 0 ? 'good' : 'bad' },
    { label: 'Hold', value: formatHold(trade.holdMins) },
    { label: 'Fees', value: formatINR(trade.fees, { compact: false }) },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`Trade detail ${trade.symbol}`} className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">{trade.symbol}</h2>
            <DirectionBadge direction={trade.direction} />
            <span className="text-xs text-muted-foreground">{trade.entryDate.slice(0, 10)} → {trade.exitDate.slice(0, 10)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { if (window.confirm('Delete this trade?')) onDelete(trade.id); }} aria-label="Delete trade" className="rounded-md p-1.5 text-muted-foreground hover:bg-[#d03b3b]/15 hover:text-[#e66767]">
              <Trash2 className="size-4" />
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card/60 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className={cn('text-sm font-semibold tabular-nums', s.tone === 'good' && 'text-[#4fbf4f]', s.tone === 'bad' && 'text-[#e66767]')}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Chart + replay */}
          {candles ? (
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Entry/exit on price — shaded zone spans the trade; dashed lines mark stop and target</p>
                <div className="flex items-center gap-1" role="group" aria-label="Replay controls">
                  <button onClick={() => { setReplayIdx(1); setPlaying(false); }} aria-label="Restart replay" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><SkipBack className="size-4" /></button>
                  <button
                    onClick={() => { if (replayIdx == null) setReplayIdx(1); setPlaying((p) => !p); }}
                    aria-label={playing ? 'Pause replay' : 'Play replay'}
                    className="rounded-md bg-[#3987e5]/15 p-1.5 text-[#6da7ec] hover:bg-[#3987e5]/25"
                  >
                    {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>
                  <button onClick={() => { setPlaying(false); setReplayIdx((i) => Math.min((i == null ? 0 : i) + 1, candles.length - 1)); }} aria-label="Step forward" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><StepForward className="size-4" /></button>
                  {replayIdx != null && (
                    <button onClick={() => { setPlaying(false); setReplayIdx(null); }} className="ml-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">Show all</button>
                  )}
                </div>
              </div>
              <TradeChart trade={trade} candles={visibleCandles} allCandles={candles} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No price path stored for this trade, so the chart, MFE/MAE, and replay are unavailable. Trades added manually or via CSV can still be analyzed by P&L and R.
            </div>
          )}

          {/* Excursion bar */}
          {trade.mfe != null && <ExcursionBar trade={trade} />}

          {/* Journal fields */}
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Journal</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Setup">
                <select value={form.setup} onChange={(e) => setForm((f) => ({ ...f, setup: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Emotion at entry">
                <select value={form.emotion} onChange={(e) => setForm((f) => ({ ...f, emotion: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {EMOTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Mistake">
                <select value={form.mistake} onChange={(e) => setForm((f) => ({ ...f, mistake: e.target.value }))} className={inputClass}>
                  {MISTAKES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="What was the plan? Did you follow it?"
                className={cn(inputClass, 'h-auto py-2 resize-y')}
              />
            </Field>
            <div className="flex justify-end">
              <button onClick={handleSave} className="rounded-md bg-[#3987e5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2a78d6]">
                {saved ? 'Saved ✓' : 'Save journal'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// Horizontal excursion visual: MAE ← entry → exit → MFE, per-position ₹.
function ExcursionBar({ trade }) {
  const realized = trade.netPnL + (trade.fees || 0);
  const span = trade.mae + trade.mfe || 1;
  const pos = (v) => `${(((v + trade.mae) / span) * 100).toFixed(1)}%`;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Excursion — how far the trade went against and for you</span>
        {trade.captureRate != null && (
          <span className="font-medium text-[#eda100]">Captured {Math.round(trade.captureRate * 100)}% of peak profit</span>
        )}
      </div>
      <div className="relative mx-10 mt-4 h-3 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-l-full bg-[#e66767]/50" style={{ left: 0, width: pos(0) }} />
        <div className="absolute inset-y-0 bg-[#c98500]/40" style={{ left: pos(0), width: `${((trade.mfe / span) * 100).toFixed(1)}%` }} />
        {[
          { label: `MAE ${formatINR(-trade.mae)}`, v: -trade.mae, color: '#e66767' },
          { label: 'Entry', v: 0, color: PALETTE.axis },
          { label: `Exit ${formatINR(realized)}`, v: realized, color: realized >= 0 ? '#4fbf4f' : '#e66767' },
          { label: `MFE ${formatINR(trade.mfe)}`, v: trade.mfe, color: '#eda100' },
        ].map((m) => (
          <div key={m.label} className="absolute -top-1 h-5 w-0.5" style={{ left: pos(m.v), backgroundColor: m.color }}>
            <span className="absolute top-6 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums" style={{ color: m.color }}>{m.label}</span>
          </div>
        ))}
      </div>
      <div className="h-8" />
    </div>
  );
}

function TradeChart({ trade, candles, allCandles }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null);
  const overlayRef = useRef(null);

  // Create chart once per trade.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const chart = createChart(el, {
      height: 320,
      layout: { background: { color: 'transparent' }, textColor: PALETTE.axis, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: PALETTE.grid }, horzLines: { color: PALETTE.grid } },
      rightPriceScale: { borderColor: PALETTE.neutral },
      timeScale: { borderColor: PALETTE.neutral, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: PALETTE.win,
      downColor: PALETTE.loss,
      borderUpColor: PALETTE.win,
      borderDownColor: PALETTE.loss,
      wickUpColor: PALETTE.win,
      wickDownColor: PALETTE.loss,
    });

    // Reference lines: entry, exit, stop, target.
    const mult = trade.direction === 'short' ? -1 : 1;
    series.createPriceLine({ price: trade.entryPrice, color: PALETTE.series1, lineWidth: 1, lineStyle: 0, title: 'entry' });
    series.createPriceLine({ price: trade.exitPrice, color: trade.netPnL >= 0 ? PALETTE.win : PALETTE.loss, lineWidth: 1, lineStyle: 0, title: 'exit' });
    if (trade.stopLoss != null) series.createPriceLine({ price: trade.stopLoss, color: PALETTE.lossCritical, lineWidth: 1, lineStyle: 2, title: 'stop' });
    if (trade.target != null) series.createPriceLine({ price: trade.target, color: PALETTE.series3, lineWidth: 1, lineStyle: 2, title: `target${mult > 0 ? '' : ''}` });

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    const resize = () => chart.applyOptions({ width: el.clientWidth });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Trade-zone shading: a positioned overlay div kept in sync with chart coords.
    const syncOverlay = () => {
      const overlay = overlayRef.current;
      if (!overlay || !chartRef.current || !seriesRef.current) return;
      const entryTime = Math.floor(new Date(trade.entryDate).getTime() / 1000);
      const exitTime = Math.floor(new Date(trade.exitDate).getTime() / 1000);
      const x1 = chart.timeScale().timeToCoordinate(entryTime);
      const x2 = chart.timeScale().timeToCoordinate(exitTime);
      const y1 = series.priceToCoordinate(Math.max(trade.entryPrice, trade.exitPrice));
      const y2 = series.priceToCoordinate(Math.min(trade.entryPrice, trade.exitPrice));
      if (x1 == null || y1 == null || y2 == null) {
        overlay.style.display = 'none';
        return;
      }
      const right = x2 == null ? el.clientWidth - 70 : x2;
      overlay.style.display = 'block';
      overlay.style.left = `${Math.min(x1, right)}px`;
      overlay.style.width = `${Math.max(Math.abs(right - x1), 2)}px`;
      overlay.style.top = `${y1}px`;
      overlay.style.height = `${Math.max(y2 - y1, 2)}px`;
      overlay.style.backgroundColor = trade.netPnL >= 0 ? PALETTE.winSoft : PALETTE.lossSoft;
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(syncOverlay);
    const raf = { id: 0 };
    const loop = () => { syncOverlay(); raf.id = requestAnimationFrame(loop); };
    raf.id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf.id);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, [trade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push data + markers whenever the visible slice changes (replay).
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !candles?.length) return;
    series.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

    const entryTime = Math.floor(new Date(trade.entryDate).getTime() / 1000);
    const exitTime = Math.floor(new Date(trade.exitDate).getTime() / 1000);
    const lastVisible = candles[candles.length - 1].time;
    const isLong = trade.direction !== 'short';
    const markers = [];
    const entryCandle = candles.find((c) => c.time >= entryTime);
    if (entryCandle) {
      markers.push({
        time: entryCandle.time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: PALETTE.series1,
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: `${isLong ? 'Buy' : 'Sell'} @${trade.entryPrice}`,
      });
    }
    if (lastVisible >= exitTime) {
      const exitCandle = [...candles].reverse().find((c) => c.time <= exitTime) || candles[candles.length - 1];
      markers.push({
        time: exitCandle.time,
        position: isLong ? 'aboveBar' : 'belowBar',
        color: trade.netPnL >= 0 ? PALETTE.win : PALETTE.lossCritical,
        shape: isLong ? 'arrowDown' : 'arrowUp',
        text: `Exit @${trade.exitPrice}`,
      });
    }
    markersRef.current?.setMarkers(markers);

    // Keep full extent visible so replay reveals candles into empty space.
    chart.timeScale().setVisibleRange({
      from: allCandles[0].time,
      to: allCandles[allCandles.length - 1].time,
    });
  }, [candles, allCandles, trade]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" />
      <div ref={overlayRef} className="pointer-events-none absolute z-10 rounded-sm" style={{ display: 'none' }} />
    </div>
  );
}
