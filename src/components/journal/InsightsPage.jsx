import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Award, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { breakdownBy, formatINR } from '../../lib/journal/metrics';
import { generateInsights, earnedBadges, journalingStreak } from '../../lib/journal/insights';
import { Card } from './ui';

const SEVERITY = {
  good: { icon: CheckCircle2, class: 'border-[#0ca30c]/40 bg-[#0ca30c]/10', iconClass: 'text-[#0ca30c]' },
  warning: { icon: Info, class: 'border-[#c98500]/40 bg-[#c98500]/10', iconClass: 'text-[#eda100]' },
  serious: { icon: AlertTriangle, class: 'border-[#d03b3b]/40 bg-[#d03b3b]/10', iconClass: 'text-[#e66767]' },
};

export default function InsightsPage({ trades }) {
  const insights = useMemo(() => generateInsights(trades), [trades]);
  const badges = useMemo(() => earnedBadges(trades), [trades]);
  const streak = useMemo(() => journalingStreak(trades), [trades]);
  const byEmotion = useMemo(
    () => breakdownBy(trades.filter((t) => t.emotion), (t) => t.emotion).sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0)),
    [trades],
  );
  const byMistake = useMemo(
    () => breakdownBy(trades.filter((t) => t.mistake), (t) => t.mistake).sort((a, b) => a.netPnL - b.netPnL),
    [trades],
  );

  return (
    <div className="space-y-4">
      {/* Auto insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {insights.map((ins) => {
          const spec = SEVERITY[ins.severity] || SEVERITY.warning;
          return (
            <div key={ins.title} className={cn('rounded-xl border p-4 flex gap-3', spec.class)}>
              <spec.icon className={cn('size-5 shrink-0 mt-0.5', spec.iconClass)} aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">{ins.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ins.body}</p>
              </div>
            </div>
          );
        })}
        {!insights.length && (
          <Card className="lg:col-span-2"><p className="py-6 text-center text-sm text-muted-foreground">Log at least 10 trades with tags to unlock automatic insights.</p></Card>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Emotion correlation */}
        <Card title="Emotion vs. outcome" subtitle="Average R by the state you tagged at entry">
          <EmotionTable rows={byEmotion} />
        </Card>

        {/* Mistake cost */}
        <Card title="Cost of mistakes" subtitle="Net P&L of trades where you tagged a mistake">
          {byMistake.length ? (
            <ul className="space-y-2.5">
              {byMistake.map((r) => (
                <li key={r.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.key}</span>
                  <span className="tabular-nums">
                    <span className={r.netPnL >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]'}>{formatINR(r.netPnL)}</span>
                    <span className="text-muted-foreground"> · {r.count} trades</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No mistakes tagged yet.</p>}
        </Card>

        {/* Streaks + badges */}
        <Card title="Discipline streaks" subtitle="Process rewards — tied to journaling, not profits">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <Flame className="size-6 text-[#eda100]" aria-hidden="true" />
            <div>
              <p className="text-lg font-semibold leading-none tabular-nums">{streak.current} day{streak.current === 1 ? '' : 's'}</p>
              <p className="text-[11px] text-muted-foreground">current journaling streak · best {streak.best} · {streak.daysTracked} days tracked</p>
            </div>
          </div>
          <ul className="space-y-2">
            {badges.map((b) => (
              <li key={b.id} className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', b.earned ? 'border-[#c98500]/40 bg-[#c98500]/10' : 'border-border opacity-50')}>
                <Award className={cn('size-4 shrink-0', b.earned ? 'text-[#eda100]' : 'text-muted-foreground')} aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground">{b.desc}</p>
                </div>
                {b.earned && <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-[#eda100]">Earned</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function EmotionTable({ rows }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No emotions tagged yet.</p>;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgR ?? 0)), 0.1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const v = r.avgR ?? 0;
        const half = Math.min(Math.abs(v) / maxAbs, 1) * 50;
        return (
          <li key={r.key} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{r.key}</span>
            <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: v >= 0 ? '50%' : `${50 - half}%`,
                  width: `${half}%`,
                  background: v >= 0 ? '#0ca30c' : '#e66767',
                }}
              />
            </div>
            <span className={cn('w-24 text-right tabular-nums', v >= 0 ? 'text-[#4fbf4f]' : 'text-[#e66767]')}>
              {v >= 0 ? '+' : ''}{v.toFixed(2)}R <span className="text-muted-foreground">· {r.count}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
