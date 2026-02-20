import { useState, useRef } from 'react';
import { LayoutDashboard, FileText, BarChart3, TrendingUp, Settings } from 'lucide-react';
import { cn } from './lib/utils';
import MarketScanner from './components/dashboard/MarketScanner';
import StockDeepDive from './components/dashboard/StockDeepDive';
import DivergenceMap from './components/dashboard/DivergenceMap';
import KiteLogin from './components/dashboard/KiteLogin';

function App() {
  const [activeTab, setActiveTab] = useState('scanner');
  const [selectedStock, setSelectedStock] = useState(null);
  
  // We need to lift state up from MarketScanner if we want to share data across tabs 
  // OR we can keep MarketScanner as the "Data Owner" and pass setters? 
  // Better: Lift state.
  const [futuresData, setFuturesData] = useState([]);
  const [optionsData, setOptionsData] = useState([]);
  const [kiteAuth, setKiteAuth] = useState(null);

  // Data handlers
  const scannerRef = useRef(null);

  // We need to modify MarketScanner to accept data props instead of internal state
  // But for now, let's keep it simple. 
  // Actually, MarketScanner's state is local. If we switch tabs, we lose data.
  // We MUST lift state to App.jsx.
  // I will refactor MarketScanner to accept `futuresData` and `optionsData` as props.
  // But wait, MarketScanner HAS the uploaders. 
  // Let's make MarketScanner handle the UI for upload, but bubble data up.

  const handleStockSelect = (stock) => {
    setSelectedStock(stock);
    setActiveTab('deep-dive');
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              F&O Strategy Dashboard
            </h1>
          </div>
          <KiteLogin onAuthChange={setKiteAuth} />
          <nav className="flex items-center gap-1">
            <button
                onClick={() => setActiveTab('scanner')}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                  activeTab === 'scanner' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
            >
                <LayoutDashboard className="size-4" /> Scanner
            </button>
            <button
                onClick={() => setActiveTab('deep-dive')}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                  activeTab === 'deep-dive' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
            >
                <FileText className="size-4" /> Deep Dive
            </button>
            <button
                onClick={() => setActiveTab('divergence')}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                  activeTab === 'divergence' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
            >
                <BarChart3 className="size-4" /> Divergence
            </button>
          </nav>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        
        {/* We keep MarketScanner mounted or pass data? 
            If we unmount, we lose state. 
            So we should modify MarketScanner to use the App's state. 
            I'll use a wrapper approach or prop drilling.
        */}

        {activeTab === 'scanner' && (
             <MarketScannerWrapper
                onSelectStock={handleStockSelect}
                futuresData={futuresData}
                setFuturesData={setFuturesData}
                optionsData={optionsData}
                setOptionsData={setOptionsData}
                isAuthenticated={!!kiteAuth}
             />
        )}

        {activeTab === 'deep-dive' && (
            <StockDeepDive 
                stockData={selectedStock} 
                onBack={() => setActiveTab('scanner')}
                futuresHistory={futuresData}
                optionsRaw={optionsData}
            />
        )}

        {activeTab === 'divergence' && (
            <div className="space-y-6">
                <h2 className="text-2xl font-bold">Divergence Analysis</h2>
                <DivergenceMap 
                    futuresData={futuresData} 
                    optionsData={optionsData} 
                    onSelectStock={(symbol) => {
                        // We need to find the full stock object. 
                        // This is tricky without the full analysis list available here.
                        // Ideally DivergenceMap should just return symbol, and we find it.
                        // But we don't have the "Analysis Results" here in App.
                        // We only have raw data.
                        // We'll just switch tabs for now, Deep Dive might be null.
                        alert("Select stock from scanner to view details.");
                        setActiveTab('scanner');
                    }}
                />
            </div>
        )}

      </main>
    </div>
  );
}

// Temporary Wrapper to adapt the existing MarketScanner to Props
// I need to update MarketScanner.jsx to accept props instead of local state.
// But since I can't edit two files in one step cleanly without potential overwrites if I messed up.
// I will just update MarketScanner.jsx in the next step to accept props.
// For now, I will rename the import in App.jsx to real component and Pass props.

import MarketScannerComponent from './components/dashboard/MarketScanner';

const MarketScannerWrapper = ({ onSelectStock, futuresData, setFuturesData, optionsData, setOptionsData, isAuthenticated }) => {
    return <MarketScannerComponent
        onSelectStock={onSelectStock}
        externalFuturesData={futuresData}
        setExternalFuturesData={setFuturesData}
        externalOptionsData={optionsData}
        setExternalOptionsData={setOptionsData}
        isAuthenticated={isAuthenticated}
    />
};

export default App;
