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

## The score: REMOVED (owner decided 2026-11-25)
The 0-100 score failed its test (below) and is gone from the site: no rings, no "Score 60+" filter,
no score sort, no score alerts. The "Several insiders" filter went too: the site only knows CEO buys,
so it mostly counted a CEO buying again. "Know more" shows **The facts** instead, marked ✓/! only where
the test found the same pattern in both years. Alerts now fire for watchlist companies only.
**Rule: any new signal must pass `scripts/score_test/` (point-in-time, holdout year) before it ships.**

## Score test result (2026-11-24): FAILED
See `scripts/score_test/README.md`. 2,116 CEO buys (2025-01 to 2026-08), point-in-time, returns from
the day after filing. Score 60+ did significantly WORSE at 90 days (median -16% vs SPY, against -7%
for all CEO buys; company-level 95% range of the gap -21% to -3%). Holds against IWM and in both years.
Up to 65 points go to features that went with worse returns (40%+ drop, $1M+ size, the site's
"cluster", which mostly counts a CEO buying again). Consistent in both years: 10b5-1 and serial buying
(4+ in a year) are red flags; first-in-a-year and 2+ other insiders (any rank) are mildly positive.
Owner chose to remove it (2026-11-25).

## Order of work
1. ~~Check new fields on real filings~~ done: parser verified on 210 real filings.
2. ~~Test the score~~ done: failed (above).
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

Remembered per browser (localStorage, `cib_*` keys): watchlist, last-seen filing, alerts on/off,
ticker play choice (Reduce Motion only), buys filter, sort, Congress filter, last tab. A `#congress`
link beats the remembered tab. The search box is deliberately not remembered (a stale search looks
like missing data). Invalid saved values fall back to defaults; the site works with storage blocked.
Owner wants the site to remember options and preferences: persist any new setting the same way.

## Testing rule (learned 2026-11-25)
Insider and Congress rows share `.row__head`. A layout change for one broke the other on phones
(the score removal made Congress initials overlap names). Any row/layout change: check BOTH tabs at
375 px and 1280 px before shipping.
Run it: `node tests/devserver.js` (needs SEC_USER_AGENT), then `node tests/ui_check.js` (6 widths x 2 tabs;
fails on "—", undefined/NaN/null, "nightly/next update", overlapping rows, sideways scroll, page errors).

Phase 1 of the polish spec (nothing blank, nothing ambiguous) shipped 2026-11-25: rows and ticker show
"since buy", missing values are omitted (never "—"), header pill = Live / Checked Xm ago / Saved X ago.
Phases 2 (identity) and 3 (finish) in docs/superpowers/specs/2026-11-25-insider-view-polish-and-trust-design.md.

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
