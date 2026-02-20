import { useState, useMemo, useEffect } from 'react';
import FileUpload from '../ui/FileUpload';
import { parseFuturesData, parseOptionsData } from '../../lib/parsers';
import { classifyOI } from '../../lib/analysis/oi-classifier';
import { analyzeOptionChain } from '../../lib/analysis/options-analyzer';
import { detectDivergence } from '../../lib/analysis/divergence';
import { scoreConviction } from '../../lib/analysis/conviction';
import { generateStrategy } from '../../lib/analysis/strategy-engine';
import { CheckCircle2, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import LiveDataPanel from './LiveDataPanel';

const MarketScanner = ({
    onSelectStock,
    externalFuturesData,
    setExternalFuturesData,
    externalOptionsData,
    setExternalOptionsData,
    isAuthenticated,
}) => {
    // Local state fallback if no external state provided (for standalone testing)
    const [localFuturesData, setLocalFuturesData] = useState([]);
    const [localOptionsData, setLocalOptionsData] = useState([]);

    const futuresData = externalFuturesData || localFuturesData;
    const setFuturesData = setExternalFuturesData || setLocalFuturesData;
    
    const optionsData = externalOptionsData || localOptionsData;
    const setOptionsData = setExternalOptionsData || setLocalOptionsData;

    const [analysisResults, setAnalysisResults] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'conviction', direction: 'desc' });

    // --- Data Processing Pipeline ---
    useEffect(() => {
        if (futuresData.length === 0) return;

        // 1. Classify Futures
        const classified = classifyOI(futuresData);

        // 2. Prepare Options Map (Symbol -> Rows)
        const optionsMap = optionsData.reduce((acc, row) => {
            if(!acc[row.symbol]) acc[row.symbol] = [];
            acc[row.symbol].push(row);
            return acc;
        }, {});

        // 3. Run Divergence Check
        const divergences = detectDivergence(futuresData, optionsData);
        const divMap = divergences.reduce((acc, d) => {
            acc[d.symbol] = d;
            return acc;
        }, {});

        // 4. Combine & Score
        const combined = classified.map(item => {
            const optChain = optionsMap[item.symbol];
            const optAnalysis = optChain ? analyzeOptionChain(optChain, item.close) : null;
            const divData = divMap[item.symbol];

            const conviction = scoreConviction(item, optAnalysis);
            const strategy = generateStrategy(item, optAnalysis, divData, conviction);

            return {
                ...item,
                options: optAnalysis,
                divergence: divData,
                conviction,
                strategy
            };
        });

        // initial sort
        setAnalysisResults(combined.sort((a,b) => b.conviction - a.conviction));

    }, [futuresData, optionsData]);


    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });

        const sorted = [...analysisResults].sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            
            // Handle nested keys
            if (key === 'pcr') {
                valA = a.options?.pcrOI || 0;
                valB = b.options?.pcrOI || 0;
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        setAnalysisResults(sorted);
    };

    const getSignalColor = (signal) => {
        if (signal.includes("LONG")) return "text-green-500";
        if (signal.includes("SHORT")) return "text-red-500";
        return "text-muted-foreground";
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card p-6 rounded-xl border shadow-sm md:col-span-2">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                Data Import
                                {(futuresData.length > 0 && optionsData.length > 0) && <CheckCircle2 className="text-green-500 w-5 h-5" />}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Select individual files or scan a folder for NSE reports.
                            </p>
                        </div>
                        
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        const handle = await window.showDirectoryPicker();
                                        let foundFutures = false;
                                        let foundOptions = false;

                                        for await (const entry of handle.values()) {
                                            if (entry.kind === 'file' && entry.name.endsWith('.csv')) {
                                                const file = await entry.getFile();
                                                const text = await file.text();
                                                
                                                // Simple heuristic to detect file type
                                                // Futures (Bhavcopy) usually has "OPEN_INTEREST" or "OI_NO_CON" column and many rows
                                                // Options Chain (Snapshot) usually has "Call OI" / "Put OI" or specialized structure
                                                
                                                if (entry.name.toLowerCase().includes('bhav') || text.includes('OI_NO_CON')) {
                                                    setFuturesData(parseFuturesData(text));
                                                    foundFutures = true;
                                                } else if (entry.name.toLowerCase().includes('option') || text.includes('CE_OI') || text.includes('Underlying Index')) {
                                                    setOptionsData(parseOptionsData(text));
                                                    foundOptions = true;
                                                }
                                            }
                                        }

                                        if (foundFutures || foundOptions) {
                                            alert(`Scanned folder! Found: ${foundFutures ? 'Futures Data ' : ''} ${foundOptions ? 'Options Data' : ''}`);
                                        } else {
                                            alert("No matching CSV files found in folder. filenames should contain 'bhav' or 'option'.");
                                        }

                                    } catch (err) {
                                        console.error(err);
                                        if (err.name !== 'AbortError') alert("Folder access failed or not supported in this browser.");
                                    }
                                }}
                                className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <span className="text-lg">📂</span> Auto-Scan Folder
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <FileUpload 
                            label={`Upload Futures ${futuresData.length > 0 ? '✓' : ''}`} 
                            onDataLoaded={(data) => setFuturesData(parseFuturesData(data))} 
                        />
                         <FileUpload 
                            label={`Upload Options ${optionsData.length > 0 ? '✓' : ''}`} 
                            onDataLoaded={(data) => setOptionsData(parseOptionsData(data))} 
                        />
                    </div>
                </div>

                {/* Live Data Panel (Kite Connect) */}
                <div className="md:col-span-2">
                    <LiveDataPanel
                        isAuthenticated={isAuthenticated}
                        onFuturesLoaded={(data) => setFuturesData(data)}
                        onOptionsLoaded={(data) => setOptionsData(data)}
                    />
                </div>

                <div className="md:col-span-2 bg-muted/30 p-4 rounded-xl border border-dashed flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-sm">Need Data?</h3>
                        <p className="text-xs text-muted-foreground">Download latest reports directly from NSE.</p>
                    </div>
                    <div className="flex gap-3">
                        <a 
                            href="https://www.nseindia.com/all-reports" 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" /> NSE Reports
                        </a>
                        <a 
                            href="https://www.nseindia.com/market-data/daily-market-reports" 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" /> Bhavcopy
                        </a>
                        <a 
                            href="https://www.nseindia.com/option-chain" 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" /> Option Chain
                        </a>
                    </div>
                </div>
            </div>

            {/* Results Table */}
            {analysisResults.length > 0 && (
                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                        <h3 className="font-semibold text-lg">Market Scanner ({analysisResults.length} Stocks)</h3>
                        <div className="text-sm text-muted-foreground">
                            Sorted by: <span className="font-medium text-foreground capitalize">{sortConfig.key}</span>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="p-4 text-left cursor-pointer hover:bg-muted" onClick={() => handleSort('symbol')}>Stock</th>
                                    <th className="p-4 text-left cursor-pointer hover:bg-muted" onClick={() => handleSort('signal')}>OI Type</th>
                                    <th className="p-4 text-right cursor-pointer hover:bg-muted" onClick={() => handleSort('conviction')}>Conviction</th>
                                    <th className="p-4 text-right cursor-pointer hover:bg-muted" onClick={() => handleSort('pcr')}>PCR</th>
                                    <th className="p-4 text-right">IV (ATM%)</th>
                                    <th className="p-4 text-right">Basis</th>
                                    <th className="p-4 text-left">Strategy</th>
                                    <th className="p-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {analysisResults.map((row) => (
                                    <tr key={row.symbol} className="hover:bg-muted/50 transition-colors group">
                                        <td className="p-4 font-medium">{row.symbol}</td>
                                        <td className={cn("p-4 font-medium", getSignalColor(row.signal))}>
                                            <div className="flex items-center gap-2">
                                                {row.signal.includes("BUILD-UP") && row.signal.includes("LONG") ? <ArrowUp className="w-4 h-4" /> : null}
                                                {row.signal.includes("BUILD-UP") && row.signal.includes("SHORT") ? <ArrowDown className="w-4 h-4" /> : null}
                                                {row.signal}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-normal mt-1">
                                                OI: {(row.oiChangePct).toFixed(2)}%
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="inline-block px-2 py-1 rounded bg-secondary font-bold">
                                                {row.conviction}/10
                                            </div>
                                        </td>
                                        <td className={cn("p-4 text-right font-mono", 
                                            row.options?.pcrOI > 1.2 ? "text-green-500 font-bold" : 
                                            row.options?.pcrOI < 0.8 ? "text-red-500 font-bold" : "")}>
                                            {row.options ? row.options.pcrOI.toFixed(2) : '-'}
                                        </td>
                                        <td className="p-4 text-right font-mono text-muted-foreground">
                                            {row.options?.atmIvProxy ? `${row.options.atmIvProxy.toFixed(1)}%` : '-'}
                                        </td>
                                        <td className={cn("p-4 text-right", row.divergence?.basis > 0 ? "text-green-500" : "text-red-500")}>
                                            {row.divergence ? `${row.divergence.basis.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className="p-4">
                                            <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold border border-primary/20">
                                                {row.strategy.strategy?.name || "Wait"}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => onSelectStock && onSelectStock(row)}
                                                className="p-2 hover:bg-primary/10 rounded-full text-muted-foreground hover:text-primary transition-colors"
                                                title="Deep Dive"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketScanner;
