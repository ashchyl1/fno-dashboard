/**
 * MODULE: Conviction Scoring System
 * 
 * Aggregates signals to give a confidence score (0-10).
 * 
 * Weights:
 * - OI Change % (>10% is huge): 25%
 * - Volume Surge (>2x avg): 20%
 * - Trend Streak (3+ days): 20%
 * - Price Move (>3%): 15%
 * - Options Alignment (PCR confirm): 20%
 */

export const scoreConviction = (futuresSignal, optionsSignal) => {
    let score = 0;

    // 1. OI Change Magnitude (Max 2.5 pts)
    const oiAbs = Math.abs(futuresSignal.oiChangePct);
    if (oiAbs > 10) score += 2.5;
    else if (oiAbs > 5) score += 1.5;
    else if (oiAbs > 2) score += 1.0;

    // 2. Volume Surge (Max 2.0 pts)
    const volRatio = futuresSignal.volumeRatio;
    if (volRatio > 2.0) score += 2.0;
    else if (volRatio > 1.5) score += 1.5;
    else if (volRatio > 1.1) score += 0.5;

    // 3. Streak (Max 2.0 pts)
    const streak = futuresSignal.streak;
    if (streak >= 3) score += 2.0;
    else if (streak === 2) score += 1.0;
    else if (streak === 1) score += 0.5;

    // 4. Price Move (Max 1.5 pts)
    const priceAbs = Math.abs(futuresSignal.priceChangePct);
    if (priceAbs > 3) score += 1.5;
    else if (priceAbs > 1.5) score += 1.0;
    else if (priceAbs > 0.5) score += 0.5;

    // 5. Options Alignment (Max 2.0 pts)
    if (optionsSignal) {
        // If Futures says LONG/SHORT and PCR agrees
        const bias = futuresSignal.signal; // "LONG BUILD-UP" etc
        const pcr = optionsSignal.pcrOI;

        const isBullish = bias.includes("LONG") || bias.includes("SHORT COVERING");
        const isBearish = bias.includes("SHORT") || bias.includes("LONG UNWINDING");

        if (isBullish) {
            if (pcr < 0.8) score += 2.0; // Call heavy, wait? Actually PCR < 0.6 is bullish? 
            // NOTE: PCR interpretation varies. 
            // PCR < 1 usually means Put Volume < Call Volume -> People buying Calls? 
            // OR People selling Calls? 
            // Standard Nifty theory: PCR > 1.2 Overbought (Bearish), PCR < 0.5 Oversold (Bullish/Reversal).
            // But generally High PCR = Bullish (Put Writers active), Low PCR = Bearish (Call Writers active).
            // Let's stick to the user's prompt interpretation:
            // PCR > 1.2 -> Bearish OR Contrarian Bullish (Put Writing) -> User says "Put writing" which is bullish support.
            
            // User Prompt:
            // PCR > 1.2 -> Heavily bearish OR contrarian bullish (put writing) ??? 
            // PCR < 0.8 -> Bullish (call-dominated) 
            
            // Let's stick to standard OI interpretation:
            // High Put OI = Support (Bullish). So High PCR (More Puts) = Bullish.
            // High Call OI = Resistance (Bearish). So Low PCR (More Calls) = Bearish.
            
            // WAIT, User Prompt says:
            // "PCR < 0.8 -> Bullish (call-dominated)"
            // "PCR > 1.2 -> Heavily bearish"
            // This contradicts standard Put Writing theory but aligns with "Call Buying" theory.
            // Usage: "Alignment with options PCR | 20% | Both bearish/bullish = High"
            
            // Let's use the USER'S DEFINITION specifically to match their mental model.
            // User: PCR < 0.8 Bullish. PCR > 1.2 Bearish.
            
            if (pcr < 0.8) score += 2.0;
            else if (pcr < 1.0) score += 1.0;
        } else if (isBearish) {
            if (pcr > 1.2) score += 2.0;
            else if (pcr > 1.0) score += 1.0;
        }
    } else {
        // Neutral if no options data, give half points
        score += 1.0;
    }

    return Math.min(10, parseFloat(score.toFixed(1))); // Cap at 10
};
