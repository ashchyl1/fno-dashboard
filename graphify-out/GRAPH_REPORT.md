# Graph Report - .  (2026-04-28)

## Corpus Check
- Corpus is ~9,217 words - fits in a single context window. You may not need a graph.

## Summary
- 81 nodes · 80 edges · 8 communities detected
- Extraction: 79% EXTRACTED · 20% INFERRED · 1% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Entry & Core UI|App Entry & Core UI]]
- [[_COMMUNITY_Strategy Constructors|Strategy Constructors]]
- [[_COMMUNITY_Analysis & Scanning Engine|Analysis & Scanning Engine]]
- [[_COMMUNITY_App Shell & Utilities|App Shell & Utilities]]
- [[_COMMUNITY_Divergence Detection|Divergence Detection]]
- [[_COMMUNITY_OI Classification|OI Classification]]
- [[_COMMUNITY_Deep Dive Widget|Deep Dive Widget]]
- [[_COMMUNITY_HTTP Client (requests)|HTTP Client (requests)]]

## God Nodes (most connected - your core abstractions)
1. `F&O Strategy Dashboard` - 10 edges
2. `generateStrategy()` - 8 edges
3. `findStrike()` - 8 edges
4. `Analysis Engine` - 5 edges
5. `Market Scanner` - 4 edges
6. `cn()` - 3 edges
7. `constructBearPutSpread()` - 3 edges
8. `constructBullCallSpread()` - 3 edges
9. `constructSellCall()` - 3 edges
10. `constructSellPut()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `F&O Strategy Dashboard` --references--> `graphifyy`  [AMBIGUOUS]
  README.md → requirements.txt
- `index.html Entry Point` --conceptually_related_to--> `F&O Strategy Dashboard`  [INFERRED]
  index.html → README.md
- `main.jsx` --references--> `React`  [INFERRED]
  index.html → README.md
- `App()` --calls--> `cn()`  [INFERRED]
  src/App.jsx → src/lib/utils.js
- `FileUpload()` --calls--> `cn()`  [INFERRED]
  src/components/ui/FileUpload.jsx → src/lib/utils.js

## Hyperedges (group relationships)
- **Core F&O Analysis Pipeline** — readme_futures_archive_csv, readme_options_snapshot_csv, readme_parsers, readme_oi_classifier, readme_options_analyzer, readme_strategy_engine [INFERRED 0.85]
- **UI and Visualization Stack** — readme_react, readme_recharts, readme_tailwind_css, readme_recharts_components, readme_scanner_widget, readme_heatmap_widget [INFERRED 0.80]
- **Build and Entry Point** — readme_vite, index_html_entry, index_main_jsx [INFERRED 0.85]

## Communities

### Community 0 - "App Entry & Core UI"
Cohesion: 0.16
Nodes (14): index.html Entry Point, main.jsx, Bear Put Spread, F&O Strategy Dashboard, Heatmap Widget, React, Recharts, Recharts Components (+6 more)

### Community 1 - "Strategy Constructors"
Cohesion: 0.38
Nodes (11): constructBearPutSpread(), constructBullCallSpread(), constructFuturesLong(), constructFuturesShort(), constructIronCondor(), constructSellCall(), constructSellPut(), constructShortStraddle() (+3 more)

### Community 2 - "Analysis & Scanning Engine"
Cohesion: 0.2
Nodes (11): Analysis Engine, Futures Archive CSV, Market Scanner, Max Pain, OI Classifier, Options Analyzer, Options Snapshot CSV, PapaParse (+3 more)

### Community 3 - "App Shell & Utilities"
Cohesion: 0.29
Nodes (3): cn(), App(), FileUpload()

### Community 4 - "Divergence Detection"
Cohesion: 0.5
Nodes (3): detectDivergence(), getLatestFutures(), DivergenceMap()

### Community 5 - "OI Classification"
Cohesion: 0.5
Nodes (2): classifyOI(), groupBySymbol()

### Community 20 - "Deep Dive Widget"
Cohesion: 1.0
Nodes (1): Deep Dive Widget

### Community 21 - "HTTP Client (requests)"
Cohesion: 1.0
Nodes (1): requests

## Ambiguous Edges - Review These
- `F&O Strategy Dashboard` → `graphifyy`  [AMBIGUOUS]
  requirements.txt · relation: references

## Knowledge Gaps
- **12 isolated node(s):** `Vite`, `Tailwind CSS`, `PapaParse`, `Strategy Engine`, `Scanner Widget` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `OI Classification`** (5 nodes): `calculateAvgVolume()`, `calculateStreak()`, `classifyOI()`, `groupBySymbol()`, `oi-classifier.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Deep Dive Widget`** (1 nodes): `Deep Dive Widget`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTTP Client (requests)`** (1 nodes): `requests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `F&O Strategy Dashboard` and `graphifyy`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `F&O Strategy Dashboard` connect `App Entry & Core UI` to `Analysis & Scanning Engine`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `Analysis Engine` connect `Analysis & Scanning Engine` to `App Entry & Core UI`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `Market Scanner` connect `Analysis & Scanning Engine` to `App Entry & Core UI`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Analysis Engine` (e.g. with `Options Analyzer` and `Market Scanner`) actually correct?**
  _`Analysis Engine` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Market Scanner` (e.g. with `OI Classifier` and `Scanner Widget`) actually correct?**
  _`Market Scanner` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Vite`, `Tailwind CSS`, `PapaParse` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._