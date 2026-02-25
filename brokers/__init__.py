from kiteconnect import KiteConnect

class BrokerGateway:
    @staticmethod
    def from_name(name):
        return ZerodhaBroker()

class ZerodhaBroker:
    def __init__(self):
        self.kite = None # Will be initialized by user

    def download_instruments(self):
        pass

    def get_instruments(self):
        import pandas as pd
        return pd.DataFrame() # Mock

    def get_quote(self, symbol):
        class Quote:
            def __init__(self):
                self.last_price = 24400
                self.oi = 100000
        return Quote()
