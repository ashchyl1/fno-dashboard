/**
 * MODULE 2: Options Chain Analyzer
 * 
 * Inputs: Array of option contracts for a SPECIFIC symbol.
 */

export const analyzeOptionChain = (optionsData, spotPrice) => {
    if (!optionsData || optionsData.length === 0) return null;

    // Filter by Expiry if needed? 
    // Usually "Snapshot" csv is for one expiry or we need to group by expiry.
    // Assuming the user wants the "Near" expiry or the CSV is already filtered/sorted.
    // Let's Group by Expiry first and take the nearest one with significant OI.
    
    const expiryGroups = optionsData.reduce((acc, row) => {
        if(!acc[row.expiry]) acc[row.expiry] = [];
        acc[row.expiry].push(row);
        return acc;
    }, {});

    // Sort expires and pick nearest
    // Date parsing helper needed for strict sorting, but let's assume keys are sortable or user picks.
    // For MVP, we'll take the expiry with the HIGHEST TOTAL OI (most active).
    
    const activeExpiry = Object.keys(expiryGroups).reduce((a, b) => {
        const sumOI_a = expiryGroups[a].reduce((sum, r) => sum + r.oi, 0);
        const sumOI_b = expiryGroups[b].reduce((sum, r) => sum + r.oi, 0);
        return sumOI_a > sumOI_b ? a : b;
    });

    const chain = expiryGroups[activeExpiry];
    
    // --- calculations ---
    
    let totalCE_OI = 0;
    let totalPE_OI = 0;
    let totalCE_Vol = 0;
    let totalPE_Vol = 0;
    
    const strikes = {};

    chain.forEach(opt => {
        if (opt.type === 'CE') {
            totalCE_OI += opt.oi;
            totalCE_Vol += opt.volume;
        } else {
            totalPE_OI += opt.oi;
            totalPE_Vol += opt.volume;
        }
        
        if (!strikes[opt.strike]) strikes[opt.strike] = { CE_OI: 0, PE_OI: 0, CE_LTP: 0, PE_LTP: 0 };
        
        if (opt.type === 'CE') {
            strikes[opt.strike].CE_OI = opt.oi;
            strikes[opt.strike].CE_LTP = opt.close;
        } else {
            strikes[opt.strike].PE_OI = opt.oi;
            strikes[opt.strike].PE_LTP = opt.close;
        }
    });

    const pcrOI = totalCE_OI > 0 ? totalPE_OI / totalCE_OI : 0;
    const pcrVol = totalCE_Vol > 0 ? totalPE_Vol / totalCE_Vol : 0;

    // --- IV Proxy (ATM Straddle % of Spot) ---
    // A quick heuristic for "Implied Volatility" level without Black-Scholes
    // IV ~ ATM Straddle Price / (0.8 * Spot) * sqrt(365/DaysToExpiry) ... roughly.
    // We will just use "ATM Straddle %" as a raw "Cost of Options" metric.
    
    // Find ATM Strike
    const sortedStrikes = Object.keys(strikes).map(parseFloat).sort((a,b)=>a-b);
    const atmStrike = sortedStrikes.reduce((prev, curr) => Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev);
    
    const atmCE = strikes[atmStrike].CE_LTP || 0;
    const atmPE = strikes[atmStrike].PE_LTP || 0;
    const atmStraddlePrice = atmCE + atmPE;
    const atmIvProxy = (atmStraddlePrice / spotPrice) * 100; // % of spot

    // --- Max Pain ---
    let minPain = Infinity;
    let maxPainStrike = 0;

    // Lot size is irrelevant for relative comparison of Pain, but strictly: Pain = Σ |Spot - Strike| * OI
    // Call Pain (Spot > Strike): (Spot - Strike) * OI
    // Put Pain (Spot < Strike): (Strike - Spot) * OI
    
    sortedStrikes.forEach(testStrike => {
        let totalPain = 0;
        sortedStrikes.forEach(s => {
            const data = strikes[s];
            // If expiry is at testStrike:
            // Calls at K < testStrike are ITM. Intrinsic = testStrike - K
            if (s < testStrike) {
                totalPain += (testStrike - s) * data.CE_OI;
            }
            // Puts at K > testStrike are ITM. Intrinsic = K - testStrike
            if (s > testStrike) {
                totalPain += (s - testStrike) * data.PE_OI;
            }
        });

        if (totalPain < minPain) {
            minPain = totalPain;
            maxPainStrike = testStrike;
        }
    });

    // --- Support & Resistance ---
    // Resistance: Highest Call OI
    // Support: Highest Put OI
    // (Improved: Find highest OI *around* spot price to avoid deep OTM anomalies)
    
    let maxCE_OI = 0;
    let resistanceStrike = 0;
    let maxPE_OI = 0;
    let supportStrike = 0;

    sortedStrikes.forEach(s => {
        if (strikes[s].CE_OI > maxCE_OI) {
            maxCE_OI = strikes[s].CE_OI;
            resistanceStrike = s;
        }
        if (strikes[s].PE_OI > maxPE_OI) {
            maxPE_OI = strikes[s].PE_OI;
            supportStrike = s;
        }
    });

    return {
        expiry: activeExpiry,
        pcrOI,
        pcrVol,
        atmIvProxy, // New Metric
        maxPain: maxPainStrike,
        support: supportStrike,
        resistance: resistanceStrike,
        strikes, // Map of strike -> { CE_OI, PE_OI... } for Heatmap
        totalOI: { CE: totalCE_OI, PE: totalPE_OI }
    };
};
