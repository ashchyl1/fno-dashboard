import { useState, useEffect, useRef } from 'react';
import { Zap, X, RotateCcw, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

const PLANS = [
  { label: 'Free',  limit: 100_000 },
  { label: 'Pro',   limit: 1_000_000 },
  { label: 'Max',   limit: 5_000_000 },
  { label: 'Custom', limit: null },
];

const STORAGE_KEY = 'fno_token_tracker';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { plan: 'Pro', customLimit: 1_000_000, used: 0 };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function TokenTracker() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(loadState);
  const [addInput, setAddInput] = useState('');
  const [customInput, setCustomInput] = useState('');
  const panelRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const planObj = PLANS.find(p => p.label === state.plan) || PLANS[1];
  const limit = state.plan === 'Custom' ? (state.customLimit || 1) : planObj.limit;
  const remaining = Math.max(0, limit - state.used);
  const pct = Math.min(100, (state.used / limit) * 100);

  const barColor =
    pct >= 90 ? 'bg-red-500' :
    pct >= 70 ? 'bg-yellow-500' :
    'bg-emerald-500';

  const badgeColor =
    pct >= 90 ? 'text-red-400 border-red-500/30 bg-red-500/10' :
    pct >= 70 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' :
    'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

  function handlePlanChange(planLabel) {
    setState(s => ({ ...s, plan: planLabel }));
    if (planLabel !== 'Custom') setCustomInput('');
  }

  function handleAddTokens() {
    const n = parseInt(addInput.replace(/,/g, ''), 10);
    if (!isNaN(n) && n > 0) {
      setState(s => ({ ...s, used: s.used + n }));
      setAddInput('');
    }
  }

  function handleCustomLimit() {
    const n = parseInt(customInput.replace(/,/g, ''), 10);
    if (!isNaN(n) && n > 0) {
      setState(s => ({ ...s, customLimit: n }));
    }
  }

  function handleReset() {
    setState(s => ({ ...s, used: 0 }));
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Header badge */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors',
          badgeColor
        )}
        title="Token usage tracker"
      >
        <Zap className="size-3.5" />
        <span>{fmt(remaining)} left</span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-card shadow-2xl z-50 p-4 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Token Budget</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fmt(state.used)} used</span>
              <span>{fmt(limit)} total</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-center font-medium">
              <span className={pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-emerald-400'}>
                {fmt(remaining)}
              </span>
              <span className="text-muted-foreground"> tokens remaining ({(100 - pct).toFixed(1)}%)</span>
            </p>
          </div>

          {/* Plan selector */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Plan</p>
            <div className="grid grid-cols-4 gap-1">
              {PLANS.map(p => (
                <button
                  key={p.label}
                  onClick={() => handlePlanChange(p.label)}
                  className={cn(
                    'py-1 rounded-md text-xs font-medium border transition-colors',
                    state.plan === p.label
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {state.plan === 'Custom' && (
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  placeholder="e.g. 2000000"
                  className="flex-1 rounded-md bg-muted border border-border px-2 py-1 text-xs outline-none focus:border-primary"
                />
                <button
                  onClick={handleCustomLimit}
                  className="px-2 py-1 rounded-md bg-primary/20 text-primary text-xs border border-primary/40 hover:bg-primary/30"
                >
                  Set
                </button>
              </div>
            )}
          </div>

          {/* Log tokens used */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Log tokens used</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTokens()}
                placeholder="e.g. 5000"
                className="flex-1 rounded-md bg-muted border border-border px-2 py-1 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={handleAddTokens}
                className="px-2 py-1 rounded-md bg-primary/20 text-primary text-xs border border-primary/40 hover:bg-primary/30"
              >
                Add
              </button>
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="size-3" /> Reset usage counter
          </button>

          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Saved locally in your browser. Log tokens from each Claude session manually.
          </p>
        </div>
      )}
    </div>
  );
}
