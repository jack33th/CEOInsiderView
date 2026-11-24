# CEO Insider View: project notes for Claude

Read this first. It carries decisions between sessions, since Claude doesn't remember past chats.
Update it when a decision changes.

## What the site is
CEO open-market stock purchases from SEC Form 4 filings, each linked to its source, plus a
secondary Congress tab. Static site on Vercel (`index.html`, `app.js`, `style.css`), data written
by a GitHub Action running `scripts/update_data.py` (hourly live feed, daily re-scan).

## Ground rules agreed with the owner
- **Functional first, looks later.** The design is frozen, not thrown away: no new visual polish
  until the core works. Clear and fast still count as functional.
- **Never present an untested claim as fact.** Every number links to its source.
- **Ship each step to the live site** (via a PR to `main`) rather than building unseen for weeks.
- "Functional" means: pipeline runs on real SEC filings; the score has been tested against past
  results; alerts reach people with the tab closed; every number links to its source.
- The owner is fairly new to git/PRs: explain steps plainly, and give honest pushback (see
  their preferences), not agreement by default.

## The score: EXPERIMENTAL (decided 2026-11-24)
- Weights are educated guesses from research, not tested. `SCORE_EXPERIMENTAL = true` in `app.js`
  keeps rings neutral grey, labels it beta, keeps it out of headline stats; default sort = newest.
- **Pass test:** using 12 months of CEO buys + prices, buys scoring 60+ must beat both the median
  CEO buy and SPY at 30 and 90 days, with at least 30 buys per group. Also report each factor on
  its own; a single factor may be worth keeping as a filter even if the total fails.
- **No overfitting:** if weights are tuned, tune on the first ~8 months and judge only on the last ~4.
- If it fails: change the weights (with the holdout rule) or remove the score. Don't keep it just
  because it makes the site look smarter.
- A score built from 3 of 5 factors is not comparable to one from 5; keep showing factor coverage.

## Order of work
1. ~~Check new fields on real filings~~ done: parser verified on 210 real filings.
2. **Test the score** (next, the main point). Needs the 12-month history in `companies.js`.
3. Functional fixes: per-company links (`/#TICKER`), CSV export of the filtered list, RSS feed +
   public ntfy topic (real alerts with the tab closed), give Congress less space, earnings timing
   (8-K item 2.02: a buy weeks before earnings says more than one right after).
4. Then the looks.

Done so far: "Bought the dip" cutoff 25% → 40% (25% matched ~60% of buys); daily run re-scans
10 days not 120 (`--scan-days`); Congress refresh daily not hourly; failure alert via
`NTFY_ADMIN_TOPIC`; 12-month history marked `complete` before it's used (half-read history was
scoring as "first buy in a year"); ticker bar auto-scrolls in JS, swipeable, tappable.

Ticker bar, owner's choices: no pause button for normal visitors (hover, touch and keyboard focus
pause it instead). Mouse leaving resumes instantly; a finger lifting resumes after 1.5s. A mouse
click must not freeze it (only keyboard focus pauses). Visitors with Reduce Motion on get a still,
swipeable strip plus a play/stop button only they see; the choice is remembered (`cib_tape`).
Don't override Reduce Motion for everyone: the owner chose this over always-scroll.

## Leave out
Guesses at why a CEO bought, more tabs, a "trending" page. Not needed yet: a database, user
accounts, React or another framework, paid data feeds.

## Known weak spots still open
- Browser alerts only work while the tab is open (fix = RSS + public ntfy).
- Track record panel is near-empty until buys age past 30 days / history fills in.
- Header + ticker + tabs take a lot of a phone screen; the ticker could scroll away.
- Congress data (up to 45 days late, dollar ranges) is a different kind of signal; don't give it equal weight.

## Environment notes
- Cloud environment "CEOInsiderView" allows SEC (`www.sec.gov`, `data.sec.gov`), Yahoo prices,
  Stooq (still refused as of 2026-11-24; Yahoo is primary), House/Senate disclosure sites, ntfy.sh.
- The SEC needs `SEC_USER_AGENT` with contact details (stored as a GitHub secret; never commit it).
- SEC rate limit is 10 requests/second; the updater stays near 6. Don't run two updaters at once.
- `CEO_DATA_JS`, `CEO_COMPANIES_JS`, etc. redirect the updater's output, so tests can write to a
  scratch folder instead of the repo's data files.
- Data files (`data.js`, `spark.js`, `prices/`, `politics.js`, `companies.js`) are written by the
  Action only. Don't commit them from a feature branch: it conflicts with the Action's commits.
