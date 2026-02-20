"""
FnO Dashboard - Flask Backend
Integrates with Zerodha Kite Connect API for:
- OAuth login flow
- Fetching instruments, quotes, historical data
- Option chain data
- Live WebSocket streaming via KiteTicker
"""

import json
import logging
import threading
from datetime import datetime, timedelta

from flask import Flask, jsonify, redirect, request, session
from flask_cors import CORS
from kiteconnect import KiteConnect, KiteTicker

import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = config.FLASK_SECRET_KEY
CORS(app, supports_credentials=True, origins=[config.FRONTEND_URL])

# Global Kite instances (per-session in production, simplified here)
kite = KiteConnect(api_key=config.KITE_API_KEY)
kws = None
live_ticks = {}
ticker_thread = None


# ──────────────────────────────────────────────
# Auth Routes
# ──────────────────────────────────────────────

@app.route("/api/auth/login-url")
def login_url():
    """Return the Kite Connect login URL for OAuth redirect."""
    url = kite.login_url()
    return jsonify({"login_url": url})


@app.route("/api/auth/callback")
def auth_callback():
    """
    Handle the OAuth callback from Kite Connect.
    Kite redirects here with ?request_token=xxx&status=success
    """
    request_token = request.args.get("request_token")
    status = request.args.get("status")

    if status != "success" or not request_token:
        return redirect(f"{config.FRONTEND_URL}?auth=failed")

    try:
        data = kite.generate_session(request_token, api_secret=config.KITE_API_SECRET)
        access_token = data["access_token"]
        kite.set_access_token(access_token)

        # Store in session
        session["access_token"] = access_token
        session["user_id"] = data.get("user_id", "")
        session["user_name"] = data.get("user_name", "")
        session["email"] = data.get("email", "")
        session["broker"] = data.get("broker", "ZERODHA")

        logger.info("Login successful for user: %s", session["user_id"])
        return redirect(f"{config.FRONTEND_URL}?auth=success")

    except Exception as e:
        logger.error("Login failed: %s", e)
        return redirect(f"{config.FRONTEND_URL}?auth=failed&error={str(e)}")


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    """Invalidate the session and Kite access token."""
    try:
        token = session.get("access_token")
        if token:
            kite.invalidate_access_token(token)
    except Exception as e:
        logger.warning("Token invalidation failed: %s", e)

    session.clear()
    return jsonify({"status": "logged_out"})


@app.route("/api/auth/profile")
def profile():
    """Return the current logged-in user profile."""
    if "access_token" not in session:
        return jsonify({"authenticated": False}), 401

    try:
        kite.set_access_token(session["access_token"])
        user_profile = kite.profile()
        return jsonify({
            "authenticated": True,
            "user_id": user_profile.get("user_id", session.get("user_id")),
            "user_name": user_profile.get("user_name", session.get("user_name")),
            "email": user_profile.get("email", session.get("email")),
            "broker": user_profile.get("broker", "ZERODHA"),
        })
    except Exception:
        return jsonify({"authenticated": False}), 401


# ──────────────────────────────────────────────
# Instruments & Market Data
# ──────────────────────────────────────────────

def require_auth(f):
    """Decorator to check authentication before API calls."""
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        if "access_token" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        kite.set_access_token(session["access_token"])
        return f(*args, **kwargs)

    return decorated


@app.route("/api/instruments")
@require_auth
def get_instruments():
    """
    Fetch all tradable instruments.
    Query params: ?exchange=NSE (optional, defaults to NFO for FnO)
    """
    exchange = request.args.get("exchange", "NFO")
    try:
        instruments = kite.instruments(exchange)
        # Convert to JSON-serializable format
        result = []
        for inst in instruments:
            result.append({
                "instrument_token": inst["instrument_token"],
                "exchange_token": inst["exchange_token"],
                "tradingsymbol": inst["tradingsymbol"],
                "name": inst.get("name", ""),
                "last_price": inst.get("last_price", 0),
                "expiry": inst["expiry"].isoformat() if inst.get("expiry") else None,
                "strike": inst.get("strike", 0),
                "tick_size": inst.get("tick_size", 0),
                "lot_size": inst.get("lot_size", 0),
                "instrument_type": inst.get("instrument_type", ""),
                "segment": inst.get("segment", ""),
                "exchange": inst.get("exchange", ""),
            })
        return jsonify(result)
    except Exception as e:
        logger.error("Failed to fetch instruments: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/instruments/fno")
@require_auth
def get_fno_instruments():
    """Fetch FnO instruments grouped by underlying symbol."""
    try:
        instruments = kite.instruments("NFO")
        grouped = {}
        for inst in instruments:
            symbol = inst.get("name", "")
            if not symbol:
                continue
            if symbol not in grouped:
                grouped[symbol] = {"futures": [], "options": []}

            entry = {
                "instrument_token": inst["instrument_token"],
                "tradingsymbol": inst["tradingsymbol"],
                "expiry": inst["expiry"].isoformat() if inst.get("expiry") else None,
                "strike": inst.get("strike", 0),
                "lot_size": inst.get("lot_size", 0),
                "instrument_type": inst.get("instrument_type", ""),
            }

            if inst.get("instrument_type") == "FUT":
                grouped[symbol]["futures"].append(entry)
            elif inst.get("instrument_type") in ("CE", "PE"):
                grouped[symbol]["options"].append(entry)

        return jsonify(grouped)
    except Exception as e:
        logger.error("Failed to fetch FnO instruments: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/quote")
@require_auth
def get_quote():
    """
    Get live quotes for instruments.
    Query params: ?symbols=NSE:INFY,NSE:RELIANCE
    """
    symbols_str = request.args.get("symbols", "")
    if not symbols_str:
        return jsonify({"error": "symbols parameter required"}), 400

    symbols = [s.strip() for s in symbols_str.split(",") if s.strip()]
    try:
        quotes = kite.quote(symbols)
        # Convert to serializable format
        result = {}
        for key, val in quotes.items():
            result[key] = {
                "instrument_token": val.get("instrument_token"),
                "last_price": val.get("last_price"),
                "ohlc": val.get("ohlc"),
                "volume": val.get("volume"),
                "oi": val.get("oi"),
                "oi_day_high": val.get("oi_day_high"),
                "oi_day_low": val.get("oi_day_low"),
                "net_change": val.get("net_change"),
                "lower_circuit_limit": val.get("lower_circuit_limit"),
                "upper_circuit_limit": val.get("upper_circuit_limit"),
                "depth": val.get("depth"),
            }
        return jsonify(result)
    except Exception as e:
        logger.error("Failed to fetch quote: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/ohlc")
@require_auth
def get_ohlc():
    """
    Get OHLC data.
    Query params: ?symbols=NSE:INFY,NSE:RELIANCE
    """
    symbols_str = request.args.get("symbols", "")
    if not symbols_str:
        return jsonify({"error": "symbols parameter required"}), 400

    symbols = [s.strip() for s in symbols_str.split(",") if s.strip()]
    try:
        data = kite.ohlc(symbols)
        return jsonify(data)
    except Exception as e:
        logger.error("Failed to fetch OHLC: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/ltp")
@require_auth
def get_ltp():
    """
    Get Last Traded Price.
    Query params: ?symbols=NSE:INFY,NSE:RELIANCE
    """
    symbols_str = request.args.get("symbols", "")
    if not symbols_str:
        return jsonify({"error": "symbols parameter required"}), 400

    symbols = [s.strip() for s in symbols_str.split(",") if s.strip()]
    try:
        data = kite.ltp(symbols)
        return jsonify(data)
    except Exception as e:
        logger.error("Failed to fetch LTP: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/historical")
@require_auth
def get_historical():
    """
    Get historical candle data.
    Query params:
      - instrument_token (required)
      - from_date (YYYY-MM-DD, default: 30 days ago)
      - to_date (YYYY-MM-DD, default: today)
      - interval (minute, day, 3minute, 5minute, 10minute, 15minute, 30minute, 60minute)
    """
    token = request.args.get("instrument_token")
    if not token:
        return jsonify({"error": "instrument_token required"}), 400

    to_date = request.args.get("to_date", datetime.now().strftime("%Y-%m-%d"))
    from_date = request.args.get(
        "from_date", (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    )
    interval = request.args.get("interval", "day")

    try:
        data = kite.historical_data(
            instrument_token=int(token),
            from_date=from_date,
            to_date=to_date,
            interval=interval,
        )
        # Convert datetime objects to strings
        result = []
        for candle in data:
            result.append({
                "date": candle["date"].isoformat() if hasattr(candle["date"], "isoformat") else str(candle["date"]),
                "open": candle["open"],
                "high": candle["high"],
                "low": candle["low"],
                "close": candle["close"],
                "volume": candle["volume"],
            })
        return jsonify(result)
    except Exception as e:
        logger.error("Failed to fetch historical data: %s", e)
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# Option Chain Builder
# ──────────────────────────────────────────────

@app.route("/api/option-chain")
@require_auth
def get_option_chain():
    """
    Build option chain for a symbol.
    Query params:
      - symbol (e.g. NIFTY, BANKNIFTY, RELIANCE)
      - expiry (YYYY-MM-DD, optional - uses nearest expiry if not provided)
    """
    symbol = request.args.get("symbol")
    expiry_str = request.args.get("expiry")

    if not symbol:
        return jsonify({"error": "symbol parameter required"}), 400

    try:
        # Fetch NFO instruments
        instruments = kite.instruments("NFO")
        symbol_upper = symbol.upper()

        # Filter for this symbol
        options = [
            i for i in instruments
            if i.get("name", "").upper() == symbol_upper
            and i.get("instrument_type") in ("CE", "PE")
        ]

        if not options:
            return jsonify({"error": f"No options found for {symbol}"}), 404

        # Filter by expiry
        if expiry_str:
            target_expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()
            options = [o for o in options if o.get("expiry") == target_expiry]
        else:
            # Get nearest expiry
            expiries = sorted(set(o["expiry"] for o in options if o.get("expiry")))
            today = datetime.now().date()
            future_expiries = [e for e in expiries if e >= today]
            if future_expiries:
                nearest = future_expiries[0]
                options = [o for o in options if o.get("expiry") == nearest]
            elif expiries:
                options = [o for o in options if o.get("expiry") == expiries[-1]]

        if not options:
            return jsonify({"error": "No options for selected expiry"}), 404

        # Get quotes for all option instruments
        tokens = [str(o["instrument_token"]) for o in options]

        # Kite API allows max ~200 instruments per quote call
        all_quotes = {}
        batch_size = 200
        for i in range(0, len(tokens), batch_size):
            batch = tokens[i : i + batch_size]
            instrument_ids = [f"NFO:{o['tradingsymbol']}" for o in options if str(o["instrument_token"]) in batch]
            try:
                quotes = kite.quote(instrument_ids)
                all_quotes.update(quotes)
            except Exception as qe:
                logger.warning("Quote batch failed: %s", qe)

        # Also get the underlying spot price
        spot_price = 0
        try:
            if symbol_upper in ("NIFTY", "NIFTY 50"):
                spot = kite.ltp(["NSE:NIFTY 50"])
                spot_price = list(spot.values())[0]["last_price"] if spot else 0
            elif symbol_upper in ("BANKNIFTY", "NIFTY BANK"):
                spot = kite.ltp(["NSE:NIFTY BANK"])
                spot_price = list(spot.values())[0]["last_price"] if spot else 0
            else:
                spot = kite.ltp([f"NSE:{symbol_upper}"])
                spot_price = list(spot.values())[0]["last_price"] if spot else 0
        except Exception:
            pass

        # Build chain
        chain = {}
        expiry_date = None
        for opt in options:
            strike = opt.get("strike", 0)
            opt_type = opt.get("instrument_type", "")  # CE or PE
            ts = opt["tradingsymbol"]
            quote_key = f"NFO:{ts}"
            quote = all_quotes.get(quote_key, {})

            if strike not in chain:
                chain[strike] = {"strike": strike, "CE": None, "PE": None}

            chain[strike][opt_type] = {
                "instrument_token": opt["instrument_token"],
                "tradingsymbol": ts,
                "last_price": quote.get("last_price", 0),
                "oi": quote.get("oi", 0),
                "volume": quote.get("volume", 0),
                "bid": quote.get("depth", {}).get("buy", [{}])[0].get("price", 0) if quote.get("depth") else 0,
                "ask": quote.get("depth", {}).get("sell", [{}])[0].get("price", 0) if quote.get("depth") else 0,
                "lot_size": opt.get("lot_size", 0),
            }

            if not expiry_date and opt.get("expiry"):
                expiry_date = opt["expiry"].isoformat()

        # Sort by strike
        sorted_chain = sorted(chain.values(), key=lambda x: x["strike"])

        return jsonify({
            "symbol": symbol_upper,
            "spot_price": spot_price,
            "expiry": expiry_date,
            "chain": sorted_chain,
        })

    except Exception as e:
        logger.error("Failed to build option chain: %s", e)
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# Portfolio & Orders
# ──────────────────────────────────────────────

@app.route("/api/holdings")
@require_auth
def get_holdings():
    """Get user's holdings."""
    try:
        return jsonify(kite.holdings())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/positions")
@require_auth
def get_positions():
    """Get user's positions."""
    try:
        return jsonify(kite.positions())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/orders")
@require_auth
def get_orders():
    """Get user's orders."""
    try:
        return jsonify(kite.orders())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# Live Ticks (WebSocket via KiteTicker)
# ──────────────────────────────────────────────

@app.route("/api/live/subscribe", methods=["POST"])
@require_auth
def subscribe_live():
    """
    Start WebSocket and subscribe to instrument tokens.
    Body: { "tokens": [738561, 5633], "mode": "full" }
    """
    global kws, ticker_thread, live_ticks

    body = request.get_json() or {}
    tokens = body.get("tokens", [])
    mode_str = body.get("mode", "full").upper()

    if not tokens:
        return jsonify({"error": "tokens array required"}), 400

    mode_map = {"FULL": KiteTicker.MODE_FULL, "QUOTE": KiteTicker.MODE_QUOTE, "LTP": KiteTicker.MODE_LTP}
    mode = mode_map.get(mode_str, KiteTicker.MODE_FULL)

    try:
        # Stop existing ticker if running
        if kws:
            try:
                kws.close()
            except Exception:
                pass

        kws = KiteTicker(config.KITE_API_KEY, session["access_token"])

        def on_ticks(ws, ticks):
            for tick in ticks:
                token = tick.get("instrument_token")
                live_ticks[token] = {
                    "instrument_token": token,
                    "last_price": tick.get("last_price"),
                    "volume": tick.get("volume_traded"),
                    "oi": tick.get("oi"),
                    "ohlc": tick.get("ohlc"),
                    "change": tick.get("change"),
                    "timestamp": datetime.now().isoformat(),
                }

        def on_connect(ws, response):
            logger.info("WebSocket connected, subscribing to %d tokens", len(tokens))
            ws.subscribe(tokens)
            ws.set_mode(mode, tokens)

        def on_close(ws, code, reason):
            logger.info("WebSocket closed: %s %s", code, reason)

        def on_error(ws, code, reason):
            logger.error("WebSocket error: %s %s", code, reason)

        kws.on_ticks = on_ticks
        kws.on_connect = on_connect
        kws.on_close = on_close
        kws.on_error = on_error

        # Run in background thread
        ticker_thread = threading.Thread(target=kws.connect, kwargs={"threaded": True}, daemon=True)
        ticker_thread.start()

        return jsonify({"status": "subscribed", "tokens": tokens, "mode": mode_str})
    except Exception as e:
        logger.error("Live subscribe failed: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/live/ticks")
@require_auth
def get_live_ticks():
    """Poll latest ticks from the WebSocket buffer."""
    tokens = request.args.get("tokens", "")
    if tokens:
        token_list = [int(t.strip()) for t in tokens.split(",") if t.strip()]
        filtered = {k: v for k, v in live_ticks.items() if k in token_list}
        return jsonify(filtered)
    return jsonify(live_ticks)


@app.route("/api/live/unsubscribe", methods=["POST"])
@require_auth
def unsubscribe_live():
    """Stop the WebSocket connection."""
    global kws, live_ticks
    if kws:
        try:
            kws.close()
        except Exception:
            pass
        kws = None
    live_ticks = {}
    return jsonify({"status": "unsubscribed"})


# ──────────────────────────────────────────────
# FnO Dashboard Specific - Bulk Data for Scanner
# ──────────────────────────────────────────────

@app.route("/api/scanner/fetch")
@require_auth
def scanner_fetch():
    """
    Fetch data needed by the FnO scanner in one call.
    Returns futures + options data formatted for the dashboard parsers.
    Query params:
      - symbols (comma-separated, e.g. NIFTY,RELIANCE,INFY)
        If empty, fetches top FnO stocks.
    """
    symbols_str = request.args.get("symbols", "")

    try:
        # Get all NFO instruments
        nfo_instruments = kite.instruments("NFO")

        if symbols_str:
            target_symbols = [s.strip().upper() for s in symbols_str.split(",")]
        else:
            # Get unique FnO symbols (top by lot count)
            all_symbols = set(i.get("name", "") for i in nfo_instruments if i.get("name"))
            target_symbols = sorted(all_symbols)

        # Separate futures and options
        futures_instruments = [
            i for i in nfo_instruments
            if i.get("instrument_type") == "FUT" and i.get("name", "").upper() in target_symbols
        ]
        # Get nearest expiry futures only
        futures_by_symbol = {}
        today = datetime.now().date()
        for f in futures_instruments:
            sym = f["name"].upper()
            exp = f.get("expiry")
            if exp and exp >= today:
                if sym not in futures_by_symbol or exp < futures_by_symbol[sym]["expiry"]:
                    futures_by_symbol[sym] = f

        # Fetch quotes for futures
        futures_data = []
        fut_list = list(futures_by_symbol.values())
        batch_size = 200
        for i in range(0, len(fut_list), batch_size):
            batch = fut_list[i : i + batch_size]
            ids = [f"NFO:{f['tradingsymbol']}" for f in batch]
            try:
                quotes = kite.quote(ids)
                for f in batch:
                    key = f"NFO:{f['tradingsymbol']}"
                    q = quotes.get(key, {})
                    futures_data.append({
                        "symbol": f["name"].upper(),
                        "tradingsymbol": f["tradingsymbol"],
                        "instrument_token": f["instrument_token"],
                        "expiry": f["expiry"].isoformat() if f.get("expiry") else None,
                        "last_price": q.get("last_price", 0),
                        "close": q.get("ohlc", {}).get("close", 0),
                        "open": q.get("ohlc", {}).get("open", 0),
                        "high": q.get("ohlc", {}).get("high", 0),
                        "low": q.get("ohlc", {}).get("low", 0),
                        "volume": q.get("volume", 0),
                        "oi": q.get("oi", 0),
                        "oi_day_high": q.get("oi_day_high", 0),
                        "oi_day_low": q.get("oi_day_low", 0),
                        "net_change": q.get("net_change", 0),
                        "lot_size": f.get("lot_size", 0),
                    })
            except Exception as be:
                logger.warning("Futures quote batch failed: %s", be)

        return jsonify({
            "futures": futures_data,
            "symbols": target_symbols,
            "count": len(futures_data),
        })

    except Exception as e:
        logger.error("Scanner fetch failed: %s", e)
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "api_key_configured": bool(config.KITE_API_KEY),
        "timestamp": datetime.now().isoformat(),
    })


if __name__ == "__main__":
    logger.info("Starting FnO Dashboard Backend on port %s", config.FLASK_PORT)
    logger.info("Kite login URL: %s", kite.login_url())
    logger.info("Set your Kite redirect URL to: http://localhost:%s/api/auth/callback", config.FLASK_PORT)
    app.run(debug=True, port=config.FLASK_PORT)
