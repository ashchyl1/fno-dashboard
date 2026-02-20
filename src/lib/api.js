/**
 * API Service Layer - Connects React frontend to Flask/Kite Connect backend
 */

const API_BASE = "/api";

class KiteAPI {
  // ── Auth ──────────────────────────────────────

  async getLoginUrl() {
    const res = await fetch(`${API_BASE}/auth/login-url`, { credentials: "include" });
    const data = await res.json();
    return data.login_url;
  }

  async getProfile() {
    const res = await fetch(`${API_BASE}/auth/profile`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.authenticated ? data : null;
  }

  async logout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  }

  // ── Instruments ───────────────────────────────

  async getInstruments(exchange = "NFO") {
    const res = await fetch(`${API_BASE}/instruments?exchange=${exchange}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch instruments");
    return res.json();
  }

  async getFnoInstruments() {
    const res = await fetch(`${API_BASE}/instruments/fno`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch FnO instruments");
    return res.json();
  }

  // ── Quotes ────────────────────────────────────

  async getQuote(symbols) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(",") : symbols;
    const res = await fetch(`${API_BASE}/quote?symbols=${encodeURIComponent(symbolStr)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch quotes");
    return res.json();
  }

  async getLTP(symbols) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(",") : symbols;
    const res = await fetch(`${API_BASE}/ltp?symbols=${encodeURIComponent(symbolStr)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch LTP");
    return res.json();
  }

  async getOHLC(symbols) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(",") : symbols;
    const res = await fetch(`${API_BASE}/ohlc?symbols=${encodeURIComponent(symbolStr)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch OHLC");
    return res.json();
  }

  // ── Historical Data ───────────────────────────

  async getHistorical({ instrumentToken, fromDate, toDate, interval = "day" }) {
    const params = new URLSearchParams({
      instrument_token: instrumentToken,
      interval,
    });
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);

    const res = await fetch(`${API_BASE}/historical?${params}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch historical data");
    return res.json();
  }

  // ── Option Chain ──────────────────────────────

  async getOptionChain(symbol, expiry) {
    const params = new URLSearchParams({ symbol });
    if (expiry) params.set("expiry", expiry);

    const res = await fetch(`${API_BASE}/option-chain?${params}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch option chain");
    return res.json();
  }

  // ── Portfolio ─────────────────────────────────

  async getHoldings() {
    const res = await fetch(`${API_BASE}/holdings`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch holdings");
    return res.json();
  }

  async getPositions() {
    const res = await fetch(`${API_BASE}/positions`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch positions");
    return res.json();
  }

  async getOrders() {
    const res = await fetch(`${API_BASE}/orders`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch orders");
    return res.json();
  }

  // ── Live Ticks ────────────────────────────────

  async subscribeLive(tokens, mode = "full") {
    const res = await fetch(`${API_BASE}/live/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tokens, mode }),
    });
    if (!res.ok) throw new Error("Failed to subscribe");
    return res.json();
  }

  async getLiveTicks(tokens) {
    const params = tokens ? `?tokens=${tokens.join(",")}` : "";
    const res = await fetch(`${API_BASE}/live/ticks${params}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch ticks");
    return res.json();
  }

  async unsubscribeLive() {
    await fetch(`${API_BASE}/live/unsubscribe`, {
      method: "POST",
      credentials: "include",
    });
  }

  // ── Scanner ───────────────────────────────────

  async fetchScannerData(symbols) {
    const params = symbols ? `?symbols=${symbols.join(",")}` : "";
    const res = await fetch(`${API_BASE}/scanner/fetch${params}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch scanner data");
    return res.json();
  }

  // ── Health ────────────────────────────────────

  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const kiteAPI = new KiteAPI();
export default kiteAPI;
