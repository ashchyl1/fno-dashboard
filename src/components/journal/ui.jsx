import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PALETTE } from '../../lib/journal/palette';

export function Card({ className, children, title, subtitle, actions }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card/60 backdrop-blur-sm', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between px-5 pt-4 pb-1">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 pb-5 pt-2">{children}</div>
    </section>
  );
}

// Animated count-up for stat values.
export function useCountUp(target, duration = 650) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target || !Number.isFinite(target) || !Number.isFinite(from)) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function Sparkline({ data, width = 96, height = 28, color = PALETTE.series1 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function StatCard({ label, value, format, spark, delta, deltaLabel, tone = 'neutral', sparkColor }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  const display = typeof value === 'number' ? format(animated) : value ?? '—';
  const toneClass = tone === 'good' ? 'text-[#0ca30c]' : tone === 'bad' ? 'text-[#e66767]' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className={cn('text-2xl font-semibold leading-none tabular-nums whitespace-nowrap', toneClass)}>{display}</span>
        {spark && <Sparkline data={spark} color={sparkColor || PALETTE.series1} />}
      </div>
      {delta != null && (
        <span className={cn('text-[11px] tabular-nums', delta >= 0 ? 'text-[#0ca30c]' : 'text-[#e66767]')}>
          {delta >= 0 ? '▲' : '▼'} {deltaLabel}
        </span>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 md:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cn('w-full rounded-xl border border-border bg-background shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = 'h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60';

export function DirectionBadge({ direction }) {
  const long = direction === 'long';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
      long ? 'bg-[#0ca30c]/15 text-[#4fbf4f]' : 'bg-[#e66767]/15 text-[#e66767]',
    )}
    >
      {long ? 'Long' : 'Short'}
    </span>
  );
}

export function TagChip({ children, tone = 'muted' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    accent: 'bg-[#3987e5]/15 text-[#6da7ec]',
    warn: 'bg-[#c98500]/15 text-[#eda100]',
  };
  return <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}
