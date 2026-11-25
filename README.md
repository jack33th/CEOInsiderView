**WIP**
Vibe Coded w/ Claude, but the aim is to develop this as best it can be. 
**ALL WRITTEN WITH AI**
# CEO Insider View

Tracks when CEOs buy their own company's stock, straight from SEC Form 4 filings, plus stock trades disclosed by members of Congress. Static site on Vercel, refreshed by a GitHub Action.

## Files

| File | What it is | Who writes it |
| --- | --- | --- |
| `index.html`, `style.css`, `app.js` | The whole site (one script, no build step) | You |
| `sw.js`, `vercel.json` | Offline cache and hosting settings | You |
| `api/live.js` | Checks the SEC's live filing feed every 30 s while someone has the page open | You |
| `scripts/update_data.py` | Collects filings, prices, company details and Congress trades | You |
| `.github/workflows/main.yml` | Runs the updater hourly, plus a full refresh daily | You |
| `data.js` | CEO buys (last 120 days) | The Action |
| `spark.js` | Last 2 months of closes + latest quote per ticker (small, loads with the page) | The Action |
| `prices/TICKER.json` | Full 1-year price history, loaded only when a chart opens | The Action |
| `companies.js` | Industry, shares outstanding, 12-month CEO buy/sell history, loaded on "Know more" | The Action |
| `politics.js` | Congress trades, loaded only when the Congress tab opens | The Action |

You never edit the Action-written files by hand.

Secrets stay in GitHub/Vercel settings only: `SEC_USER_AGENT` (name + email, required by the SEC) and optional `NTFY_TOPIC` for phone alerts. Never put them in a file.

## No score (removed 2026-11-24)

The site used to rank buys with a 0 to 100 "conviction" score built from size, stake growth, the drop
before the buy, other buys nearby, a first buy in a year, and 10b5-1 plans. We tested it on 2,116 CEO
buys filed in 2025 and 2026 (`scripts/score_test/`). Buys scoring 60+ did significantly *worse* than other
CEO buys over 90 days, in both years, so the score was removed.

Each buy now shows the same facts plainly. Where the test found a pattern in both years, the fact is
marked: ✓ for slightly better (first CEO buy in a year), ! for worse (10b5-1 pre-planned, 4+ CEO buys in a
year, a 40%+ drop before the buy). These describe past results, not predictions. Any new signal must pass
the same test before it appears on the site.

## How fast can this get?

The legal floor is the filing itself: CEOs have 2 business days to file. The site shows a filing about 1 to 2 minutes after the SEC publishes it (live endpoint), and the hourly Action makes it permanent. Congress trades can be up to 45 days late by law.

## Accuracy rules

- Only open-market purchases (Form 4 code P) count as buys. Option exercises, grants and gifts are excluded.
- Every row links to the original filing.
- No photos of real people or company logos: avatars are initials.

