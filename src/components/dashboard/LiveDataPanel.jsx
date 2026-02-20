import { useState } from 'react';
import { Download, Loader2, RefreshCw, Zap, Database } from 'lucide-react';
import { cn } from '../../lib/utils';
import kiteAPI from '../../lib/api';

const POPULAR_FNO_STOCKS = [
    'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK',
    'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'KOTAKBANK',
    'LT', 'AXISBANK', 'MARUTI', 'TATAMOTORS', 'BAJFINANCE', 'TATASTEEL',
    'SUNPHARMA', 'WIPRO', 'HCLTECH', 'ADANIENT', 'ONGC', 'NTPC',
    'POWERGRID', 'COALINDIA', 'HINDALCO', 'JSWSTEEL', 'TECHM', 'DRREDDY',
];

const LiveDataPanel = ({ isAuthenticated, onFuturesLoaded, onOptionsLoaded }) => {
    const [loading, setLoading] = useState(false);
    const [loadingChain, setLoadingChain] = useState(false);
    const [selectedSymbols, setSelectedSymbols] = useState([]);
    const [customSymbol, setCustomSymbol] = useState('');
    const [chainSymbol, setChainSymbol] = useState('NIFTY');
    const [fetchStatus, setFetchStatus] = useState(null);

    const toggleSymbol = (sym) => {
        setSelectedSymbols(prev =>
            prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
        );
    };

    const selectAll = () => setSelectedSymbols([...POPULAR_FNO_STOCKS]);
    const clearAll = () => setSelectedSymbols([]);

    const addCustom = () => {
        const sym = customSymbol.trim().toUpperCase();
        if (sym && !selectedSymbols.includes(sym)) {
            setSelectedSymbols(prev => [...prev, sym]);
            setCustomSymbol('');
        }
    };

    const fetchFuturesData = async () => {
        if (selectedSymbols.length === 0) return;
        setLoading(true);
        setFetchStatus(null);
        try {
            const data = await kiteAPI.fetchScannerData(selectedSymbols);
            if (data.futures && data.futures.length > 0) {
                // Transform to format expected by the dashboard parsers
                const transformed = data.futures.map(f => ({
                    symbol: f.symbol,
                    date: new Date().toISOString().split('T')[0],
                    close: f.last_price || f.close,
                    open: f.open,
                    high: f.high,
                    low: f.low,
                    oi: f.oi,
                    volume: f.volume,
                    tradingsymbol: f.tradingsymbol,
                    instrument_token: f.instrument_token,
                }));
                onFuturesLoaded?.(transformed);
                setFetchStatus({
                    type: 'success',
                    message: `Loaded ${transformed.length} futures contracts`,
                });
            } else {
                setFetchStatus({ type: 'warning', message: 'No futures data returned' });
            }
        } catch (err) {
            setFetchStatus({ type: 'error', message: err.message });
        }
        setLoading(false);
    };

    const fetchOptionChain = async () => {
        if (!chainSymbol) return;
        setLoadingChain(true);
        setFetchStatus(null);
        try {
            const data = await kiteAPI.getOptionChain(chainSymbol);
            if (data.chain && data.chain.length > 0) {
                // Transform to format expected by the dashboard's options parser
                const transformed = [];
                for (const strike of data.chain) {
                    if (strike.CE) {
                        transformed.push({
                            symbol: data.symbol,
                            expiry: data.expiry,
                            optionType: 'CE',
                            strike: strike.strike,
                            close: strike.CE.last_price,
                            oi: strike.CE.oi,
                            volume: strike.CE.volume,
                            underlyingValue: data.spot_price,
                            tradingsymbol: strike.CE.tradingsymbol,
                        });
                    }
                    if (strike.PE) {
                        transformed.push({
                            symbol: data.symbol,
                            expiry: data.expiry,
                            optionType: 'PE',
                            strike: strike.strike,
                            close: strike.PE.last_price,
                            oi: strike.PE.oi,
                            volume: strike.PE.volume,
                            underlyingValue: data.spot_price,
                            tradingsymbol: strike.PE.tradingsymbol,
                        });
                    }
                }
                onOptionsLoaded?.(transformed);
                setFetchStatus({
                    type: 'success',
                    message: `Loaded ${data.chain.length} strikes for ${data.symbol} (expiry: ${data.expiry})`,
                });
            } else {
                setFetchStatus({ type: 'warning', message: 'No option chain data returned' });
            }
        } catch (err) {
            setFetchStatus({ type: 'error', message: err.message });
        }
        setLoadingChain(false);
    };

    if (!isAuthenticated) {
        return (
            <div className="bg-card p-6 rounded-xl border shadow-sm">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Zap className="size-5" />
                    <div>
                        <h3 className="font-semibold text-foreground">Live Data via Kite Connect</h3>
                        <p className="text-sm">Connect your Kite account above to fetch live FnO data directly from Zerodha.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card p-6 rounded-xl border shadow-sm space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Database className="size-5 text-primary" />
                    <h3 className="font-semibold text-lg">Fetch Live Data from Kite</h3>
                </div>
                <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-primary hover:underline">
                        Select All
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button onClick={clearAll} className="text-xs text-muted-foreground hover:underline">
                        Clear
                    </button>
                </div>
            </div>

            {/* Symbol Selection Grid */}
            <div>
                <p className="text-sm text-muted-foreground mb-3">
                    Select FnO stocks to fetch ({selectedSymbols.length} selected):
                </p>
                <div className="flex flex-wrap gap-2">
                    {POPULAR_FNO_STOCKS.map(sym => (
                        <button
                            key={sym}
                            onClick={() => toggleSymbol(sym)}
                            className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                                selectedSymbols.includes(sym)
                                    ? "bg-primary/20 text-primary border-primary/30"
                                    : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                            )}
                        >
                            {sym}
                        </button>
                    ))}
                </div>

                {/* Custom symbol input */}
                <div className="flex gap-2 mt-3">
                    <input
                        type="text"
                        value={customSymbol}
                        onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && addCustom()}
                        placeholder="Add custom symbol..."
                        className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                    />
                    <button onClick={addCustom} className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-sm">
                        Add
                    </button>
                </div>
            </div>

            {/* Fetch Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Futures Fetch */}
                <div className="bg-muted/30 p-4 rounded-lg border border-dashed">
                    <h4 className="text-sm font-semibold mb-2">Futures Data</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                        Fetches nearest expiry futures quotes for selected symbols.
                    </p>
                    <button
                        onClick={fetchFuturesData}
                        disabled={loading || selectedSymbols.length === 0}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                            loading || selectedSymbols.length === 0
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                    >
                        {loading ? (
                            <><Loader2 className="size-4 animate-spin" /> Fetching...</>
                        ) : (
                            <><Download className="size-4" /> Fetch Futures</>
                        )}
                    </button>
                </div>

                {/* Option Chain Fetch */}
                <div className="bg-muted/30 p-4 rounded-lg border border-dashed">
                    <h4 className="text-sm font-semibold mb-2">Option Chain</h4>
                    <div className="flex gap-2 mb-3">
                        <select
                            value={chainSymbol}
                            onChange={(e) => setChainSymbol(e.target.value)}
                            className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                        >
                            {['NIFTY', 'BANKNIFTY', ...selectedSymbols.filter(s => !['NIFTY', 'BANKNIFTY'].includes(s))].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={fetchOptionChain}
                        disabled={loadingChain}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                            loadingChain
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                        )}
                    >
                        {loadingChain ? (
                            <><Loader2 className="size-4 animate-spin" /> Loading Chain...</>
                        ) : (
                            <><RefreshCw className="size-4" /> Fetch Options</>
                        )}
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {fetchStatus && (
                <div className={cn(
                    "p-3 rounded-lg text-sm",
                    fetchStatus.type === 'success' && "bg-green-500/10 text-green-500",
                    fetchStatus.type === 'warning' && "bg-yellow-500/10 text-yellow-500",
                    fetchStatus.type === 'error' && "bg-red-500/10 text-red-500",
                )}>
                    {fetchStatus.message}
                </div>
            )}
        </div>
    );
};

export default LiveDataPanel;
