export const generateMockLiveData = () => {
    const niftyCurrent = 24350 + Math.random() * 100;
    const atmStrike = Math.round(niftyCurrent / 50) * 50;
    const strikes = [atmStrike - 150, atmStrike - 100, atmStrike - 50, atmStrike, atmStrike + 50, atmStrike + 100, atmStrike + 150];

    const generateStrikesData = (isCall) => {
        return strikes.map(strike => {
            const currentOI = Math.floor(Math.random() * 100000) + 50000;
            return {
                strike,
                current: currentOI,
                '3m': currentOI * (1 - (Math.random() * 0.15)), // Might trigger 10%
                '5m': currentOI * (1 - (Math.random() * 0.20)), // Might trigger 12%
                '10m': currentOI * (1 - (Math.random() * 0.25)), // Might trigger 15%
                '15m': currentOI * (1 - (Math.random() * 0.40)), // Might trigger 30%
                '30m': currentOI * (1 - (Math.random() * 0.50)), // Might trigger 30%
                '3h': currentOI * (1 - (Math.random() * 0.60)), // 100% is hard to trigger with 0.6
            };
        });
    };

    // Force some red cells to test alerts
    const calls = generateStrikesData(true);
    if (Math.random() > 0.7) {
        calls.forEach(c => {
            c['3m'] = c.current * 0.8; // 25% change
        });
    }

    return {
        nifty: {
            current: niftyCurrent,
            '3m': niftyCurrent - 10,
            '5m': niftyCurrent - 15,
            '10m': niftyCurrent - 20,
            '15m': niftyCurrent - 30,
            '30m': niftyCurrent - 50,
            '3h': niftyCurrent - 200,
        },
        calls: calls,
        puts: generateStrikesData(false),
        timestamp: new Date().toISOString()
    };
};
