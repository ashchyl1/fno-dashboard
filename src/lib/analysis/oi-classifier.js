/**
 * MODULE 1: Futures OI Classifier
 * 
 * Logic:
 * Price Up + OI Up   -> Long Build-up (LBU)
 * Price Down + OI Up -> Short Build-up (SBU)
 * Price Down + OI Down -> Long Unwinding (LU)
 * Price Up + OI Down -> Short Covering (SC)
 */

export const classifyOI = (mergedFuturesData) => {
  // map: symbol -> array of daily records (sorted by date)
  const stockMap = groupBySymbol(mergedFuturesData);
  const results = [];

  Object.entries(stockMap).forEach(([symbol, days]) => {
    // Need at least 2 days to compare
    if (days.length < 2) return;

    const today = days[days.length - 1];
    const prev = days[days.length - 2];

    const priceChange = today.close - prev.close;
    const priceChangePct = (priceChange / prev.close) * 100;
    
    const oiChange = today.oi - prev.oi;
    const oiChangePct = (oiChange / prev.oi) * 100;

    let signal = "NEUTRAL";

    if (priceChange > 0 && oiChange > 0) signal = "LONG BUILD-UP";
    else if (priceChange < 0 && oiChange > 0) signal = "SHORT BUILD-UP";
    else if (priceChange < 0 && oiChange < 0) signal = "LONG UNWINDING";
    else if (priceChange > 0 && oiChange < 0) signal = "SHORT COVERING";

    // Streak Analysis
    // Look back to find consecutive days of the SAME signal (simplified logic)
    // We would need to compute signal for every day to do this accurately.
    // For now, let's just compute the signal for the last few days to find streak.
    const streak = calculateStreak(days, signal);

    // Volume Ratio vs 5-day Avg
    const volAvg = calculateAvgVolume(days, 5);
    const volumeRatio = volAvg > 0 ? (today.volume / volAvg) : 1;

    results.push({
      symbol,
      date: today.date,
      close: today.close,
      oi: today.oi,
      signal,
      priceChangePct,
      oiChangePct,
      volumeRatio,
      streak
    });
  });

  return results.sort((a, b) => b.oiChangePct - a.oiChangePct); // Default sort by OI surge
};

// --- Helpers ---

const groupBySymbol = (data) => {
  return data.reduce((acc, row) => {
    if (!acc[row.symbol]) acc[row.symbol] = [];
    acc[row.symbol].push(row);
    return acc;
  }, {});
};

const calculateStreak = (days, currentSignal) => {
    let streak = 1;
    // Start from yesterday (index length-2) and go back
    for (let i = days.length - 2; i > 0; i--) {
        const curr = days[i];
        const prev = days[i - 1];
        
        const priceChange = curr.close - prev.close;
        const oiChange = curr.oi - prev.oi;
        
        let dailySignal = "NEUTRAL";
        if (priceChange > 0 && oiChange > 0) dailySignal = "LONG BUILD-UP";
        else if (priceChange < 0 && oiChange > 0) dailySignal = "SHORT BUILD-UP";
        else if (priceChange < 0 && oiChange < 0) dailySignal = "LONG UNWINDING";
        else if (priceChange > 0 && oiChange < 0) dailySignal = "SHORT COVERING";
        
        if (dailySignal === currentSignal) {
            streak++;
        } else {
            break; 
        }
    }
    return streak;
};

const calculateAvgVolume = (days, period) => {
    if (days.length < period + 1) return days[0].volume; // value check
    
    let sum = 0;
    // Calculate avg of the *previous* 5 days (excluding today) to compare against today
    const start = Math.max(0, days.length - 1 - period);
    const end = days.length - 1;
    let count = 0;
    
    for(let i=start; i<end; i++) {
        sum += days[i].volume;
        count++;
    }
    
    return count > 0 ? sum / count : 0;
}
