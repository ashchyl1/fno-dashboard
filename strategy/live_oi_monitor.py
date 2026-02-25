import os
import json
import datetime
import time
from logger import logger

class LiveOIMonitor:
    """
    Live OI Monitor Strategy
    Fetches NIFTY and Option OI data across multiple timeframes.
    """

    def __init__(self, broker, config):
        self.broker = broker
        self.index_symbol = config.get('index_symbol', 'NSE:NIFTY 50')
        self.symbol_initials = config.get('symbol_initials', 'NIFTY')
        self.strike_step = config.get('strike_step', 50)

        # Following Survivor pattern for instruments
        self.broker.download_instruments()
        self.instruments = self.broker.get_instruments()
        self.instruments = self.instruments[self.instruments['symbol'].str.contains(self.symbol_initials)]

    def get_historical_data(self, instrument_token, minutes_ago, is_oi=True):
        """
        Fetches historical data for a specific point in time.
        """
        to_date = datetime.datetime.now()
        from_date = to_date - datetime.timedelta(minutes=minutes_ago + 2)

        # Assuming broker.kite is the KiteConnect instance
        # or broker has a historical_data method.
        # Given Survivor's pattern, if it's not in broker, we might need to use broker.kite.
        try:
            kite = self.broker.kite
            records = kite.historical_data(instrument_token, from_date, to_date, "minute", oi=True)
            if records:
                # Returns the oldest record in the window which is closest to our target
                return records[0]['oi'] if is_oi else records[0]['close']
        except Exception as e:
            logger.error(f"Failed to fetch historical data for {instrument_token}: {e}")
        return None

    def fetch_and_save(self):
        try:
            # 1. Get current NIFTY price
            nifty_quote = self.broker.get_quote(self.index_symbol)
            nifty_ltp = nifty_quote.last_price

            # 2. Determine 7 strikes around ATM
            atm_strike = round(nifty_ltp / self.strike_step) * self.strike_step
            strikes = [atm_strike + (i * self.strike_step) for i in range(-3, 4)]

            timeframes = {
                "3m": 3, "5m": 5, "10m": 10, "15m": 15, "30m": 30, "3h": 180
            }

            data = {
                "nifty": {"current": nifty_ltp},
                "calls": [],
                "puts": [],
                "timestamp": datetime.datetime.now().isoformat()
            }

            # Fetch NIFTY historical prices
            # We need NIFTY instrument token.
            # Assuming it can be found in instruments or via another method.
            # For NIFTY 50 index, token is usually fixed but better find it.
            nifty_instr = self.instruments[self.instruments['tradingsymbol'] == 'NIFTY 50']
            if not nifty_instr.empty:
                nifty_token = nifty_instr.iloc[0]['instrument_token']
                for label, mins in timeframes.items():
                    data["nifty"][label] = self.get_historical_data(nifty_token, mins, is_oi=False)

            # Fetch Option Data
            for strike in strikes:
                for opt_type in ["CE", "PE"]:
                    # Find instrument for this strike and type
                    # This logic should match Survivor's _find_nifty_symbol_from_gap pattern
                    instr_row = self.instruments[
                        (self.instruments['strike'] == strike) &
                        (self.instruments['instrument_type'] == opt_type) &
                        (self.instruments['segment'] == "NFO-OPT")
                    ]

                    if instr_row.empty:
                        continue

                    instr = instr_row.iloc[0]
                    symbol_code = f"NFO:{instr['tradingsymbol']}"
                    quote = self.broker.get_quote(symbol_code)

                    item = {
                        "strike": strike,
                        "current": quote.oi,
                    }

                    for label, mins in timeframes.items():
                        item[label] = self.get_historical_data(instr['instrument_token'], mins, is_oi=True)

                    if opt_type == "CE":
                        data["calls"].append(item)
                    else:
                        data["puts"].append(item)

            # Save to live_data.json
            with open("live_data.json", "w") as f:
                json.dump(data, f, indent=2)

            logger.info(f"Live OI Data updated at {data['timestamp']}")
            return True

        except Exception as e:
            logger.error(f"Error in fetch_and_save: {e}")
            return False

if __name__ == "__main__":
    # This would be run similarly to survivor.py
    import os
    from brokers import BrokerGateway

    # Mock config for standalone run
    config = {
        'index_symbol': 'NSE:NIFTY 50',
        'symbol_initials': 'NIFTY',
        'strike_step': 50
    }

    broker = BrokerGateway.from_name(os.getenv("BROKER_NAME", "ZERODHA"))
    monitor = LiveOIMonitor(broker, config)

    while True:
        monitor.fetch_and_save()
        time.sleep(60) # Update every minute
