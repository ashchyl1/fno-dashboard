import { parse, format } from 'date-fns';

/**
 * Normalizes Futures Data
 * - Filters for 'FUTSTK' (Future Stock) or 'FUTIDX' if needed (user focus seems to be stocks)
 * - Extracts only the latest record per day per symbol (End of Day)
 * - Sorts by date
 */
export const parseFuturesData = (rawData) => {
  const processed = {};

  rawData.forEach(row => {
    // Expected Columns: Symbol/Asset Name, Date, Time, CLOSE_PRIC, OI_NO_CON, TRADED_QUA
    // We need to adapt based on actual CSV headers. 
    // Assuming standard NSE dump format or similar.
    
    // Auto-detect column names if they vary slightly
    const symbol = row['Symbol'] || row['Asset Name'] || row['SYMBOL'];
    const dateStr = row['Date'] || row['DATE'];
    const timeStr = row['Time'] || row['TIME'] || '15:30:00'; // Default to EOD if missing
    const close = parseFloat(row['Close'] || row['CLOSE'] || row['CLOSE_PRIC']);
    const oi = parseFloat(row['Open Interest'] || row['OI'] || row['OI_NO_CON']);
    const volume = parseFloat(row['Volume'] || row['TRADED_QUA']);

    if (!symbol || !dateStr || isNaN(close)) return;

    const key = `${symbol}-${dateStr}`;
    
    // We want the LATEST entry for the day.
    // Simple string comparison for HH:MM:SS works for ISO-like times.
    if (!processed[key] || timeStr > processed[key].time) {
      processed[key] = {
        symbol,
        date: dateStr, // Keep string for now, or parse to Date obj
        time: timeStr,
        close,
        oi: oi || 0,
        volume: volume || 0,
      };
    }
  });

  return Object.values(processed).sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.date) - new Date(b.date);
  });
};

/**
 * Parses Options Chain Data
 * - Expects single-day snapshot
 * - Parses Contract Descriptor (e.g. OPTSTKHINDALCO24-FEB-2026CE970)
 */
export const parseOptionsData = (rawData) => {
    const contracts = [];
    
    // Regex for: OPTSTK + SYMBOL + EXPIRY + CE/PE + STRIKE
    // Example: OPTSTKHINDALCO24-FEB-2026CE970
    // Note: Symbols vary in length. Strict regex might fail if symbol has numbers.
    // Better approach: Since we have the raw string, we can try to extract known parts.
    
    // Improved Regex approach:
    // OPTSTK (Type)
    // (.+) (Symbol - greedy)
    // (\d{2}-[A-Z]{3}-\d{4}) (Expiry: 24-FEB-2026)
    // (CE|PE) (Type)
    // (\d+(?:\.\d+)?) (Strike - supports decimals)
    const regex = /OPT(STK|IDX)(.+?)(\d{2}-[A-Za-z]{3}-\d{4})(CE|PE)(\d+(?:\.\d+)?)/;

    rawData.forEach(row => {
        const descriptor = row['Contract Descriptor'] || row['CONTRACT_D'] || row['Symbol'];
        if (!descriptor) return;

        const match = descriptor.match(regex);
        let symbol, expiry, type, strike;

        if (match) {
            symbol = match[2];
            expiry = match[3];
            type = match[4];
            strike = parseFloat(match[5]);
        } else {
            // Fallback: If columns exist separately (some CSVs have them)
            symbol = row['Symbol'] || row['SYMBOL'];
            expiry = row['Expiry'] || row['EXPIRY_DT'];
            type = row['Option Type'] || row['OPTION_TYP']; // CE/PE
            strike = parseFloat(row['Strike Price'] || row['STRIKE_PR']);
        }

        if (!symbol || !strike) return; // Skip if invalid

        contracts.push({
            symbol,
            expiry,
            type, // CE or PE
            strike,
            close: parseFloat(row['Close'] || row['CLOSE_PRIC'] || 0),
            oi: parseFloat(row['Open Interest'] || row['OI_NO_CON'] || 0),
            volume: parseFloat(row['Volume'] || row['TRADED_QUA'] || 0),
            underlying: parseFloat(row['Underlying'] || row['UNDRLNG_ST'] || 0),
        });
    });

    return contracts;
};
