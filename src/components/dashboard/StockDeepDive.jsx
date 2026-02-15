import { useMemo } from 'react';
import PriceOIChart from '../charts/PriceOIChart';
import OptionChainHeatmap from './OptionChainHeatmap';
import StrategyCard from './StrategyCard';
import { ArrowLeft, Target, TrendingUp, Activity } from 'lucide-react';

const StockDeepDive = ({ stockData, onBack, futuresHistory, optionsRaw }) => {
    // stockData is the single row object from MarketScanner (includes strategy, conviction, etc)
    // futuresHistory is the FULL array of normalized futures data (need to filter for this stock)
    // optionsRaw is FULL array of options (need filter)

    if (!stockData) return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
             <p className="text-muted-foreground">Please select a stock from the Market Scanner first.</p>
             <button onClick={onBack} className="btn btn-primary">Go to Scanner</button>
        </div>
    );

    const stockHistory = useMemo(() => {
        return futuresHistory.filter(f => f.symbol === stockData.symbol);
    }, [futuresHistory, stockData.symbol]);

    const stockOptions = useMemo(() => {
        const chain = optionsRaw.filter(o => o.symbol === stockData.symbol);
        // We need the 'strikes' map format for heatmap.
        // Re-using analyzer logic or passing it down would be better.
        // But stockData.options DOES contain 'strikes'.
        return stockData.options ? stockData.options.strikes : null;
    }, [optionsRaw, stockData]);

    const stats = [
        { label: "Conviction", value: `${stockData.conviction}/10`, icon: Target, color: "text-primary" },
        { label: "Signal", value: stockData.signal, icon: TrendingUp, color: stockData.signal.includes("LONG") ? "text-green-500" : "text-red-500" },
        { label: "PCR", value: stockData.options?.pcrOI.toFixed(2) || "-", icon: Activity, color: "text-blue-500" },
        { label: "Max Pain", value: stockData.options?.maxPain || "-", icon: Activity, color: "text-yellow-500" },
    ];

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-muted rounded-full">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-bold">{stockData.symbol} Analysis</h2>
                <div className="px-3 py-1 bg-muted rounded text-sm font-mono">
                    Spot: {stockData.close}
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-card p-4 rounded-xl border shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">{stat.label}</p>
                            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                        <stat.icon className={`w-8 h-8 opacity-20 ${stat.color}`} />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col: Charts */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Price + OI Chart */}
                    <div className="bg-card p-4 rounded-xl border shadow-sm h-[400px]">
                        <h3 className="font-semibold mb-2">Price vs OI Trend</h3>
                        <PriceOIChart data={stockHistory} symbol={stockData.symbol} />
                    </div>

                    {/* Option Heatmap */}
                    <div className="bg-card p-4 rounded-xl border shadow-sm">
                        <h3 className="font-semibold mb-2">Option Chain Heatmap</h3>
                        {stockOptions ? (
                            <OptionChainHeatmap 
                                optionsData={stockOptions} 
                                spotPrice={stockData.close}
                                maxPain={stockData.options?.maxPain}
                            />
                        ) : (
                            <div className="h-32 flex items-center justify-center text-muted-foreground">No Options Data</div>
                        )}
                    </div>
                </div>

                {/* Right Col: Strategy */}
                <div className="space-y-6">
                    <StrategyCard strategyData={stockData} />
                    
                    {/* Divergence Info */}
                    <div className="bg-card p-4 rounded-xl border shadow-sm">
                         <h3 className="font-semibold mb-2">Basis Divergence</h3>
                         <div className="text-center py-6">
                             <div className={`text-3xl font-bold ${stockData.divergence?.basis > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                 {stockData.divergence?.basis.toFixed(2)}%
                             </div>
                             <p className="text-sm text-muted-foreground mt-1">
                                 {stockData.divergence?.basis > 0 ? "Futures Trading at Premium" : "Futures Trading at Discount"}
                             </p>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockDeepDive;
