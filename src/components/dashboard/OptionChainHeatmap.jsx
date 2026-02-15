import { useMemo } from 'react';
import { cn } from '../../lib/utils'; // Assuming utils exists

const OptionChainHeatmap = ({ optionsData, spotPrice, maxPain }) => {
    // Expecting optionsData to be the `strikes` object from analyzeOptionChain result
    // strikes: { [strike]: { CE_OI, PE_OI, CE_LTP, PE_LTP } }
    
    const sortedStrikes = useMemo(() => {
        if (!optionsData) return [];
        return Object.keys(optionsData).map(parseFloat).sort((a,b) => a-b);
    }, [optionsData]);

    if (sortedStrikes.length === 0) return <div>No Options Data</div>;

    // Filter to show range around spot (+- 10 strikes?) for readability
    // Find index of closest strike
    const closestIndex = sortedStrikes.reduce((closestIdx, curr, idx) => {
        const currentDiff = Math.abs(curr - spotPrice);
        const closestDiff = Math.abs(sortedStrikes[closestIdx] - spotPrice);
        return currentDiff < closestDiff ? idx : closestIdx;
    }, 0);

    const range = 8; // Show 8 strikes above and below
    const startIdx = Math.max(0, closestIndex - range);
    const endIdx = Math.min(sortedStrikes.length, closestIndex + range + 1);
    const visibleStrikes = sortedStrikes.slice(startIdx, endIdx);

    // Find Max OI for relative scaling
    let maxOI = 0;
    visibleStrikes.forEach(k => {
        maxOI = Math.max(maxOI, optionsData[k].CE_OI, optionsData[k].PE_OI);
    });

    return (
        <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
            <div className="flex justify-between p-3 bg-muted border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="w-1/3 text-right">Call OI</div>
                <div className="w-1/3 text-center">Strike</div>
                <div className="w-1/3 text-left">Put OI</div>
            </div>
            
            <div className="divide-y divide-border">
                {visibleStrikes.map(strike => {
                    const data = optionsData[strike];
                    const ceWidth = (data.CE_OI / maxOI) * 100;
                    const peWidth = (data.PE_OI / maxOI) * 100;
                    
                    const isSpot = spotPrice >= strike && spotPrice < (visibleStrikes[visibleStrikes.indexOf(strike)+1] || strike+100);
                    // Approximation for spot line: if spot is between this and next.
                    // Actually simpler: Highlight strike closest to spot.
                    const isAtM = Math.abs(strike - spotPrice) < (visibleStrikes[1]-visibleStrikes[0])/1.5;

                    return (
                        <div key={strike} className={cn("relative flex items-center h-8 text-xs hover:bg-muted/50", isAtM ? "bg-accent/20" : "")}>
                            
                            {/* Call Side (Left) */}
                            <div className="w-1/3 relative h-full flex items-center justify-end pr-2 border-r border-border/50">
                                <div 
                                    className="absolute right-0 top-1 bottom-1 bg-red-500/20 rounded-l-sm transition-all" 
                                    style={{ width: `${ceWidth}%` }}
                                ></div>
                                <span className="relative z-10 font-mono text-muted-foreground mr-1">{data.CE_OI.toLocaleString()}</span>
                            </div>

                            {/* Strike (Center) */}
                            <div className={cn("w-1/3 flex items-center justify-center font-bold relative h-full", 
                                strike === maxPain ? "text-yellow-500" : "text-foreground"
                            )}>
                                {strike}
                                {Math.abs(strike - spotPrice) < (spotPrice*0.005) && (
                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-blue-500 w-full z-20 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
                                )}
                                {strike === maxPain && <span className="absolute text-[8px] -top-0 right-2 text-yellow-500 opacity-70">MP</span>}
                            </div>

                            {/* Put Side (Right) */}
                            <div className="w-1/3 relative h-full flex items-center pl-2 border-l border-border/50">
                                <div 
                                    className="absolute left-0 top-1 bottom-1 bg-green-500/20 rounded-r-sm transition-all" 
                                    style={{ width: `${peWidth}%` }}
                                ></div>
                                <span className="relative z-10 font-mono text-muted-foreground ml-1">{data.PE_OI.toLocaleString()}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
            
            <div className="p-2 text-xs text-center text-muted-foreground bg-muted/20">
                <span className="inline-block w-2 h-2 bg-red-500/50 mr-1 rounded-sm"></span> Call OI (Res)
                <span className="inline-block w-2 h-2 bg-green-500/50 ml-3 mr-1 rounded-sm"></span> Put OI (Sup)
                <span className="inline-block w-2 h-2 bg-blue-500 ml-3 mr-1 rounded-full"></span> Spot Price
            </div>
        </div>
    );
};

export default OptionChainHeatmap;
