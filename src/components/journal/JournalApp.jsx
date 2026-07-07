import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, ListOrdered, FlaskConical, Lightbulb, Plus, Upload, Download, Command } from 'lucide-react';
import { cn } from '../../lib/utils';
import { enrichAll } from '../../lib/journal/metrics';
import { loadTrades, saveTrade, saveTrades, deleteTrade, clearSampleTrades, exportJournal, importJournal } from '../../lib/journal/db';
import FilterBar from './FilterBar';
import DashboardPage from './DashboardPage';
import TradesPage from './TradesPage';
import AnalyticsPage from './AnalyticsPage';
import InsightsPage from './InsightsPage';
import TradeDetail from './TradeDetail';
import AddTradeModal from './AddTradeModal';
import ImportModal from './ImportModal';
import CommandPalette from './CommandPalette';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trades', label: 'Trades', icon: ListOrdered },
  { id: 'analytics', label: 'Analytics', icon: FlaskConical },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
];

const EMPTY_FILTERS = { from: '', to: '', symbol: 'all', setup: 'all', direction: 'all', outcome: 'all' };

export default function JournalApp() {
  const [rawTrades, setRawTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    loadTrades().then((trades) => {
      setRawTrades(trades);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const enriched = useMemo(() => enrichAll(rawTrades), [rawTrades]);

  const filtered = useMemo(() => enriched.filter((t) => {
    if (filters.symbol !== 'all' && t.symbol !== filters.symbol) return false;
    if (filters.setup !== 'all' && t.setup !== filters.setup) return false;
    if (filters.direction !== 'all' && t.direction !== filters.direction) return false;
    if (filters.outcome === 'wins' && !t.isWin) return false;
    if (filters.outcome === 'losses' && t.isWin) return false;
    const day = t.exitDate?.slice(0, 10) || '';
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  }), [enriched, filters]);

  const symbols = useMemo(() => [...new Set(enriched.map((t) => t.symbol))].sort(), [enriched]);
  const setups = useMemo(() => [...new Set(enriched.map((t) => t.setup).filter(Boolean))].sort(), [enriched]);
  const hasSample = useMemo(() => enriched.some((t) => t.sample), [enriched]);
  const selectedTrade = useMemo(() => enriched.find((t) => t.id === selectedId) || null, [enriched, selectedId]);

  const upsertTrade = useCallback(async (trade) => {
    await saveTrade(trade);
    setRawTrades((prev) => {
      const idx = prev.findIndex((t) => t.id === trade.id);
      if (idx === -1) return [...prev, trade];
      const next = [...prev];
      next[idx] = { ...next[idx], ...trade };
      return next;
    });
  }, []);

  const removeTrade = useCallback(async (id) => {
    await deleteTrade(id);
    setRawTrades((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const addImported = useCallback(async (trades) => {
    await saveTrades(trades);
    setRawTrades((prev) => [...prev, ...trades]);
  }, []);

  const dismissSample = useCallback(async () => {
    await clearSampleTrades();
    setRawTrades((prev) => prev.filter((t) => !t.sample));
  }, []);

  const handleImportJson = useCallback(async (file) => {
    await importJournal(file);
    const trades = await loadTrades();
    setRawTrades(trades);
  }, []);

  const commands = useMemo(() => [
    ...PAGES.map((p) => ({ id: `nav-${p.id}`, label: `Go to ${p.label}`, group: 'Navigate', run: () => setPage(p.id) })),
    { id: 'add-trade', label: 'Add trade', group: 'Actions', run: () => setAddOpen(true) },
    { id: 'import-csv', label: 'Import CSV', group: 'Actions', run: () => setImportOpen(true) },
    { id: 'export-json', label: 'Export journal (JSON)', group: 'Actions', run: () => exportJournal(rawTrades) },
    ...symbols.map((s) => ({ id: `sym-${s}`, label: `Filter: ${s}`, group: 'Symbols', run: () => { setFilters((f) => ({ ...f, symbol: s })); setPage('trades'); } })),
  ], [rawTrades, symbols]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading journal…</div>;
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="hidden md:flex w-44 shrink-0 flex-col gap-1 pt-1">
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPage(p.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
              page === p.id ? 'bg-[#3987e5]/15 text-[#6da7ec]' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <p.icon className="size-4" /> {p.label}
          </button>
        ))}
        <div className="mt-4 border-t border-border pt-4 flex flex-col gap-1">
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium bg-[#3987e5] text-white hover:bg-[#2a78d6] transition-colors">
            <Plus className="size-4" /> Add trade
          </button>
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <Upload className="size-4" /> Import CSV
          </button>
          <button onClick={() => exportJournal(rawTrades)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <Download className="size-4" /> Export JSON
          </button>
          <button onClick={() => setPaletteOpen(true)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <Command className="size-4" /> Ctrl+K
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1 space-y-4">
        {hasSample && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#c98500]/40 bg-[#c98500]/10 px-4 py-2.5 text-xs text-[#eda100]">
            <span>Showing generated sample data so every screen is alive. Clear it once you add real trades.</span>
            <button onClick={dismissSample} className="rounded-md border border-[#c98500]/40 px-2.5 py-1 font-medium hover:bg-[#c98500]/20">Clear sample data</button>
          </div>
        )}

        <FilterBar filters={filters} setFilters={setFilters} symbols={symbols} setups={setups} count={filtered.length} total={enriched.length} />

        {page === 'dashboard' && <DashboardPage trades={filtered} onSelectTrade={setSelectedId} onDayClick={(day) => { setFilters((f) => ({ ...f, from: day, to: day })); setPage('trades'); }} />}
        {page === 'trades' && <TradesPage trades={filtered} onSelectTrade={setSelectedId} onAdd={() => setAddOpen(true)} />}
        {page === 'analytics' && <AnalyticsPage trades={filtered} onSelectTrade={setSelectedId} />}
        {page === 'insights' && <InsightsPage trades={filtered} />}
      </div>

      {/* Overlays */}
      {selectedTrade && (
        <TradeDetail trade={selectedTrade} onClose={() => setSelectedId(null)} onSave={upsertTrade} onDelete={removeTrade} />
      )}
      <AddTradeModal open={addOpen} onClose={() => setAddOpen(false)} onSave={upsertTrade} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={addImported} onImportJson={handleImportJson} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
