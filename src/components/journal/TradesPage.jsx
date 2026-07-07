import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, Plus, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatINR, formatHold } from '../../lib/journal/metrics';
import { Card, DirectionBadge, TagChip, inputClass } from './ui';

const COLUMNS = [
  { id: 'symbol', label: 'Symbol', width: 'w-40', sort: (t) => t.symbol },
  { id: 'direction', label: 'Side', width: 'w-20', sort: (t) => t.direction },
  { id: 'entry', label: 'Entry', width: 'w-32', sort: (t) => t.entryDate },
  { id: 'exit', label: 'Exit', width: 'w-32', sort: (t) => t.exitDate },
  { id: 'netPnL', label: 'Net P&L', width: 'w-28', sort: (t) => t.netPnL, right: true },
  { id: 'rMultiple', label: 'R', width: 'w-20', sort: (t) => t.rMultiple ?? -99, right: true },
  { id: 'capture', label: 'Capture', width: 'w-28', sort: (t) => t.captureRate ?? -1 },
  { id: 'hold', label: 'Hold', width: 'w-20', sort: (t) => t.holdMins ?? 0, right: true },
  { id: 'tags', label: 'Setup / tags', width: 'flex-1 min-w-40', sort: (t) => t.setup || '' },
];

export default function TradesPage({ trades, onSelectTrade, onAdd }) {
  const [sortBy, setSortBy] = useState({ id: 'exit', dir: -1 });
  const [query, setQuery] = useState('');
  const scrollRef = useRef(null);

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.id === sortBy.id) || COLUMNS[3];
    const q = query.trim().toUpperCase();
    const filtered = q
      ? trades.filter((t) => t.symbol.includes(q) || (t.setup || '').toUpperCase().includes(q) || (t.emotion || '').toUpperCase().includes(q))
      : trades;
    return [...filtered].sort((a, b) => {
      const av = col.sort(a);
      const bv = col.sort(b);
      if (av < bv) return -sortBy.dir;
      if (av > bv) return sortBy.dir;
      return 0;
    });
  }, [trades, sortBy, query]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const toggleSort = (id) => setSortBy((s) => (s.id === id ? { id, dir: -s.dir } : { id, dir: -1 }));

  return (
    <Card
      title="Trade journal"
      subtitle={`${rows.length} trades — click a row for the entry/exit chart, replay, and notes`}
      actions={(
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol, setup…" aria-label="Search trades" className={cn(inputClass, 'h-8 w-52 pl-7 text-xs')} />
          </div>
          <button onClick={onAdd} className="flex items-center gap-1.5 rounded-md bg-[#3987e5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2a78d6]">
            <Plus className="size-3.5" /> Add trade
          </button>
        </div>
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 border-b border-border px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {COLUMNS.map((c) => (
          <button key={c.id} onClick={() => toggleSort(c.id)} className={cn('flex items-center gap-1 hover:text-foreground', c.width, c.right && 'justify-end')}>
            {c.label}
            <ArrowUpDown className={cn('size-3', sortBy.id === c.id ? 'text-[#6da7ec]' : 'opacity-30')} />
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto" role="list" aria-label="Trades">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const t = rows[vi.index];
            return (
              <button
                key={t.id}
                role="listitem"
                onClick={() => onSelectTrade(t.id)}
                className="absolute left-0 flex w-full items-center gap-3 border-b border-border/50 px-2 text-left text-sm hover:bg-muted/50 transition-colors"
                style={{ top: 0, transform: `translateY(${vi.start}px)`, height: vi.size }}
              >
                <span className="w-40 truncate font-medium">{t.symbol}<span className="ml-1.5 text-[10px] text-muted-foreground">{t.instrument}</span></span>
                <span className="w-20"><DirectionBadge direction={t.direction} /></span>
                <span className="w-32 text-xs text-muted-foreground tabular-nums">{t.entryDate.slice(0, 10)}<br />@{t.entryPrice}</span>
                <span className="w-32 text-xs text-muted-foreground tabular-nums">{t.exitDate.slice(0, 10)}<br />@{t.exitPrice}</span>
                <span className={cn('w-28 text-right font-semibold tabular-nums', t.netPnL >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]')}>{formatINR(t.netPnL)}</span>
                <span className={cn('w-20 text-right tabular-nums text-xs', t.rMultiple == null ? 'text-muted-foreground' : t.rMultiple >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]')}>
                  {t.rMultiple == null ? '—' : `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R`}
                </span>
                <span className="w-28">
                  {t.captureRate == null ? <span className="text-xs text-muted-foreground">—</span> : (
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                        <span className="block h-full rounded-full bg-[#c98500]" style={{ width: `${Math.round(t.captureRate * 100)}%` }} />
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(t.captureRate * 100)}%</span>
                    </span>
                  )}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">{formatHold(t.holdMins)}</span>
                <span className="flex-1 min-w-40 flex flex-wrap gap-1 overflow-hidden">
                  {t.setup && <TagChip tone="accent">{t.setup}</TagChip>}
                  {t.emotion && <TagChip>{t.emotion}</TagChip>}
                  {t.mistake && <TagChip tone="warn">{t.mistake}</TagChip>}
                </span>
              </button>
            );
          })}
        </div>
        {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">No trades match.</p>}
      </div>
    </Card>
  );
}
