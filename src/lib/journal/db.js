// IndexedDB persistence via Dexie. The journal survives reloads; the seeded
// sample set is loaded on first run and can be cleared once real trades exist.
import Dexie from 'dexie';
import { generateSampleTrades } from './sampleData';

const db = new Dexie('fno-trade-journal');
db.version(1).stores({
  trades: 'id, symbol, entryDate, exitDate',
  prefs: 'key',
});

export async function loadTrades() {
  const existing = await db.trades.toArray();
  if (existing.length > 0) return existing;
  const seeded = await db.prefs.get('seeded');
  if (seeded) return [];
  const sample = generateSampleTrades();
  await db.trades.bulkPut(sample);
  await db.prefs.put({ key: 'seeded', value: true });
  return sample;
}

export async function saveTrade(trade) {
  await db.trades.put(stripDerived(trade));
}

export async function saveTrades(trades) {
  await db.trades.bulkPut(trades.map(stripDerived));
}

export async function deleteTrade(id) {
  await db.trades.delete(id);
}

export async function clearSampleTrades() {
  const sampleIds = await db.trades.filter((t) => t.sample).primaryKeys();
  await db.trades.bulkDelete(sampleIds);
}

export async function clearAllTrades() {
  await db.trades.clear();
}

export function exportJournal(trades) {
  const payload = {
    app: 'fno-trade-journal',
    version: 1,
    exportedAt: new Date().toISOString(),
    trades: trades.map(stripDerived),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJournal(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const trades = Array.isArray(payload) ? payload : payload.trades;
  if (!Array.isArray(trades)) throw new Error('No trades found in file');
  await db.trades.bulkPut(trades.map(stripDerived));
  return trades.length;
}

// Derived metrics are recomputed on load; only source fields are stored.
const DERIVED_KEYS = [
  'grossPnL', 'netPnL', 'risk', 'rMultiple', 'holdMins', 'mfe', 'mae',
  'mfeR', 'maeR', 'captureRate', 'isWin', 'simulated',
];

function stripDerived(trade) {
  const clean = { ...trade };
  for (const key of DERIVED_KEYS) delete clean[key];
  return clean;
}
