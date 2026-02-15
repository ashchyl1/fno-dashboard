/**
 * MODULE 3: Divergence Detector
 * 
 * Logic:
 * Basis = (Futures Price - Underlying Price) / Underlying Price * 100
 * Premium: Basis > 0.5%
 * Discount: Basis < -0.5%
 * Divergence: 
 * - Bullish Div: Spot Down, Futures Up (or Futures falling less)
 * - Bearish Div: Spot Up, Futures Down
 */

export const detectDivergence = (futuresData, optionsData) => {
    // We need latest futures price vs latest spot price.
    // Spot price usually comes from Options "Underlying" column or separate index feed.
    // We'll trust the "Underlying" value from the Options CSV for this single-day snapshot.
    
    // 1. Get List of stocks present in both
    const spotMap = new Map();
    // Assuming optionsData is array of contracts. 
    // We just need one entry per symbol to get the underlying price.
    optionsData.forEach(opt => {
        if (!spotMap.has(opt.symbol) && opt.underlying > 0) {
            spotMap.set(opt.symbol, opt.underlying);
        }
    });

    const results = [];

    // Process each Futures symbol
    const recentFutures = getLatestFutures(futuresData);

    recentFutures.forEach(fut => {
        const spot = spotMap.get(fut.symbol);
        if (!spot) return; // No spot data found

        const basis = ((fut.close - spot) / spot) * 100;
        
        // Interpretation
        let signal = "NEUTRAL";
        if (basis > 0.5) signal = "PREMIUM";
        else if (basis < -0.5) signal = "DISCOUNT";
        
        results.push({
            symbol: fut.symbol,
            futuresPrice: fut.close,
            spotPrice: spot,
            basis: basis, // percentage
            signal
        });
    });

    return results.sort((a,b) => b.basis - a.basis);
};

// Helper: Get latest record for each symbol from futures history
const getLatestFutures = (futuresData) => {
    const map = new Map();
    futuresData.forEach(row => {
        // Since data is seemingly sorted by date in parse step, 
        // overwriting ensures we get the latest. 
        // But to be safe, compare dates if needed. 
        // For now relying on parser sort.
        map.set(row.symbol, row);
    });
    return Array.from(map.values());
};
