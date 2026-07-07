// CSV import: parses with PapaParse, auto-detects a column mapping from
// common header names (generic journals + Zerodha tradebook), and converts
// mapped rows into trade objects. Imported trades have no price path, so
// MFE/MAE stay null for them until a path source exists.
import Papa from 'papaparse';

export const TRADE_FIELDS = [
  { field: 'symbol', label: 'Symbol', required: true, aliases: ['symbol', 'tradingsymbol', 'scrip', 'ticker', 'instrument'] },
  { field: 'direction', label: 'Direction', required: true, aliases: ['direction', 'side', 'trade_type', 'type', 'buy/sell'] },
  { field: 'entryDate', label: 'Entry date', required: true, aliases: ['entrydate', 'entry_date', 'entry date', 'entry time', 'trade_date', 'order_execution_time', 'date'] },
  { field: 'entryPrice', label: 'Entry price', required: true, aliases: ['entryprice', 'entry_price', 'entry price', 'buy price', 'avg price', 'price'] },
  { field: 'exitDate', label: 'Exit date', required: false, aliases: ['exitdate', 'exit_date', 'exit date', 'exit time', 'close date'] },
  { field: 'exitPrice', label: 'Exit price', required: false, aliases: ['exitprice', 'exit_price', 'exit price', 'sell price', 'close price'] },
  { field: 'quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'size', 'filled qty'] },
  { field: 'stopLoss', label: 'Stop loss', required: false, aliases: ['stoploss', 'stop_loss', 'stop loss', 'stop', 'sl'] },
  { field: 'target', label: 'Target', required: false, aliases: ['target', 'take profit', 'tp'] },
  { field: 'fees', label: 'Fees', required: false, aliases: ['fees', 'charges', 'commission', 'brokerage'] },
  { field: 'setup', label: 'Setup', required: false, aliases: ['setup', 'strategy', 'playbook'] },
  { field: 'notes', label: 'Notes', required: false, aliases: ['notes', 'comment', 'remarks'] },
];

export function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
      error: reject,
    });
  });
}

export function autoDetectMapping(headers) {
  const mapping = {};
  const normalized = headers.map((h) => ({ raw: h, norm: h.trim().toLowerCase() }));
  for (const spec of TRADE_FIELDS) {
    const hit = normalized.find((h) => spec.aliases.includes(h.norm))
      || normalized.find((h) => spec.aliases.some((a) => h.norm.includes(a)));
    if (hit) mapping[spec.field] = hit.raw;
  }
  return mapping;
}

function parseDirection(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['short', 'sell', 's'].includes(v)) return 'short';
  return 'long';
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function rowsToTrades(rows, mapping) {
  const trades = [];
  const errors = [];
  rows.forEach((row, i) => {
    const get = (field) => (mapping[field] ? row[mapping[field]] : null);
    const entryDate = parseDate(get('entryDate'));
    const entryPrice = parseNumber(get('entryPrice'));
    const quantity = parseNumber(get('quantity'));
    const symbol = String(get('symbol') || '').trim().toUpperCase();
    if (!symbol || !entryDate || entryPrice == null || !quantity) {
      errors.push(`Row ${i + 2}: missing symbol, entry date, entry price, or quantity`);
      return;
    }
    trades.push({
      id: `I${Date.now().toString(36)}${i.toString(36)}`,
      symbol,
      instrument: /\bCE\b|\bPE\b/.test(symbol) ? (symbol.includes('PE') ? 'PE' : 'CE') : 'FUT',
      direction: parseDirection(get('direction')),
      entryDate,
      exitDate: parseDate(get('exitDate')) || entryDate,
      entryPrice,
      exitPrice: parseNumber(get('exitPrice')) ?? entryPrice,
      quantity: Math.abs(quantity),
      lotSize: null,
      stopLoss: parseNumber(get('stopLoss')),
      target: parseNumber(get('target')),
      fees: parseNumber(get('fees')) || 0,
      setup: get('setup') ? String(get('setup')).trim() : null,
      emotion: null,
      mistake: null,
      tags: [],
      notes: get('notes') ? String(get('notes')).trim() : '',
      path: null,
      sample: false,
    });
  });
  return { trades, errors };
}
