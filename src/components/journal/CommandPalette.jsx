import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
    return hits.slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (cmd) => {
    cmd.run();
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && matches[active]) run(matches[active]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or symbol…"
            aria-label="Command search"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
          {matches.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                onClick={() => run(cmd)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm',
                  i === active ? 'bg-[#3987e5]/15 text-foreground' : 'text-muted-foreground',
                )}
              >
                <span>{cmd.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{cmd.group}</span>
              </button>
            </li>
          ))}
          {!matches.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
