import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

const PriceOIChart = ({ data, symbol }) => {
    // data expected: Array of { date, close, oi, ... } sorted
    
    if (!data || data.length === 0) return <div className="h-64 flex items-center justify-center text-muted-foreground">No Chart Data</div>;

    // Formatting
    const formatXAxis = (tick) => { // tick is date string
        if (!tick) return "";
        const d = new Date(tick);
        return `${d.getDate()}/${d.getMonth()+1}`;
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-popover border text-popover-foreground p-2 rounded shadow-lg text-xs">
                    <p className="font-bold mb-1">{label}</p>
                    <p className="text-chart-1">Price: {payload[0].value}</p>
                    <p className="text-chart-2">OI: {payload[1].value.toLocaleString()}</p>
                    {/* Add Volume if needed */}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={formatXAxis} 
                        tick={{fontSize: 10, fill: 'hsl(var(--muted-foreground))'}} 
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis 
                        yAxisId="left" 
                        orientation="left" 
                        domain={['auto', 'auto']}
                        tick={{fontSize: 10, fill: 'hsl(var(--chart-1))'}} 
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />
                    <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        domain={['auto', 'auto']}
                        tick={{fontSize: 10, fill: 'hsl(var(--chart-2))'}} 
                        axisLine={false}
                        tickLine={false}
                        width={55}
                        tickFormatter={(val) => (val/1000).toFixed(0) + 'k'}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    
                    <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="close" 
                        stroke="hsl(var(--chart-1))" 
                        strokeWidth={2} 
                        dot={false}
                    />
                    <Area 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="oi" 
                        fill="hsl(var(--chart-2))" 
                        stroke="hsl(var(--chart-2))" 
                        fillOpacity={0.1} 
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

// Recharts doesn't export Area in ComposedChart by default in some versions? 
// No, it does. But let's check imports.
import { Area } from 'recharts'; // fixing import

export default PriceOIChart;
