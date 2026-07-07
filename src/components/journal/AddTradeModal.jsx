import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { Modal, Field, inputClass } from './ui';

// NSE F&O lot sizes for autofill (approximate, editable by the user).
const LOT_SIZES = {
  NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 65, RELIANCE: 250, HDFCBANK: 550,
  TCS: 175, INFY: 400, SBIN: 750, TATAMOTORS: 550, ICICIBANK: 700, ITC: 1600,
};

const now = () => new Date().toISOString().slice(0, 16);

const EMPTY = {
  symbol: '', instrument: 'FUT', direction: 'long',
  entryDate: now(), exitDate: now(),
  entryPrice: '', exitPrice: '', lots: '1', lotSize: '',
  stopLoss: '', target: '', fees: '0', setup: '', notes: '',
};

export default function AddTradeModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSymbol = (value) => {
    const symbol = value.toUpperCase();
    const patch = { symbol };
    const root = symbol.split(' ')[0];
    if (LOT_SIZES[root] && !form.lotSize) patch.lotSize = String(LOT_SIZES[root]);
    if (/\bPE\b/.test(symbol)) patch.instrument = 'PE';
    else if (/\bCE\b/.test(symbol)) patch.instrument = 'CE';
    set(patch);
  };

  const quantity = useMemo(() => {
    const lots = Number(form.lots) || 0;
    const lotSize = Number(form.lotSize) || 1;
    return lots * lotSize;
  }, [form.lots, form.lotSize]);

  const valid = form.symbol && form.entryPrice && form.exitPrice && quantity > 0;

  const submit = () => {
    if (!valid) return;
    onSave({
      id: `M${Date.now().toString(36)}`,
      symbol: form.symbol.trim(),
      instrument: form.instrument,
      direction: form.direction,
      entryDate: new Date(form.entryDate).toISOString(),
      exitDate: new Date(form.exitDate).toISOString(),
      entryPrice: Number(form.entryPrice),
      exitPrice: Number(form.exitPrice),
      quantity,
      lotSize: Number(form.lotSize) || null,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : null,
      target: form.target ? Number(form.target) : null,
      fees: Number(form.fees) || 0,
      setup: form.setup || null,
      emotion: null,
      mistake: null,
      tags: [],
      notes: form.notes,
      path: null,
      sample: false,
    });
    setForm(EMPTY);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add trade">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol">
          <input value={form.symbol} onChange={(e) => handleSymbol(e.target.value)} placeholder="NIFTY / RELIANCE 3000 CE" className={inputClass} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Instrument">
            <select value={form.instrument} onChange={(e) => set({ instrument: e.target.value })} className={inputClass}>
              {['FUT', 'CE', 'PE', 'EQ'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <select value={form.direction} onChange={(e) => set({ direction: e.target.value })} className={inputClass}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </Field>
        </div>
        <Field label="Entry time">
          <input type="datetime-local" value={form.entryDate} onChange={(e) => set({ entryDate: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Exit time">
          <input type="datetime-local" value={form.exitDate} onChange={(e) => set({ exitDate: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Entry price">
          <input type="number" step="0.05" value={form.entryPrice} onChange={(e) => set({ entryPrice: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Exit price">
          <input type="number" step="0.05" value={form.exitPrice} onChange={(e) => set({ exitPrice: e.target.value })} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lots">
            <input type="number" min="1" value={form.lots} onChange={(e) => set({ lots: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Lot size">
            <input type="number" min="1" value={form.lotSize} onChange={(e) => set({ lotSize: e.target.value })} placeholder="auto" className={inputClass} />
          </Field>
        </div>
        <Field label={`Quantity (auto: ${quantity || '—'})`}>
          <input value={quantity || ''} disabled className={cn(inputClass, 'opacity-60')} />
        </Field>
        <Field label="Stop loss (recommended)">
          <input type="number" step="0.05" value={form.stopLoss} onChange={(e) => set({ stopLoss: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Target">
          <input type="number" step="0.05" value={form.target} onChange={(e) => set({ target: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Fees">
          <input type="number" value={form.fees} onChange={(e) => set({ fees: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Setup">
          <input value={form.setup} onChange={(e) => set({ setup: e.target.value })} placeholder="ORB Breakout" className={inputClass} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={cn(inputClass, 'h-auto py-2 resize-y')} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
        <button onClick={submit} disabled={!valid} className="rounded-md bg-[#3987e5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2a78d6] disabled:opacity-40">Save trade</button>
      </div>
    </Modal>
  );
}
