**WIP**
Vibe Coded w/ Claude, but the aim is to develop this as best it can be. 
**ALL WRITTEN WITH AI**
# CEO Buys

When and where CEOs buy their own company's stock, read straight from SEC Form 4 filings, plus trades
disclosed by members of Congress and the President. No build step, no framework.

## Files
- `index.html`, `style.css`, `app.js`, `extras.js`, `sw.js`: the site
- `data.js`: CEO buys (hand-checked starter rows with sources, then SEC rows from the updater)
- `politics.js`: politician trades (starter rows with sources, then official House/Senate rows)
- `prices.js`: daily closes for the charts (created by the updater)
- `api/live.js` + `vercel.json`: the live feed. Checks the SEC every 60 seconds when hosted on Vercel.
- `scripts/update_data.py` + `.github/workflows/update.yml`: the scheduled updater


## How fast can this get?
- **The legal floor:** the SEC publishes a Form 4 to everyone at the same moment. Nobody legally gets it earlier.
  Bloomberg-style terminals are faster at reading and sorting filings, not earlier at receiving them.
- **The law's delay:** CEOs have up to 2 business days after a trade to file. Nothing can show a trade before it is filed.
- **This site with Vercel:** about 1 to 2 minutes after the SEC posts (60-second checks plus a 60-second shared cache).
- **This site with GitHub Pages only:** about 10 to 20 minutes, sometimes more when GitHub runs late.
- **Even faster:** run `scripts/update_data.py` in a loop on an always-on server, or upgrade to a paid Vercel plan and lower the cache time.

## Accuracy rules
- Every card shows where its numbers came from. Every possible reason shows how we know and links its source.
- Labels: **SEC filing** read from the Form 4 itself > **Confirmed** (2+ reports agree) > **Reported** (one report) > **Unverified** (screenshot).
- Unverified rows stay out of all summaries, the dip list and the charts. They only appear in the full feed.
- Once SEC rows exist, the site shows only SEC rows.
- Only open-market purchases (code P) by someone whose title says CEO. Same-day purchases are added up and shown at the average price.
- A "~" before a price means it was worked out as value divided by shares.
- Politicians disclose amounts only as ranges. Holdings are filed once a year, so the site links to those reports instead of guessing.

## What was and was not tested
Tested: Form 4 parsing, House PTR text and Senate PTR table parsing, the full updater flow and the live endpoint against
mock servers, the live merge in a real browser, and every data row checked for a source and correct arithmetic.
Not tested: the real SEC, House, Senate, Yahoo, ntfy and Vercel servers, (for now)
