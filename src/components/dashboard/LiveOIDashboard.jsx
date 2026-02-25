import React, { useState, useEffect } from 'react';
import { AlertCircle, Volume2, VolumeX } from 'lucide-react';
import { generateMockLiveData } from '../../lib/mockLiveDataProvider';

const LiveOIDashboard = () => {
  const [data, setData] = useState(null);
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const audioContextRef = React.useRef(null);

  // Timeframes and strikes as per requirements
  const timeframes = ['current', '3m', '5m', '10m', '15m', '30m', '3h'];

  const getThreshold = (timeframe) => {
    switch (timeframe) {
      case '3m': return 10;
      case '5m': return 12;
      case '10m': return 15;
      case '15m': return 30;
      case '30m': return 30;
      case '3h': return 100;
      default: return Infinity;
    }
  };

  const isHighChange = (percentChange, timeframe) => {
    if (timeframe === 'current') return false;
    return Math.abs(percentChange) >= getThreshold(timeframe);
  };

  const formatCell = (currentVal, pastVal, timeframe, isOI = true) => {
    if (timeframe === 'current') {
        return <div className="text-center font-bold">{currentVal.toLocaleString()}</div>;
    }
    if (!pastVal) return <div className="text-center text-muted-foreground">-</div>;

    const diff = currentVal - pastVal;
    const percentChange = (diff / pastVal) * 100;
    const highChange = isOI && isHighChange(percentChange, timeframe);

    return (
      <div className={cn(
        "text-center p-2 rounded-sm transition-colors",
        highChange ? "bg-red-600 text-white font-bold" : ""
      )}>
        <div>{percentChange.toFixed(2)}%</div>
        <div className="text-xs opacity-80">({diff > 0 ? '+' : ''}{diff.toLocaleString()})</div>
      </div>
    );
  };

  const cn = (...classes) => classes.filter(Boolean).join(' ');

  const playAlertSound = () => {
    if (!isAlertEnabled) return;

    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Failed to play alert sound", e);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
        try {
            const response = await fetch('./live_data.json');
            if (response.ok) {
                const jsonData = await response.json();
                setData(jsonData);
            } else {
                // Fallback to mock data if file not found
                setData(generateMockLiveData());
            }
        } catch (error) {
            console.error("Failed to fetch live data, using mock", error);
            setData(generateMockLiveData());
        }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data) return;

    const checkAlerts = () => {
        const tables = [data.calls, data.puts];
        let triggered = false;

        tables.forEach(tableData => {
            let totalCells = 0;
            let redCells = 0;

            tableData.forEach(row => {
                timeframes.forEach(tf => {
                    if (tf === 'current') return;
                    totalCells++;
                    const pastVal = row[tf];
                    if (pastVal) {
                        const percentChange = ((row.current - pastVal) / pastVal) * 100;
                        if (isHighChange(percentChange, tf)) {
                            redCells++;
                        }
                    }
                });
            });

            if (totalCells > 0 && (redCells / totalCells) > 0.3) {
                triggered = true;
            }
        });

        if (triggered) {
            playAlertSound();
        }
    };

    checkAlerts();
  }, [data, isAlertEnabled]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Live NIFTY OI Dashboard</h2>
        <div className="flex items-center gap-4">
            <button
                onClick={() => setIsAlertEnabled(!isAlertEnabled)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                title={isAlertEnabled ? "Disable Alert Sound" : "Enable Alert Sound"}
            >
                {isAlertEnabled ? <Volume2 className="size-5 text-primary" /> : <VolumeX className="size-5 text-muted-foreground" />}
            </button>
            <div className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
            </div>
        </div>
      </div>

      {/* NIFTY Price Table */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold">NIFTY Table</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 font-medium">Metric</th>
                {timeframes.map(tf => (
                  <th key={tf} className="p-3 font-medium text-center">{tf === 'current' ? 'Current Price' : tf}</th>
                ))}
              </tr>
            </thead>
            <tbody>
                <tr className="border-t border-border">
                    <td className="p-3 font-medium">NIFTY 50</td>
                    {timeframes.map(tf => (
                        <td key={tf} className="p-0">
                            {data ? formatCell(data.nifty.current, data.nifty[tf], tf, false) : '-'}
                        </td>
                    ))}
                </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Call OI Table */}
        <section className="space-y-4">
          <h3 className="text-xl font-semibold text-red-400">Call OI Table</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 font-medium">Strike</th>
                  {timeframes.map(tf => (
                    <th key={tf} className="p-3 font-medium text-center">{tf === 'current' ? 'Current OI' : tf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                  {data?.calls.map((strikeData, i) => (
                    <tr key={strikeData.strike} className="border-t border-border hover:bg-muted/30">
                        <td className="p-3 font-medium">{strikeData.strike}</td>
                        {timeframes.map(tf => (
                            <td key={tf} className="p-0">
                                {formatCell(strikeData.current, strikeData[tf], tf, true)}
                            </td>
                        ))}
                    </tr>
                  )) || [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-t border-border">
                        <td className="p-3 text-center" colSpan={8}>Loading...</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Put OI Table */}
        <section className="space-y-4">
          <h3 className="text-xl font-semibold text-green-400">Put OI Table</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 font-medium">Strike</th>
                  {timeframes.map(tf => (
                    <th key={tf} className="p-3 font-medium text-center">{tf === 'current' ? 'Current OI' : tf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                  {data?.puts.map((strikeData, i) => (
                    <tr key={strikeData.strike} className="border-t border-border hover:bg-muted/30">
                        <td className="p-3 font-medium">{strikeData.strike}</td>
                        {timeframes.map(tf => (
                            <td key={tf} className="p-0">
                                {formatCell(strikeData.current, strikeData[tf], tf, true)}
                            </td>
                        ))}
                    </tr>
                  )) || [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-t border-border">
                        <td className="p-3 text-center" colSpan={8}>Loading...</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LiveOIDashboard;
