# F&O Strategy Dashboard

A client-side React application for analyzing Indian Futures & Options (F&O) data to generate actionable trading strategies — now with a full **Trade Journal** for entry/exit analysis.

## 🚀 Features

### Trade Journal (entry/exit analysis)

- **Dashboard**: Net P&L, win rate, profit factor, expectancy (R), capture rate, and max drawdown stat cards with sparklines; equity curve with drawdown shading; daily P&L calendar heatmap (click a day to drill in); composite discipline score.
- **Trade log**: Virtualized table (handles 10,000+ rows), sortable/searchable, with R-multiples, capture-rate bars, and setup/emotion/mistake tags.
- **Trade detail**: Candlestick chart with entry/exit markers, stop/target lines, and a shaded trade zone (TradingView Lightweight Charts); bar-by-bar **trade replay**; MFE/MAE excursion bar; editable journal fields.
- **Analytics lab**: MFE vs. realized-R scatter (exit quality), MAE histogram (entry quality), R-distribution, capture-rate trend, and P&L breakdowns by setup / weekday / hold time / entry hour.
- **What-if simulator**: Replays every stored price path with a modified stop distance and optional fixed take-profit, overlaying the hypothetical equity curve on the actual one.
- **Insights**: Auto-generated plain-language findings (exit leaks, early entries, emotion/mistake costs), journaling streaks, and discipline badges.
- **Data**: Persistent in IndexedDB, CSV import with column mapping (generic + Zerodha tradebook), JSON export/import, seeded sample data (~300 trades) on first load, Ctrl+K command palette.

### Market Scanner

- **Market Scanner**: Classifies stocks (Long/Short Build-up) & Conviction Scoring.
- **Analysis Engine**: Computes PCR, Max Pain, and key Support/Resistance levels.
- **Strategy Generator**: Suggests specific trades (Bear Put Spread, etc.) with Risk/Reward.
- **Visualizations**: Interactive Price/OI Charts, Option Heatmaps, and Divergence Maps.
- **Offline Capable**: Zero-dependency single-file HTML output.

## 🛠️ Setup & Run

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
npm install
```

### Development

Start the dev server:

```bash
npm run dev
```

### Build (Single File)

Generate the standalone HTML file:

```bash
npm run build
```

The output file will be located at `dist/index.html`. You can open this file in any web browser.

## 📁 Project Structure

- `src/lib/parsers.js`: CSV parsing logic (PapaParse)
- `src/lib/analysis/`: Core logic (OI Classifier, Options Analyzer, Strategy Engine)
- `src/lib/journal/`: Trade journal engine — pure analytics (`metrics.js`), insights rules, sample-data generator, candle builder, IndexedDB persistence, CSV mapping
- `src/components/dashboard/`: UI Widgets (Scanner, Deep Dive, Heatmap)
- `src/components/journal/`: Trade journal UI (Dashboard, Trades, Analytics, Insights, trade detail with replay)
- `src/components/charts/`: Recharts components

## 📊 Data Format

The app expects two CSV files:

1.  **Futures Archive**: Multi-day futures data (Symbol, Date, Close, OI, Volume)
2.  **Options Snapshot**: Single-day options chain (Contract Descriptor, OI, LTP, Strike)

_Built with Vite, React, Tailwind CSS, and Recharts._
