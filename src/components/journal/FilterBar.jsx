import { Filter, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { inputClass } from './ui';

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: null },
];

function presetRange(days) {
  if (days == null) return { from: '', to: '' };
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function FilterBar({ filters, setFilters, symbols, setups, count, total }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const isDefault = !filters.from && !filters.to && filters.symbol === 'all' && filters.setup === 'all' && filters.direction === 'all' && filters.outcome === 'all';

  return (
    <div className="sticky top-16 z-20 -mx-1 rounded-xl border border-border bg-background/90 px-3 py-2.5 backdrop-blur flex flex-wrap items-center gap-2">
      <Filter className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Date range presets">
        {PRESETS.map((p) => {
          const range = presetRange(p.days);
          const active = filters.from === range.from && filters.to === range.to;
          return (
            <button
              key={p.label}
              onClick={() => set(range)}
              className={cn('px-2.5 py-1.5 text-xs font-medium transition-colors', active ? 'bg-[#3987e5]/20 text-[#6da7ec]' : 'text-muted-foreground hover:bg-muted')}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" className={cn(inputClass, 'h-8 w-[8.5rem] text-xs')} />
      <span className="text-xs text-muted-foreground">→</span>
      <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" className={cn(inputClass, 'h-8 w-[8.5rem] text-xs')} />

      <select value={filters.symbol} onChange={(e) => set({ symbol: e.target.value })} aria-label="Symbol filter" className={cn(inputClass, 'h-8 text-xs')}>
        <option value="all">All symbols</option>
        {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.setup} onChange={(e) => set({ setup: e.target.value })} aria-label="Setup filter" className={cn(inputClass, 'h-8 text-xs')}>
        <option value="all">All setups</option>
        {setups.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.direction} onChange={(e) => set({ direction: e.target.value })} aria-label="Direction filter" className={cn(inputClass, 'h-8 text-xs')}>
        <option value="all">Long + Short</option>
        <option value="long">Long only</option>
        <option value="short">Short only</option>
      </select>
      <select value={filters.outcome} onChange={(e) => set({ outcome: e.target.value })} aria-label="Outcome filter" className={cn(inputClass, 'h-8 text-xs')}>
        <option value="all">Wins + Losses</option>
        <option value="wins">Wins only</option>
        <option value="losses">Losses only</option>
      </select>

      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count} / {total} trades</span>
      {!isDefault && (
        <button
          onClick={() => setFilters({ from: '', to: '', symbol: 'all', setup: 'all', direction: 'all', outcome: 'all' })}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3" /> Reset
        </button>
      )}
    </div>
  );
}
