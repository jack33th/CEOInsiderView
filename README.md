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

## Score (0 to 100), experimental

Our own formula, built only from facts in the filing. Every point is shown with its source when you open a buy.

**Status: experimental.** The weights below are educated guesses from published research, not fitted or tested on this site's data. Until it passes a test, the site sorts by newest by default, the score isn't a headline number, and it's labelled "beta" wherever it appears.

**What would make it non-experimental:** using 12 months of CEO buys and the prices after them, buys scoring 60+ must beat both the median CEO buy and SPY over 30 and 90 days, across enough buys (at least 30 in each group) that the gap isn't luck. If they don't, the weights get changed or the score is removed.

| Factor | Points |
| --- | --- |
| Size of the buy ($25K = 0, $5M+ = 25) | 0 to 25 |
| How much the stake grew | 0 to 25 |
| Drop from the 90-day high before the buy | 0 to 20 |
| Other insiders buying within 30 days | 0 to 20 |
| First CEO buy at this company in 12 months | 0 to 10 |
| Pre-scheduled under a 10b5-1 plan | minus 15 |

Factors that can't be checked yet are left out and the rest is scaled to 100, so missing data doesn't pull a score down. It is not proven to predict returns: the Track record panel measures that as buys turn 30 days old.

## How fast can this get?

The legal floor is the filing itself: CEOs have 2 business days to file. The site shows a filing about 1 to 2 minutes after the SEC publishes it (live endpoint), and the hourly Action makes it permanent. Congress trades can be up to 45 days late by law.

## Accuracy rules

- Only open-market purchases (Form 4 code P) count as buys. Option exercises, grants and gifts are excluded.
- Every row links to the original filing.
- No photos of real people or company logos: avatars are initials.

