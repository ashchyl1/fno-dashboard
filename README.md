# F&O Strategy Dashboard

A client-side React application for analyzing Indian Futures & Options (F&O) data to generate actionable trading strategies.

## 🚀 Features

- **Market Scanner**: Classifies stocks (Long/Short Build-up) & Conviction Scoring.
- **Analysis Engine**: Computes PCR, Max Pain, and key Support/Resistance levels.
- **Strategy Generator**: Suggests specific trades (Bear Put Spread, etc.) with Risk/Reward.
- **Momentum → Calendar**: Rohit Momentum crossover entries confirmed by RSI *or* the
  Wavy Tunnel, built into calendar spreads with a six-rule exit ladder.
  See [`docs/momentum-calendar-strategy.md`](docs/momentum-calendar-strategy.md).
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

### Verify the analysis maths

```bash
npm run verify
```

Runs 103 numerical assertions over the indicator, pricing, entry and exit modules
(Black-Scholes against textbook values, implied-vol round-trips, exit rules firing
on the right conditions, and an end-to-end pass through the CSV parsers).

## 📁 Project Structure

- `src/lib/parsers.js`: CSV parsing logic (PapaParse)
- `src/lib/analysis/`: Core logic (OI Classifier, Options Analyzer, Strategy Engine,
  Rohit Momentum, Wavy Tunnel, Black-Scholes, Calendar Spread, Exit Rules)
- `src/components/dashboard/`: UI Widgets (Scanner, Deep Dive, Heatmap, Momentum → Calendar)
- `src/components/charts/`: Recharts components
- `docs/momentum-calendar-strategy.md`: Full strategy specification
- `scripts/verify-strategy.mjs`: Numerical verification harness

## 📊 Data Format

The app expects two CSV files:

1.  **Futures Archive**: Multi-day futures data (Symbol, Date, Close, OI, Volume)
2.  **Options Snapshot**: Single-day options chain (Contract Descriptor, OI, LTP, Strike)

_Built with Vite, React, Tailwind CSS, and Recharts._
