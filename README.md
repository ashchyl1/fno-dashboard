# F&O Strategy Dashboard

A full-stack application for analyzing Indian Futures & Options (F&O) data with **live Kite Connect API integration** and actionable trading strategies.

## Features

- **Kite Connect Integration**: OAuth login, live market data, option chain fetching
- **Market Scanner**: Classifies stocks (Long/Short Build-up) & Conviction Scoring
- **Analysis Engine**: Computes PCR, Max Pain, and key Support/Resistance levels
- **Strategy Generator**: Suggests specific trades (Bear Put Spread, etc.) with Risk/Reward
- **Live Streaming**: Real-time tick data via KiteTicker WebSocket
- **Visualizations**: Interactive Price/OI Charts, Option Heatmaps, and Divergence Maps
- **CSV Upload**: Also supports offline mode with manual CSV file uploads
- **Offline Capable**: Zero-dependency single-file HTML output (CSV mode)

## Prerequisites

- **Node.js** (v18+) and npm
- **Python 3.8+** and pip
- **Zerodha Trading Account** (for Kite Connect API)
- **Kite Connect API Key** from [kite.trade](https://kite.trade)

## Quick Start

### 1. Clone & Install Frontend

```bash
git clone <repo-url>
cd fno-dashboard
npm install
```

### 2. Setup Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` with your Kite Connect credentials:

```
KITE_API_KEY=your_api_key_here
KITE_API_SECRET=your_api_secret_here
FLASK_SECRET_KEY=a-random-secret-string
FRONTEND_URL=http://localhost:5173
```

### 3. Configure Kite Connect Redirect URL

In your [Kite Connect Developer Portal](https://kite.trade), set the **Redirect URL** to:

```
http://localhost:5000/api/auth/callback
```

### 4. Run Both Servers

**Terminal 1 - Backend (Flask):**
```bash
cd backend
python app.py
```

**Terminal 2 - Frontend (Vite):**
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Connect Your Kite Account

1. Click **"Connect Kite"** button in the dashboard header
2. Log in with your Zerodha credentials
3. You'll be redirected back with access granted
4. Select stocks and click **"Fetch Futures"** or **"Fetch Options"** for live data

## Project Structure

```
fno-dashboard/
├── backend/                  # Python Flask API server
│   ├── app.py               # Main Flask app (OAuth, data endpoints, WebSocket)
│   ├── config.py            # Environment configuration
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment template
├── src/                     # React frontend
│   ├── App.jsx              # Main app with tab navigation + Kite login
│   ├── lib/
│   │   ├── api.js           # Kite API service layer (frontend)
│   │   ├── parsers.js       # CSV parsing logic
│   │   ├── utils.js         # Utility functions
│   │   ├── constants/       # Lot sizes, etc.
│   │   └── analysis/        # Core analysis modules
│   │       ├── oi-classifier.js
│   │       ├── options-analyzer.js
│   │       ├── divergence.js
│   │       ├── conviction.js
│   │       └── strategy-engine.js
│   └── components/
│       ├── dashboard/
│       │   ├── MarketScanner.jsx    # Data upload + results table
│       │   ├── KiteLogin.jsx        # Kite Connect OAuth login
│       │   ├── LiveDataPanel.jsx    # Fetch data from Kite API
│       │   ├── StockDeepDive.jsx    # Detailed stock analysis
│       │   ├── DivergenceMap.jsx    # Divergence scatter chart
│       │   ├── OptionChainHeatmap.jsx
│       │   └── StrategyCard.jsx
│       ├── charts/
│       │   └── PriceOIChart.jsx
│       └── ui/
│           └── FileUpload.jsx
├── package.json
├── vite.config.js           # Vite config with Flask proxy
├── tailwind.config.js
└── fetch_data.py            # Standalone NSE Bhavcopy downloader
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login-url` | GET | Get Kite OAuth login URL |
| `/api/auth/callback` | GET | OAuth callback handler |
| `/api/auth/profile` | GET | Get user profile |
| `/api/auth/logout` | POST | Logout and invalidate token |
| `/api/instruments` | GET | All instruments (exchange param) |
| `/api/instruments/fno` | GET | FnO instruments grouped by symbol |
| `/api/quote` | GET | Live quotes (symbols param) |
| `/api/ltp` | GET | Last Traded Price |
| `/api/ohlc` | GET | OHLC data |
| `/api/historical` | GET | Historical candle data |
| `/api/option-chain` | GET | Full option chain for a symbol |
| `/api/holdings` | GET | User holdings |
| `/api/positions` | GET | User positions |
| `/api/orders` | GET | User orders |
| `/api/live/subscribe` | POST | Subscribe to WebSocket ticks |
| `/api/live/ticks` | GET | Poll latest ticks |
| `/api/live/unsubscribe` | POST | Stop WebSocket |
| `/api/scanner/fetch` | GET | Bulk futures data for scanner |
| `/api/health` | GET | Health check |

## Data Modes

### Mode 1: Live via Kite Connect (Recommended)
Connect your Zerodha account, select stocks, and fetch live data with one click.

### Mode 2: CSV Upload (Offline)
Upload NSE Bhavcopy (Futures) and Options Snapshot CSV files manually.

### Mode 3: Standalone HTML
Run `npm run build` to generate `dist/index.html` - a single-file dashboard that works offline with CSV uploads only.

## Kite Connect Pricing

| Feature | Cost |
|---|---|
| Order placement & account management APIs | Free |
| Real-time + historical data APIs | Rs 500/month |
| Prerequisite | Active Zerodha Demat & Trading account |

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, PapaParse
- **Backend**: Python Flask, kiteconnect (PyKiteConnect)
- **API**: Zerodha Kite Connect v3
- **Streaming**: KiteTicker WebSocket
