# Momentum → Calendar Strategy

Entry on a **Rohit Momentum crossover**, confirmed by **RSI *or* the Wavy Tunnel**,
expressed as a **calendar spread**, managed by a fixed **six-rule exit ladder**.

This document is the specification. The code lives in `src/lib/analysis/` and the
UI is the **Momentum** tab.

---

## 1. A note on "Rohit's Momentum" before anything else

Rohit's Momentum Indicator (Rohit Srivastava / Definedge, shipped in RZone and
TradePoint) is **proprietary**. Definedge publishes how to trade it but not the
formula, and their documentation is not publicly fetchable.

So `rohit-momentum.js` does **not** claim to reproduce it bit-for-bit. It
reproduces the indicator's observable *structure*, which is what the trading
rules actually key off:

- a fast momentum line and a slower signal line
- a zero line separating bullish from bearish momentum
- buy when fast crosses above signal, sell when it crosses below
- the zero-line cross as the slower, stronger regime confirmation

Three calculation modes are selectable in the UI so you can match whatever your
platform plots:

| Mode | Calculation | When to use |
|---|---|---|
| `roc` *(default)* | EMA-smoothed rate of change vs. its own EMA signal line | General purpose |
| `stochrsi` | Stochastic RSI %K vs %D, recentred on zero | The variant most often described publicly as "Rohit's" |
| `macd` | Classic 12/26/9 | Familiar baseline for sanity-checking |

**Calibrate before you trade it.** Open the Momentum tab, put your TradePoint
chart beside it, and adjust mode and periods until the crossover *dates* line up
on a few symbols you know. Then stop changing them. Every downstream component —
entry, confirmation, exit — reads the same `fast` / `signal` / `histogram`
arrays, so a mode change propagates automatically.

---

## 2. Entry

### The gate

```
TRIGGER    fresh Rohit Momentum crossover           (mandatory)
CONFIRM    RSI agrees  OR  Wavy Tunnel agrees       (mandatory — either one)
VETO       Wavy Tunnel shows PW or FG against it    (blocks the trade)
```

**Why the confirmation is an OR, not an AND.** RSI and the Wavy Tunnel measure
different things — internal strength versus structural position. Requiring both
rejects most real signals, particularly reversals off a decline, where price is
still under the Wave while RSI has already turned. Requiring neither is no
filter at all. So: either one qualifies, and when *both* agree the setup scores
materially higher.

### Freshness

A crossover older than `freshnessBars` (default 2) is reported but does **not**
trigger. Acting on a ten-bar-old cross is chasing, not trading the signal.

### RSI confirmation (Wilder, 14)

- **Bullish:** RSI above 50 and rising
- **Bearish:** RSI below 50 and falling
- **Exhaustion flag:** RSI > 70 (long) or < 30 (short) still confirms, but costs
  score. For a calendar this matters more than for a directional trade — you
  need the underlying to *settle near* the strike, not run away from it.

### Wavy Tunnel confirmation

Standard chart furniture: Wave = 34 EMA of High/Close/Low, Tunnel = 144/169 EMA
of Close, Filter = 12 EMA of Close, plus a CAO histogram for divergence.

- **Bullish:** close above the Filter and above the Wave, Filter not falling,
  and (when the Tunnel is valid) the Wave above the Tunnel floor
- **Bearish:** the mirror image
- **Setups classified:** BO-1, BO-2, BO-3, BO-4, PW, FG

**PW and FG veto the trade.** Both are end-of-trend setups. A momentum crossover
into a hyper-extended, divergent market is exactly the signal that buys the top,
and the veto is what stops it.

**Graceful degradation.** The Tunnel needs 169 bars. NSE bhavcopy archives are
often shallower, so with too little history the module reports
`tunnelReady: false` and confirms on the Wave and Filter alone rather than
silently confirming on EMAs that are still warming up. This is precisely why the
confirmation is an OR — on short history, RSI carries it.

### Score (0–10)

| Component | Points |
|---|---|
| Fresh crossover (this bar / within freshness) | +3.0 / +2.5 |
| Zero-line regime agrees | +1.5 |
| Histogram still expanding | +1.0 |
| RSI confirms | +2.0 (+0.5 if not exhausted, −1.0 if exhausted) |
| Wavy Tunnel confirms | +2.5 (+0.5 for a recognised BO setup) |
| Both confirm | +1.0 |
| Tunnel shows PW/FG against | −2.0 and blocked |

**A** ≥ 7.5 take it · **B** ≥ 6 tradable, size down · **C** ≥ 4.5 watchlist ·
below that, no trade.

---

## 3. The trade: why a calendar

You asked for a calendar, and it happens to fit a momentum crossover well.

A calendar sells the near-month option and buys the same strike in the next
expiry. It profits three ways: the front leg decays faster than the back one
(**positive theta**), it is **long vega**, and it pays best when the underlying
**sits near the strike**.

That last point is the key pairing. A daily-chart momentum crossover usually
delivers a *slow* move. A long option would bleed through that; a calendar gets
paid by it.

### Direction is expressed through strike placement, not call/put delta

| Bias | Structure | Reasoning |
|---|---|---|
| **Bullish** | Call calendar 1–2 strikes **above** spot | You want price to drift **up into** the peak of the tent by front expiry |
| **Bearish** | Put calendar 1–2 strikes **below** spot | Mirror image |
| **Neutral** | ATM calendar | Pure decay |

Strike offset is configurable (default 1 strike).

### What the builder checks

- Two expiries actually exist in the chain, both quoting the chosen strike
- Front expiry is at least `minFrontDte` days out (default 5) — never sell a
  front leg already inside the gamma danger zone
- Net debit is positive; an inverted quote means stale data, not an opportunity
- **IV term structure**: front IV should be ≥ back IV. That is the calendar's
  edge — sell the rich near-dated option, own the cheaper far-dated one. A
  flat or wrong-way structure is flagged as the weakest version of this trade
- Open interest floor on both legs

Implied vol is solved per leg by bisection (not Newton-Raphson — deep OTM NSE
stock options have near-zero vega, where Newton diverges). A leg whose IV cannot
be solved is flagged rather than filled with a guess.

### Risk

- **Max loss = the net debit.** Always defined.
- **Max profit** is the peak of the tent at the strike, on front expiry day.
  Treat it as theoretical: it requires the underlying to pin the strike exactly.
- **Position size is calculated against the stop, not against max loss** — the
  exit plan cuts at 50% of the debit, so that is the loss you are actually
  underwriting.

---

## 4. Exit strategy

You asked me to suggest this part. Here it is, and it is the part that decides
whether the strategy works.

Calendars have an exit problem directional trades do not: the position can be
showing a profit and still be one gap away from unmanageable, because the short
front leg goes into gamma overdrive in its final sessions.

So the plan is a **ladder of six rules, all fixed at entry**, evaluated daily in
priority order. First one to fire wins.

### 1. Time stop — *the one that matters most*

**Close 2–3 sessions before the FRONT leg expires.** Non-negotiable.

Everything good about a calendar has already happened by then. What is left is
pin risk and assignment risk on a short leg whose gamma is going vertical. Put
the date in your calendar on day one.

### 2. Signal invalidation

**Exit when the reason you entered has gone**, on that day's close, whether the
trade is green or red:

- opposite Rohit Momentum crossover, or
- RSI crossing back through 50, or
- a daily close back through the Wavy Tunnel Filter against you

The strike sits where it does *because of the entry signal*. When the signal
flips, the tent is in the wrong place. This is the rule that ties the exit back
to the entry logic — without it you are running a theta trade with no thesis.

### 3. Hard stop — spread value at 50% of the net debit

Max loss is the full debit, but riding a calendar to zero is a choice, not a
risk. Cut at half. This is the number position sizing was calculated against.

### 4. Profit-zone breach

**Exit when the underlying closes outside the tent's breakevens.** Past those
levels the structure cannot make money at front expiry no matter how much time
is left. Holding on is hoping, not managing. Alternative: roll the whole spread
to a strike centred on the new price.

The UI also warns *before* the breach, once price is within 20% of the distance
to an edge.

### 5. Profit target — 125% of the net debit (+25%)

Calendars rarely reach the theoretical peak; that needs an exact pin on expiry
day. **Banking 20–30% is the realistic outcome.** Close, or take half off and
trail the rest to the time stop.

### 6. Volatility exit

**Exit if front IV drops more than ~3 points below back IV after entry.** The
theta edge you sold has been repriced away and you are now holding a pure
long-vega bet you did not sign up for.

### Rolling instead of closing

If the **time stop** fires with the thesis still intact — momentum unchanged,
underlying still inside the tent — buy back the front leg and sell the *next*
expiry at the same strike. That resets the calendar without paying full entry
cost again.

**Only roll a winner or a flat position.** Rolling a loser is averaging down
with extra steps.

### Priority summary

| # | Rule | Fires on |
|---|---|---|
| 1 | Time stop | Calendar date — always |
| 2 | Signal invalidation | Momentum / RSI / Tunnel flip |
| 3 | Hard stop | −50% of debit |
| 4 | Profit-zone breach | Underlying outside breakevens |
| 5 | Profit target | +25% of debit |
| 6 | Volatility exit | Term structure inverts against you |

Rules 1–5 produce an `EXIT` action. Rule 6 produces a `WARN` on its own.

---

## 5. Data requirements

| Need | Why | If missing |
|---|---|---|
| Multi-day futures archive (~200+ sessions) | Momentum, RSI, and the 169 EMA Tunnel | Fewer bars → Tunnel reports `tunnelReady: false`, RSI carries confirmation |
| High / Low columns | 34 EMA of High and of Low (the Wave *band*) | Falls back to Close; the Wave collapses to one line and is flagged |
| Options chain spanning **two expiries** | A calendar cannot exist otherwise | Symbol is listed under "signal fired but no calendar could be built" |
| `Underlying` column in the options file | Correct spot for strike selection | Falls back to the futures close, which carries basis — flagged in the UI |

---

## 6. Verifying the maths

```bash
npm run verify
```

103 assertions covering: EMA/RSI against hand calculations, Black-Scholes against
textbook reference values and put-call parity, implied-vol round-trips, crossover
alternation, Tunnel warm-up and the PW veto, calendar construction (recovered
IVs, positive theta, tent peaking at the strike), every exit rule firing on the
condition it is supposed to, and a full end-to-end run through the real CSV
parsers.

---

## 7. Module map

| File | Role |
|---|---|
| `indicators.js` | EMA, SMA, Wilder RSI, ROC, ATR, stdev, crossover detection |
| `black-scholes.js` | Pricing, implied vol (bisection), greeks, expiry parsing |
| `rohit-momentum.js` | The dual-line oscillator and crossover engine |
| `wavy-tunnel.js` | Wave / Tunnel / Filter / CAO and setup classification |
| `entry-signals.js` | RSI confirmation and the scored entry gate |
| `calendar-spread.js` | Expiry ladder, strike selection, payoff tent, sizing |
| `exit-rules.js` | The six-rule ladder and live position evaluation |
| `momentum-pipeline.js` | Orchestrator across the whole universe |

---

*Educational tooling, not trading advice. Every threshold here is a starting
point to be calibrated against your own instruments and back-tests.*
