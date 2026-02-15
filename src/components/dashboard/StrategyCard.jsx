import { TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

const StrategyCard = ({ strategyData }) => {
    if (!strategyData || !strategyData.strategy) return (
        <div className="p-6 text-center text-muted-foreground border rounded-xl border-dashed">
            No strategy selected
        </div>
    );

    const { strategy, symbol, conviction, signal } = strategyData;
    const { name, legs, max_profit, max_loss, breakeven, risk_reward } = strategy.strategy || {};

    if (!name) return null;

    return (
        <div className="bg-card border rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-muted/30 p-4 border-b flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold">{symbol}</h3>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-primary text-primary-foreground">
                            {name.toUpperCase()}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        Signal: <span className="font-medium text-foreground">{signal}</span>
                        <span className="text-border">|</span>
                        Conviction: <span className="font-medium text-foreground">{conviction}/10</span>
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-muted-foreground">Risk:Reward</div>
                    <div className="text-lg font-bold text-primary">{risk_reward}</div>
                </div>
            </div>

            {/* Legs */}
            <div className="p-4 border-b bg-card">
                <h4 className="text-sm font-semibold mb-3 text-muted-foreground">TRADE LEGS</h4>
                <div className="space-y-2">
                    {legs && legs.map((leg, i) => (
                        <div key={i} className="flex justify-between items-center p-2 rounded bg-muted/50 border border-muted">
                            <div className="flex items-center gap-3">
                                <span className={leg.action === 'BUY' ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                                    {leg.action}
                                </span>
                                <span className="font-mono">{leg.instrument}</span>
                            </div>
                            <div className="font-mono text-sm">
                                {leg.qty} qty @ <span className="font-bold">₹{leg.price}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 divide-x divide-border border-b">
                <div className="p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Max Profit</div>
                    <div className="text-lg font-bold text-green-500">
                        {typeof max_profit === 'number' ? `₹${max_profit.toFixed(0)}` : 'Unlimited'}
                    </div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Max Loss</div>
                    <div className="text-lg font-bold text-red-500">
                        {typeof max_loss === 'number' ? `₹${max_loss.toFixed(0)}` : 'Unlimited'}
                    </div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Breakeven</div>
                    <div className="text-lg font-bold">
                        {typeof breakeven === 'number' ? breakeven.toFixed(1) : '-'}
                    </div>
                </div>
            </div>

            {/* Rationale */}
            <div className="p-4 bg-muted/10">
                <h4 className="text-sm font-semibold mb-2 text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> WHY THIS TRADE
                </h4>
                <ul className="space-y-1">
                    {strategy.reasons && strategy.reasons.map((r, i) => (
                        <li key={i} className="text-sm pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground">
                            {r}
                        </li>
                    ))}
                </ul>
            </div>
            
             {/* Payoff Diagram Placeholder - Implementing Recharts one would be better but simple CSS/Canvas for now is complex */}
             <div className="p-4 border-t">
                  <div className="h-32 bg-muted/20 rounded flex items-center justify-center text-muted-foreground text-xs italic">
                      Payoff Diagram Visual Component
                  </div>
             </div>
        </div>
    );
};

export default StrategyCard;
