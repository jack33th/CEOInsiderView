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

## Deploy, step by step

Do this on a computer. GitHub's phone site can't upload a folder with subfolders.

### Part 1: Put it on GitHub (5 minutes)
1. Unzip `ceo-buys.zip`.
2. Go to github.com, sign in, click **+** (top right), then **New repository**. Name it `ceo-buys` and choose **Public**.
   Don't add a README. Click **Create repository**.
3. On the new repo page click **uploading an existing file**. Open the unzipped `ceo-buys` folder, select everything
   inside it and drag it into the browser. Check that `.github`, `api` and `scripts` are in the list.
   On a Mac, press Cmd+Shift+. in Finder to show the hidden `.github` folder.
4. Click **Commit changes**.
5. **Settings > Secrets and variables > Actions > New repository secret**.
   Name `SEC_USER_AGENT`, value your name and email, like `Syria Example you@email.com`. The SEC requires contact details.
   Optional: a second secret `NTFY_TOPIC` for phone alerts (see below).
6. **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
   Click **Update CEO buys > Run workflow**, choose `backfill`, then **Run workflow**.
7. Wait for the green check (a few minutes). Click the run and read the log. You should see lines like
   `Found N CEO purchases` and `Updated data.js`. If you see red, copy the log and send it to Claude.

### Part 2a: Simple hosting with GitHub Pages (free, about 10 to 20 minutes behind)
8. **Settings > Pages**. Under **Branch** pick `main` and `/ (root)`, then **Save**.
9. After a minute or two the page shows your link: `https://YOUR-NAME.github.io/ceo-buys/`.

### Part 2b: Faster hosting with Vercel (free, about 1 to 2 minutes behind). Recommended.
GitHub Pages can only serve files. Vercel can also run `api/live.js`, which checks the SEC every 60 seconds.
8. Go to vercel.com and **Sign up with GitHub**.
9. **Add New > Project**, pick the `ceo-buys` repo, click **Import**.
10. Framework preset: **Other**. Leave the build command and output folder empty.
11. Open **Environment Variables** and add `SEC_USER_AGENT` with the same value as in step 5.
12. Click **Deploy**. Your link looks like `https://ceo-buys-xxxx.vercel.app`.
13. Open the site. The top right should say **Live · checked Ns ago** with a green dot. If it still says
    "Updated ...", open `https://YOUR-LINK/api/live` to see the error message.
14. Vercel's free plan allows 100 deployments a day, and every commit by the updater is one deployment.
    The live feed already covers new CEO buys, so slow the updater down: in `.github/workflows/update.yml`, delete the line
    `- cron: "*/10 12-22 * * 1-5"`. The hourly and daily runs stay.

## Phone alerts when the site is closed (optional, free)
1. Install the **ntfy** app and subscribe to a topic name only you know, like `syria-ceo-buys-7k2q`.
2. Add the repo secret `NTFY_TOPIC` with the same name.
Anyone who guesses the name can read it, so make it hard to guess. The Alerts tab's own "Turn on" button only works
while the site is open.

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
Not tested: the real SEC, House, Senate, Yahoo, ntfy and Vercel servers, which can't be reached from where this was built.
Steps 7 and 13 above are the first real test.
