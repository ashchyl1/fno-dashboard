import { useRef, useState } from 'react';
import { FileUp, FileJson } from 'lucide-react';
import { cn } from '../../lib/utils';
import { parseCsv, autoDetectMapping, rowsToTrades, TRADE_FIELDS } from '../../lib/journal/csv';
import { Modal, inputClass } from './ui';

export default function ImportModal({ open, onClose, onImport, onImportJson }) {
  const [rows, setRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const csvInput = useRef(null);
  const jsonInput = useRef(null);

  const reset = () => {
    setRows(null); setHeaders([]); setMapping({}); setFileName(''); setError('');
  };

  const handleCsv = async (file) => {
    setError('');
    try {
      const results = await parseCsv(file);
      const fields = results.meta.fields || [];
      if (!fields.length) throw new Error('No header row found');
      setFileName(file.name);
      setHeaders(fields);
      setRows(results.data);
      setMapping(autoDetectMapping(fields));
    } catch (e) {
      setError(`Could not parse CSV: ${e.message}`);
    }
  };

  const handleJson = async (file) => {
    setError('');
    try {
      const count = await onImportJson(file);
      onClose();
      reset();
      return count;
    } catch (e) {
      setError(`Could not import JSON: ${e.message}`);
      return 0;
    }
  };

  const confirm = async () => {
    const { trades, errors } = rowsToTrades(rows, mapping);
    if (!trades.length) {
      setError(errors[0] || 'No valid rows found with the current mapping.');
      return;
    }
    await onImport(trades);
    onClose();
    reset();
  };

  const missingRequired = TRADE_FIELDS.filter((f) => f.required && !mapping[f.field]);

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Import trades" wide>
      {!rows ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => csvInput.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground hover:border-[#3987e5] hover:text-foreground transition-colors"
          >
            <FileUp className="size-6 text-[#6da7ec]" />
            <span className="font-medium text-foreground">CSV file</span>
            <span className="text-xs text-center">Generic journal export or Zerodha tradebook. Columns are auto-detected and you confirm the mapping.</span>
          </button>
          <button
            onClick={() => jsonInput.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground hover:border-[#3987e5] hover:text-foreground transition-colors"
          >
            <FileJson className="size-6 text-[#6da7ec]" />
            <span className="font-medium text-foreground">Journal JSON</span>
            <span className="text-xs text-center">Restore a full journal exported from this app (includes price paths).</span>
          </button>
          <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} />
          <input ref={jsonInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && handleJson(e.target.files[0])} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> — {rows.length} rows. Map columns to trade fields; required fields are marked *.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {TRADE_FIELDS.map((spec) => (
              <label key={spec.field} className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className={cn('font-medium', spec.required && !mapping[spec.field] && 'text-[#e66767]')}>
                  {spec.label}{spec.required && ' *'}
                </span>
                <select
                  value={mapping[spec.field] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [spec.field]: e.target.value || undefined }))}
                  className={cn(inputClass, 'h-8 text-xs')}
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {/* Preview */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {headers.slice(0, 8).map((h) => <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {headers.slice(0, 8).map((h) => <td key={h} className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{String(row[h] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={reset} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Choose another file</button>
            <button
              onClick={confirm}
              disabled={missingRequired.length > 0}
              className="rounded-md bg-[#3987e5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2a78d6] disabled:opacity-40"
            >
              Import {rows.length} rows
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-md bg-[#d03b3b]/10 px-3 py-2 text-xs text-[#e66767]">{error}</p>}
    </Modal>
  );
}
