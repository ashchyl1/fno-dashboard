import { LOT_SIZES } from '../constants/lot-sizes';

/**
 * MODULE 4 & 5: Strategy Generator & Risk Calculator
 */

export const generateStrategy = (futuresSignal, optionsAnalysis, divergenceSignal, convictionScore) => {
    if (!futuresSignal) return null;

    const symbol = futuresSignal.symbol;
    const lotSize = LOT_SIZES[symbol] || 0; // 0 implies unknown, warn user
    const spotPrice = futuresSignal.close; // Approximate spot with futures close if needed, but better use options spot
    // Note: optionsAnalysis might be null if no CSV loaded for this stock

    const result = {
        symbol,
        signal: futuresSignal.signal, // "LONG BUILD-UP"
        conviction: convictionScore,
        strategy: null,
        reasons: []
    };

    // --- Decision Tree ---
    
    // 1. Bear Put Spread
    // Condition: Short Build-UP + PCR < 0.8 (User said < 0.7) + Discount?
    if (futuresSignal.signal === "SHORT BUILD-UP" && optionsAnalysis && optionsAnalysis.pcrOI < 0.8) {
        result.strategy = constructBearPutSpread(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("Short Build-up detected in Futures");
        result.reasons.push(`PCR at ${optionsAnalysis.pcrOI.toFixed(2)} indicates bearish grip`);
    }
    
    // 2. Bull Call Spread
    // Condition: Long Build-UP + PCR > 1.0 + Premium?
    else if (futuresSignal.signal === "LONG BUILD-UP" && optionsAnalysis && optionsAnalysis.pcrOI > 1.0) {
        result.strategy = constructBullCallSpread(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("Long Build-up detected in Futures");
        result.reasons.push(`PCR at ${optionsAnalysis.pcrOI.toFixed(2)} indicates bullish support`);
    }

    // 3. Futures Short (Aggressive)
    // Condition: SBU + Vol > 2x
    else if (futuresSignal.signal === "SHORT BUILD-UP" && futuresSignal.volumeRatio > 2.0) {
        result.strategy = constructFuturesShort(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("High volume Short Build-up");
    }

    // 4. Futures Long (Aggressive)
    else if (futuresSignal.signal === "LONG BUILD-UP" && futuresSignal.volumeRatio > 2.0) {
        result.strategy = constructFuturesLong(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("High volume Long Build-up");
    }

    // 5. Sideways / Range Bound Strategies
    // Condition: Price change small (< 0.5%) AND PCR neutral (0.8 - 1.2)
    else if (Math.abs(futuresSignal.priceChange) < 0.5 && optionsAnalysis && optionsAnalysis.pcrOI >= 0.8 && optionsAnalysis.pcrOI <= 1.2) {
        // Sub-condition: IV High? (Proxy: ATM Premium sum > 2% of Spot? - simplifying for now)
        // If "Long Unwinding" or "Short Covering" often precedes sideways
        
        // Prefer Iron Condor for safety
        result.strategy = constructIronCondor(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("Market appears range-bound (PCR Neutral, Low Price Change)");
        result.reasons.push("Iron Condor offers defined risk for sideways movement");
    }

    // 6. Short Covering -> Sell Call? (Contra/Mean Reversion or Continuation?)
    // User: "SC + weak volume -> Sell Call (bounce temporary)"
    else if (futuresSignal.signal === "SHORT COVERING" && futuresSignal.volumeRatio < 1.0 && optionsAnalysis) {
        result.strategy = constructSellCall(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("Short Covering on weak volume suggests temporary bounce");
    }

    // 7. Long Unwinding -> Sell Put? (Dip is exhaustion)
    else if (futuresSignal.signal === "LONG UNWINDING" && futuresSignal.volumeRatio < 1.0 && optionsAnalysis) {
        result.strategy = constructSellPut(symbol, spotPrice, optionsAnalysis, lotSize);
        result.reasons.push("Long Unwinding on weak volume suggests dip buying opportunity");
    }

    // Fallback: No specific strategy
    if (!result.strategy) {
        result.strategy = { name: "No Trade / Watch", risk_reward: "-" };
    }

    return result;
};


// --- Construction Helpers ---

const findStrike = (strikes, targetPrice, type, offset = 0) => {
    // Find closest strike to targetPrice, potentially with offset steps
    // offset +1 means 1 strike OTM (for the type)
    const sorted = Object.keys(strikes).map(parseFloat).sort((a,b) => a-b);
    
    // Simple closest
    let closest = sorted.reduce((prev, curr) => Math.abs(curr - targetPrice) < Math.abs(prev - targetPrice) ? curr : prev);
    let index = sorted.indexOf(closest);
    
    // Apply offset
    // For Calls: OTM is higher strike (index + offset)
    // For Puts: OTM is lower strike (index - offset)
    if (type === 'CE') index += offset;
    else index -= offset;

    // Boundary checks
    if (index < 0) index = 0;
    if (index >= sorted.length) index = sorted.length - 1;

    // Return Strike and its Data
    const k = sorted[index];
    return { strike: k, ...strikes[k] };
};

const constructBearPutSpread = (symbol, spot, opt, lotSize) => {
    // Buy ATM Put, Sell OTM Put
    const buy = findStrike(opt.strikes, spot, 'PE', 0); // Near ATM
    const sell = findStrike(opt.strikes, spot, 'PE', 2); // 2 strikes OTM

    // Mock prices if LTP missing (should ideally warn)
    const buyPrice = buy.PE_LTP || 10; 
    const sellPrice = sell.PE_LTP || 5;

    const netDebit = buyPrice - sellPrice;
    const spreadWidth = buy.strike - sell.strike; // Higher strike (Buy) - Lower strike (Sell) for Put Spread? 
    // Wait: Bear Put Spread = Buy Higher Strike Put (ITM/ATM), Sell Lower Strike Put (OTM)
    // Yes. Buy Strike > Sell Strike.
    
    const maxProfit = (spreadWidth - netDebit) * lotSize;
    const maxLoss = netDebit * lotSize;
    const be = buy.strike - netDebit;

    return {
        name: "Bear Put Spread",
        legs: [
            { action: "BUY", instrument: `${buy.strike} PE`, price: buyPrice, qty: lotSize },
            { action: "SELL", instrument: `${sell.strike} PE`, price: sellPrice, qty: lotSize }
        ],
        net_debit: netDebit,
        max_profit: maxProfit,
        max_loss: maxLoss,
        breakeven: be,
        risk_reward: `1:${(maxProfit/maxLoss).toFixed(2)}`
    };
};

const constructBullCallSpread = (symbol, spot, opt, lotSize) => {
    // Buy ATM Call, Sell OTM Call
    const buy = findStrike(opt.strikes, spot, 'CE', 0);
    const sell = findStrike(opt.strikes, spot, 'CE', 2);

    const buyPrice = buy.CE_LTP || 10;
    const sellPrice = sell.CE_LTP || 5;

    const netDebit = buyPrice - sellPrice;
    const spreadWidth = sell.strike - buy.strike; // Sell Strike (Higher) - Buy Strike (Lower)
    
    const maxProfit = (spreadWidth - netDebit) * lotSize;
    const maxLoss = netDebit * lotSize;
    const be = buy.strike + netDebit;

    return {
        name: "Bull Call Spread",
        legs: [
            { action: "BUY", instrument: `${buy.strike} CE`, price: buyPrice, qty: lotSize },
            { action: "SELL", instrument: `${sell.strike} CE`, price: sellPrice, qty: lotSize }
        ],
        net_debit: netDebit,
        max_profit: maxProfit,
        max_loss: maxLoss,
        breakeven: be,
        risk_reward: `1:${(maxProfit/maxLoss).toFixed(2)}`
    };
};

const constructFuturesShort = (symbol, spot, opt, lotSize) => {
    // Risk reward estimates are harder for Futures without explicit SL/Target provided by user logic in real-time
    // But we can use Support levels from Options for Target
    const target = opt ? opt.support : spot * 0.95;
    const sl = opt ? opt.resistance : spot * 1.02;

    const reward = (spot - target) * lotSize;
    const risk = (sl - spot) * lotSize;

    return {
        name: "Short Futures",
        legs: [
            { action: "SELL", instrument: "FUT", price: spot, qty: lotSize }
        ],
        target: target,
        stop_loss: sl,
        risk_reward: `1:${(reward/risk).toFixed(2)}`
    }
};

const constructFuturesLong = (symbol, spot, opt, lotSize) => {
    const target = opt ? opt.resistance : spot * 1.05;
    const sl = opt ? opt.support : spot * 0.98;

    const reward = (target - spot) * lotSize;
    const risk = (spot - sl) * lotSize;

    return {
        name: "Long Futures",
        legs: [
            { action: "BUY", instrument: "FUT", price: spot, qty: lotSize }
        ],
        target: target,
        stop_loss: sl,
        risk_reward: `1:${(reward/risk).toFixed(2)}`
    }
};

const constructSellCall = (symbol, spot, opt, lotSize) => {
    // Sell OTM Call at Resistance
    // Resistance is highest Call OI
    const strike = opt ? opt.resistance : spot; // fallback
    // Find closest actual strike to resistance level
    const k = findStrike(opt.strikes, strike, 'CE', 0);
    const price = k.CE_LTP || 5;
    
    return {
        name: "Sell Call (Credit)",
        legs: [
            { action: "SELL", instrument: `${k.strike} CE`, price: price, qty: lotSize }
        ],
        max_profit: price * lotSize,
        risk_reward: "Undefined (High Risk)"
    }
};

const constructSellPut = (symbol, spot, opt, lotSize) => {
    // Sell OTM Put at Support
    const strike = opt ? opt.support : spot;
    const k = findStrike(opt.strikes, strike, 'PE', 0);
    const price = k.PE_LTP || 5;

    return {
        name: "Sell Put (Credit)",
        legs: [
            { action: "SELL", instrument: `${k.strike} PE`, price: price, qty: lotSize }
        ],
        max_profit: price * lotSize,
        risk_reward: "Undefined (High Risk)"
    }
};

const constructShortStraddle = (symbol, spot, opt, lotSize) => {
    // Sell ATM Call + Sell ATM Put
    // View: Neutral / Low Volatility / IV Crush
    const atmCE = findStrike(opt.strikes, spot, 'CE', 0);
    const atmPE = findStrike(opt.strikes, spot, 'PE', 0);

    const priceCE = atmCE.CE_LTP || 0;
    const pricePE = atmPE.PE_LTP || 0;
    const totalCredit = priceCE + pricePE;

    const maxProfit = totalCredit * lotSize;
    const upperBE = atmCE.strike + totalCredit;
    const lowerBE = atmPE.strike - totalCredit;

    return {
        name: "Short Straddle",
        legs: [
            { action: "SELL", instrument: `${atmCE.strike} CE`, price: priceCE, qty: lotSize },
            { action: "SELL", instrument: `${atmPE.strike} PE`, price: pricePE, qty: lotSize }
        ],
        net_credit: totalCredit,
        max_profit: maxProfit,
        max_loss: "Unlimited",
        breakeven: `${lowerBE.toFixed(2)} - ${upperBE.toFixed(2)}`,
        risk_reward: "Undefined (High Risk)"
    };
};

const constructShortStrangle = (symbol, spot, opt, lotSize) => {
    // Sell OTM Call + Sell OTM Put
    // View: Neutral / Range Bound
    const otmCE = findStrike(opt.strikes, spot, 'CE', 2); // 2 strikes OTM
    const otmPE = findStrike(opt.strikes, spot, 'PE', 2);

    const priceCE = otmCE.CE_LTP || 0;
    const pricePE = otmPE.PE_LTP || 0;
    const totalCredit = priceCE + pricePE;

    const maxProfit = totalCredit * lotSize;
    const upperBE = otmCE.strike + totalCredit;
    const lowerBE = otmPE.strike - totalCredit;

    return {
        name: "Short Strangle",
        legs: [
            { action: "SELL", instrument: `${otmCE.strike} CE`, price: priceCE, qty: lotSize },
            { action: "SELL", instrument: `${otmPE.strike} PE`, price: pricePE, qty: lotSize }
        ],
        net_credit: totalCredit,
        max_profit: maxProfit,
        max_loss: "Unlimited",
        breakeven: `${lowerBE.toFixed(2)} - ${upperBE.toFixed(2)}`,
        risk_reward: "Undefined (High Risk)"
    };
};

const constructIronCondor = (symbol, spot, opt, lotSize) => {
    // Sell OTM Call, Buy Further OTM Call
    // Sell OTM Put, Buy Further OTM Put
    // View: Range Bound with defined risk
    
    // Call Side (Bear Call Spread)
    const sellCE = findStrike(opt.strikes, spot, 'CE', 2);
    const buyCE = findStrike(opt.strikes, spot, 'CE', 4);
    
    // Put Side (Bull Put Spread)
    const sellPE = findStrike(opt.strikes, spot, 'PE', 2);
    const buyPE = findStrike(opt.strikes, spot, 'PE', 4);

    const creditCE = (sellCE.CE_LTP || 0) - (buyCE.CE_LTP || 0);
    const creditPE = (sellPE.PE_LTP || 0) - (buyPE.PE_LTP || 0);
    const netCredit = creditCE + creditPE;

    // Margin protection
    const widthCE = buyCE.strike - sellCE.strike;
    const widthPE = sellPE.strike - buyPE.strike;
    const maxRiskLeg = Math.max(widthCE, widthPE);

    const maxProfit = netCredit * lotSize;
    const maxLoss = (maxRiskLeg - netCredit) * lotSize;
    
    const upperBE = sellCE.strike + netCredit;
    const lowerBE = sellPE.strike - netCredit;

    return {
        name: "Iron Condor",
        legs: [
            { action: "SELL", instrument: `${sellCE.strike} CE`, price: sellCE.CE_LTP, qty: lotSize },
            { action: "BUY", instrument: `${buyCE.strike} CE`, price: buyCE.CE_LTP, qty: lotSize },
            { action: "SELL", instrument: `${sellPE.strike} PE`, price: sellPE.PE_LTP, qty: lotSize },
            { action: "BUY", instrument: `${buyPE.strike} PE`, price: buyPE.PE_LTP, qty: lotSize }
        ],
        net_credit: netCredit,
        max_profit: maxProfit,
        max_loss: maxLoss,
        breakeven: `${lowerBE.toFixed(2)} - ${upperBE.toFixed(2)}`,
        risk_reward: `1:${(maxLoss/maxProfit).toFixed(2)}`
    };
};
