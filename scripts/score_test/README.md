# Score test (backtest of the experimental score)

Does a high score on the site mean the stock did better afterwards? Run 2026-11-24.
**Result: no. Buys scoring 60+ did significantly worse than other CEO buys over 90 days.**

## Method
- **Data:** the SEC's quarterly Insider Transactions Data Sets (every Form 3/4/5), 2024 Q1 to 2026 Q3.
  `extract.py` pulls every open-market purchase (code P), mirroring the site's parser.
  Cross-checked against the site's own parser on 40 random real filings: shares, CEO and 10b5-1 flag
  match 40/40. Dollar values are within 0.8% (the data set rounds prices to the cent), and one
  shares-owned-after figure differs.
- **Sample:** every CEO open-market purchase of $25K or more (what the site lists), filed
  2025-01-01 to 2026-08-20: 2,381 buys, 2,116 tested. Dropped: 128 with no price data (often
  delisted, so the true results are probably *worse*), and 137 where the price paid didn't match the
  market price (stale or reused ticker).
- **Score:** `score.py` is an exact port of `score()` in `app.js`. It matched the live site on all
  210 current buys.
- **No look-ahead:** each buy is scored only with filings that existed on its filing date. The live
  site's "other insiders" points can grow later, which a test must not use.
- **Returns:** from the first close *after* the filing date (when the public could act) to 30 and 90
  calendar days later, compared with SPY (S&P 500) and IWM (small caps) over the same days.
- **Is it luck?** Bootstrap 95% ranges, resampling whole companies (a company with many buys
  counts once), plus a rank correlation between score and return.

## Results (median excess return)

| Group | Buys | 30 days vs SPY | 90 days vs SPY | 90 days vs IWM | Beat SPY at 90 days |
| --- | --- | --- | --- | --- | --- |
| All CEO buys | 2,116 | -1.2% | -6.7% | -7.7% | 37% |
| Score 60+ | 102 (81 companies) | -2.6% | **-16.2%** | **-16.8%** | 25% |
| Score 35-59 | 712 | -0.8% | -8.2% | | 39% |
| Score under 35 | 1,302 | -1.3% | -5.6% | | 38% |

- **90-day gap, 60+ minus the rest** (company-level 95% range): -21.3% to -3.1% vs SPY, and
  -16.1% to -3.7% vs IWM. Both ranges are entirely below zero, so the gap is not luck.
- **Rank correlation, score vs 90-day return:** -0.07 (p = 0.002). A higher score went with a
  *lower* return. At 30 days there's no meaningful difference.
- **Both years agree.** The 60+ group lagged in 2025 (-11.6%) and in 2026 Jan-Aug (-25.1%).
- **Pass test in the main README:** failed on every criterion.

## Each factor on its own (90 days vs IWM: with the factor minus without, in each year)

| Factor | 2025 | 2026 | What the score does with it |
| --- | --- | --- | --- |
| 10b5-1 pre-planned | -4.5 | -19.6 | -15 points (right direction) |
| 4+ CEO buys in prior year (serial buyer) | -2.7 | -6.1 | 0 of 10 (right direction) |
| Drop of 40%+ before the buy | -3.6 | -10.9 | **+20 (wrong direction)** |
| $1M+ buy | -3.7 | -14.2 | **+25 at $5M (wrong direction)** |
| Site's "cluster" (mostly the CEO buying repeatedly) | -4.7 | -6.8 | **+5 to +20 (wrong direction)** |
| Shares owned after unknown (held indirectly) | -4.5 | -16.9 | left out |
| 2+ *other insiders of any rank* bought within 30 days | +3.4 | +1.0 | not measured by the site |
| First CEO buy in 12 months | +1.9 | +2.4 | +10 (right direction, small effect) |

The score gives up to 65 of its 100 points to three features that went with *worse* returns in
both years. The site's "other insiders" factor doesn't measure what it says: the site only knows
CEO buys, so it mostly counts a CEO buying again. The version from the research (any insider) was
weakly positive.

## Caveats
- **Medians of single stocks usually trail an index,** because index returns are driven by a few
  big winners. So "the median CEO buy trailed IWM by 7.7%" overstates how badly CEO buys did in
  absolute terms. The *comparison between score groups* doesn't have this problem, and that's
  what the test is about.
- 21 months, mostly small companies, and one market regime. Treat the per-factor effects as leads
  to retest, not facts. They're small next to the noise, apart from 10b5-1 and the $1M+/40%-drop
  pattern.
- Delisted companies are missing (128 buys), which flatters the results.

## How to re-run
```
D=/some/folder; mkdir -p $D/raw   # download the YYYYqN_form345.zip files listed on the SEC's
                                  # "Insider Transactions Data Sets" page into $D/raw
python3 scripts/score_test/extract.py $D/raw $D/purchases.json
python3 scripts/score_test/prices.py $D          # optional parallel: prices.py $D k 4  for k=0..3
python3 scripts/score_test/backtest.py $D         # writes results.json and scored_buys.json
python3 scripts/score_test/robustness.py $D       # IWM benchmark, company-level bootstrap, by year
```
`results-2026-11-24.json` holds this run's full output.
