import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

/**
 * The calendar spread's profit "tent", as it stands on FRONT-MONTH EXPIRY DAY.
 *
 * The x-axis is where the underlying could be on that day; the y-axis is the
 * P&L of the whole spread. The peak sits at the strike, and the two zero
 * crossings are the breakevens that the TENT_BREACH exit rule watches.
 */
const CalendarPayoffChart = ({ plan }) => {
    if (!plan?.viable || !plan.payoff?.points?.length) return null;

    const lot = plan.lotSize || 1;
    const data = plan.payoff.points.map((p) => ({
        underlying: Number(p.underlying.toFixed(2)),
        pnl: Number((p.pnl * lot).toFixed(2)),
    }));

    const zone = plan.profitZone;
    const money = (v) =>
        Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);

    return (
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
                    <defs>
                        <linearGradient id="payoffProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis
                        dataKey="underlying"
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.toFixed(0)}
                        minTickGap={28}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        tickFormatter={money}
                        width={52}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        formatter={(v) => [`${v > 0 ? '+' : ''}${Number(v).toFixed(0)}`, 'P&L per lot']}
                        labelFormatter={(v) => `Underlying at ${Number(v).toFixed(2)}`}
                    />

                    <Area
                        type="monotone"
                        dataKey="pnl"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        fill="url(#payoffProfit)"
                    />

                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                    <ReferenceLine
                        x={Number(plan.strike.toFixed(2))}
                        stroke="hsl(var(--primary))"
                        strokeDasharray="4 4"
                        label={{ value: `K ${plan.strike}`, fontSize: 10, fill: 'hsl(var(--primary))', position: 'top' }}
                    />
                    <ReferenceLine
                        x={Number(plan.spot.toFixed(2))}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="2 2"
                        label={{ value: 'Spot', fontSize: 10, fill: 'hsl(var(--muted-foreground))', position: 'insideTopRight' }}
                    />

                    {zone && (
                        <>
                            <ReferenceLine x={Number(zone.low.toFixed(2))} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                            <ReferenceLine x={Number(zone.high.toFixed(2))} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                        </>
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CalendarPayoffChart;
