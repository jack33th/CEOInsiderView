# Insider View: polish and trust (design)

Date: 2026-11-25 · Status: approved in brainstorming, awaiting spec review · Owner: site owner

## Goal

Get the site to the owner's bar of "good enough for other people". Today the owner is the only
user. The site feels plain and unfinished, things break or go blank, and some numbers are hard
to trust. The visual direction is mockup **A · Clean app**, chosen from three on the design canvas
"CEO Insider View look directions". The site is renamed **Insider View**.

Ground rules from `CLAUDE.md` still hold: never present an untested claim as fact, every number
links to its source, no new "signal" without passing `scripts/score_test/`, and no frameworks,
accounts or paid data.

## Delivery: three small releases

Each release is its own PR to `main`. The owner checks it on their own phone and computer before
the next one starts.

| Release | Theme | Done when |
| --- | --- | --- |
| 1 | Nothing blank, nothing ambiguous | No placeholder text anywhere; every number says what it is |
| 2 | Identity | New name, logo, colour, type and rows; slimmer phone header; works on phones and computers |
| 3 | Finish | "How it works" page, honest track record, shareable links, footer, basic link preview |

## Cross-cutting rule: phones and computers

Every release must work at these widths: 375, 390, 412 (phones), 768 (tablet), 1280 (laptop)
and 1920 (large monitor).

- **Under 768 px:** one column; tap targets at least 44 px; the chart opens as a bottom sheet
  (as today); the header slims on scroll (Release 2).
- **768 px and up:**
  - content in a centred column, at most 960 px wide;
  - rows show the full CEO name and filed date without truncation;
  - the chart opens as a centred dialog (Esc closes it, focus returns to the button);
  - hover states for mouse users, and everything reachable by keyboard;
  - the header stays full size.
- **Testing limit:** this environment only has Chromium. Safari (iPhone) and Firefox can't be
  tested here, so the owner's own device check is part of each release.

## Release 1: nothing blank, nothing ambiguous

1. **Rows show the move since the buy:** "+4.3% since buy", from the latest close against the
   price the CEO paid. Without a price, the row shows "paid $4.35". Today's move appears only in
   the detail panel, labelled "today".
2. **Missing facts are omitted, never dashed.**
   - The detail panel's key/value list drops any entry with no value.
   - In "The facts":
     - Drop before the buy unknown: the line is omitted.
     - 12-month history not loaded: the line is omitted.
     - Stake growth, two cases. If the trade row *has* an `ownedAfter` key set to null, the filing
       reported no direct holding, and the line reads "Shares held indirectly (for example through
       a trust), so stake growth isn't shown". If the key is *absent*, it's a row from the old
       parser, and the line is omitted.
   - No visitor-facing text mentions "nightly update", "next update" or "not tracked yet".
3. **One honest freshness label**, in the header pill:
   - "Live", only when `/api/live` answered within the last 2 minutes;
   - "Checked 14m ago" when the last successful check is older;
   - "Saved data, Nov 24 1:33 PM ET" when no live check has succeeded this visit.

   Chart readouts show the date of the close ("Close, Nov 24").
4. **Empty panels are hidden.** The Track record panel isn't rendered until at least 8 buys have
   30-day results. Release 3 replaces it.
5. **Calm errors.** If `/api/live` fails, the list keeps working from saved data, and the
   summary line adds "Live check unavailable; showing saved data". Price and chart failures show
   "Price history isn't available for TICKER" (already handled by `/api/prices`).

## Release 2: identity

1. **Name:** "Insider View" in the header, `<title>`, notifications, `document.title` updates,
   README and `CLAUDE.md`. Tagline under the name: "CEO stock buys, straight from SEC filings".
2. **Logo:** a rising line ending in a dot, inside a rounded square (as in mockup A), as inline
   SVG in the header. Also `favicon.svg`, plus a 180 px `apple-touch-icon.png` rendered once from
   the SVG and committed. It replaces the yellow placeholder box.
3. **Colour:** the accent token becomes blue `#4C8DFF` (links, active chip, focus ring, buy
   marker). Green and red stay for up and down. Text on the accent and accent-coloured text must
   pass 4.5:1 contrast; use a lighter blue such as `#7FB0FF` for small text on dark if needed.
4. **Type:** Inter (text) and Inter Tight (large numbers, brand) from Google Fonts with
   `display=swap`, falling back to today's system stack.
5. **Rows as in mockup A:**
   - a ticker tile, the company, then "CEO name · Filed 2d ago", and the amount in bold;
   - the Release 1 since-buy line;
   - at most one fact tag per row, chosen in this order: Pre-planned (10b5-1) → Frequent buyer
     (4+ CEO buys in the prior 12 months) → First buy in a year → Fell 40%+ before the buy.

   The tags use only facts already shown in "The facts" and tested by `scripts/score_test/`.
6. **Summary as three big stats:** buys, total value and companies for the period shown.
7. **Slimmer phone header (under 768 px):** scrolling down slides the ticker bar away and
   reduces header padding; scrolling up restores both. The tabs stay visible. With Reduce
   Motion on, the change is instant.
8. **Computers:** the centred column, the chart dialog and wider rows from the cross-cutting rule.

## Release 3: finish

1. **`about.html`, "How it works":** a static page with the site's styles, linked from the
   footer (not a new tab). Sections:
   - where the data comes from (Form 4, code P, CEOs only, $25K minimum);
   - how fresh it is (2 business days to file, live checks every 30 s);
   - what ✓ and ! mean, with the test's headline numbers and a link to
     `scripts/score_test/README.md`;
   - what isn't included;
   - limits;
   - "Not investment advice."
2. **Track record:**
   - A dated summary from `scripts/score_test/results-2026-11-24.json`: "Of 2,116 CEO buys filed
     in 2025–26, the typical one trailed the S&P 500 by 6.7% over 90 days; 37% beat it."
   - Below it, a live tally of the site's own buys that have reached 30 and 90 days (median move
     and share that beat the S&P 500). It's shown only once at least 8 buys qualify.
   - The numbers are copied from the results file in one place in `app.js`, with the file named
     in a comment.
3. **Shareable links:**
   - **`#buy/<id>`** opens the Insider buys tab with that buy expanded and scrolled into view.
     The detail panel gains a **Copy link** button with a "Link copied" toast.
   - **`#TICKER`** (letters, digits and `.`, matching a listed ticker) filters to that company and
     shows a removable "Company: UPST" chip. The words `buys` and `congress` are routes, never
     tickers, and are checked first.
   - Links beat remembered settings, as `#congress` already does. An unknown id or ticker falls
     back to the normal list with a toast saying it wasn't found.
4. **Footer:** data sources (SEC EDGAR, Yahoo Finance / Stooq for prices), last data update,
   "Not investment advice", and links to How it works and the test.
5. **Basic link preview:** `og:title`, `og:description` and `twitter:card` (summary, no image).
   The image waits for public launch.

## How the pieces fit (`app.js` units)

| Unit | Does | Release |
| --- | --- | --- |
| `sinceLabel(t)` | Builds the row's labelled since-buy line from the quote and price paid | 1 |
| `facts(t)` | Returns only the facts that exist, with the stake wording rules | 1 |
| `freshness()` | Returns the header pill text and state from the last live-check time and the saved data time | 1 |
| `pickTag(t)` | Returns at most one tag by the fixed priority | 2 |
| `header` scroll handler | Toggles a `is-compact` class under 768 px; respects Reduce Motion | 2 |
| `route()` | Reads `location.hash`: `congress`, `buy/<id>`, a ticker, or none; called on load and on `hashchange` | 3 |
| `TEST_SUMMARY` | Constant holding the backtest headline numbers | 3 |

The data pipeline (`scripts/update_data.py`, `api/live.js`, `api/prices.js`) doesn't change, apart
from renaming text strings.

## Testing

- `tests/devserver.js`: a local stand-in for Vercel (static files plus `/api/live` and
  `/api/prices`), committed so anyone can run the site locally.
- `tests/ui_check.js`: a Playwright script that loads the site at all six widths and:
  - opens every row's detail panel;
  - fails if the rendered text contains "—", "undefined", "NaN", "null", "nightly update" or
    "next update";
  - fails on any page error;
  - saves a screenshot per width.
- Release 2 adds a contrast check of the colour tokens. Release 3 adds route tests: `#buy/<id>`
  opens that buy, `#UPST` filters, an unknown hash falls back with a toast, and `#congress` still
  works.
- Before each merge, the owner checks the Vercel preview on their own phone and computer.

## Out of scope

Alerts with the tab closed (project B), full company pages (C), collecting all insiders (E), a
link-preview image, accounts, frameworks, and any new signal that hasn't passed the score test.
