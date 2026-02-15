import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import { detectDivergence } from '../../lib/analysis/divergence';
import { parseFuturesData } from '../../lib/parsers';

const DivergenceMap = ({ futuresData, optionsData, onSelectStock }) => {
    // Generate data on fly if passed raw, but ideally should accept pre-processed
    // Let's assume we pass raw data for now to keep it standalone in "Tabs" model
    
    // We need aggregation here if not passed.
    // Assuming this component might be used in the main App tab directly.
    
    let chartData = [];
    if (futuresData.length > 0 && optionsData.length > 0) {
        // We reuse logic from market scanner basically
        // But specifically for scatter plot: X = Cash % Change (Need history), Y = Futures % Change (Need history)
        // OR X = Basis, Y = Conviction?
        // Prompt says: X: Cash % Change, Y: Futures % Change.
        // We need "Change" so we need at least 2 days of data for both Spot and Futures.
        // We have Futures history.
        // We ONLY have Snapshot Options (Spot) for Today. We DON'T have Spot history.
        // So we can't calculate Spot % Change accurately unless we infer it from Futures diff? No.
        
        // Alternative: Use Basis on X, Conviction on Y?
        // OR simply Plot Current Basis distribution.
        
        // Let's implement Basis vs OI Change? 
        // User spec: X=Cash %, Y=Futures %.
        // Without Spot history, we can't do Cash %.
        // We will fallback to: X = Futures % Change, Y = Basis %. 
        // Logic: if Futures moved +2% but Basis is Negative (Discount), that's interesting.
        
        const latestFutures = new Map();
        const prevFutures = new Map();
        
        // Sort
        const sorted = [...futuresData].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        sorted.forEach(row => {
            prevFutures.set(row.symbol, latestFutures.get(row.symbol)); // store prev
            latestFutures.set(row.symbol, row);
        });

        // Calculate
        const div = detectDivergence(futuresData, optionsData); // Returns basis
        
        chartData = div.map(d => {
            const curr = latestFutures.get(d.symbol);
            const prev = prevFutures.get(d.symbol);
            
            if (!curr || !prev) return null;
            
            const futChange = ((curr.close - prev.close) / prev.close) * 100;
            
            return {
                symbol: d.symbol,
                x: futChange, // Futures % Change
                y: d.basis,   // Basis % (Premium/Discount)
                z: 1          // Bubble size
            };
        }).filter(Boolean);
    }

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-popover border p-2 rounded shadow text-xs">
                    <p className="font-bold">{data.symbol}</p>
                    <p>Futures Move: {data.x.toFixed(2)}%</p>
                    <p>Basis: {data.y.toFixed(2)}%</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="h-[500px] w-full bg-card border rounded-xl p-4">
             <h3 className="text-lg font-bold mb-2">Futures Momentum vs Basis</h3>
             <ResponsiveContainer width="100%" height="90%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                     <XAxis type="number" dataKey="x" name="Futures %" unit="%" label={{ value: 'Futures % Change', position: 'bottom', offset: 0 }} />
                     <YAxis type="number" dataKey="y" name="Basis %" unit="%" label={{ value: 'Basis (Prem/Disc)', angle: -90, position: 'left' }} />
                     <Tooltip content={<CustomTooltip />} />
                     <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                     <ReferenceLine x={0} stroke="#666" strokeDasharray="3 3" />
                     <Scatter name="Stocks" data={chartData} fill="hsl(var(--primary))" onClick={(p) => onSelectStock && onSelectStock(p.symbol)}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.y > 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />
                        ))}
                     </Scatter>
                </ScatterChart>
             </ResponsiveContainer>
        </div>
    );
};

// Fix import
import { CartesianGrid } from 'recharts';

export default DivergenceMap;
