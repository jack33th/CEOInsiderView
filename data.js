/* Starter data, hand-checked on 2026-11-22. scripts/update_data.py replaces it with rows parsed from SEC filings.
   source: "sec" = parsed from the Form 4 itself | "confirmed" = 2+ independent reports of the filing agree
           "reported" = one report | "screenshot" = from an app screenshot, NOT verified
   approxPrice: price worked out as value / shares from a report. filedOn: date the Form 4 was filed, where known.
   dip.src / sources: where each number came from. */
window.INSIDER_DATA = {
  "updated": "2026-11-22",
  "coverage": "Starter set: CEO open-market buys found for Nov 2 to Nov 20, 2026. Not the full market.",
  "trades": [
    {
      "id": "intc-20261102", "ticker": "INTC", "company": "Intel", "exchange": "NASDAQ",
      "insider": "Lip-Bu Tan", "title": "Chief Executive Officer", "date": "2026-11-02", "filedOn": "2026-11-04",
      "shares": 150000, "price": 64.7312, "value": 9709680,
      "dip": { "pct": 49, "base": "late-September peak (about $127)",
               "how": "Paid $64.73. Calcalist reports the peak was nearly $127 in late September. ($127 - $64.73) / $127 = 49%.",
               "src": { "label": "Calcalist", "url": "https://www.calcalistech.com/ctechnews/article/01v2bwe2s" } },
      "sinceBought": null, "source": "confirmed",
      "note": "Bought through his family trust one trading day after Intel fell 28.6% in a single day on a weak forecast. His earlier buy in August was at $95, so both buys were under water when this was filed.",
      "sources": [
        { "label": "Calcalist", "url": "https://www.calcalistech.com/ctechnews/article/01v2bwe2s" },
        { "label": "FourWeekMBA (reads the Form 4)", "url": "https://fourweekmba.com/ai-intel-ceo-tan-has-bought-19-7m-of-stock-at-an-average-77/" },
        { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Intel+CEO+Lip-Bu+Tan+Buys+$9.7+Million+in+Stock+Amid+Extended+Selloff" },
        { "label": "SEC: his August Form 4", "url": "https://www.sec.gov/Archives/edgar/data/0000050863/000005086326000177/form4.xml" }
      ]
    },
    {
      "id": "glxy-20261105", "ticker": "GLXY", "company": "Galaxy Digital", "exchange": "NASDAQ",
      "insider": "Michael Novogratz", "title": "Founder and CEO", "date": "2026-11-05", "filedOn": "2026-11-05",
      "shares": 760000, "price": 12.98, "value": 9864346,
      "dip": { "pct": 41, "base": "Oct 6 close (one month earlier)",
               "how": "Reported drop of about 41% between the Oct 6 close and Nov 5.",
               "src": { "label": "CryptoBriefing", "url": "https://cryptobriefing.com/novogratz-buys-galaxy-shares-stock-decline/" } },
      "sinceBought": null, "source": "confirmed",
      "note": "Bought in two blocks the day the stock fell 7%, after a 17% drop the day before. He said publicly he saw a gap between the share price and what the company is worth.",
      "sources": [
        { "label": "CryptoBriefing", "url": "https://cryptobriefing.com/novogratz-buys-galaxy-shares-stock-decline/" },
        { "label": "Massive (Form 4 data)", "url": "https://massive.com/quote/glxy/insider-trading" }
      ]
    },
    {
      "id": "adtn-20261106", "ticker": "ADTN", "company": "ADTRAN Holdings", "exchange": "NASDAQ",
      "insider": "Thomas Stanton", "title": "Chairman and CEO", "date": "2026-11-06",
      "shares": 150000, "price": 4.01, "value": 601500,
      "dip": null, "sinceBought": null, "source": "confirmed",
      "note": "Raised his direct holding by about 12%. He also bought about $300K in November 2025.",
      "sources": [
        { "label": "DailyPolitical", "url": "https://www.dailypolitical.com/?p=10576720" },
        { "label": "Massive (Form 4 data)", "url": "https://massive.com/quote/adtn/insider-trading" },
        { "label": "Company notice (EQS)", "url": "https://www.placera.se/pressmeddelanden/adtran-adtran-holdings-inc-thomas-r-stanton-acquisition-of-150-000-shares-in-adtran-holdings-inc-isin-us00486h1059-20261112" }
      ]
    },
    {
      "id": "psec-20261109", "ticker": "PSEC", "company": "Prospect Capital", "exchange": "NASDAQ",
      "insider": "John Barry", "title": "Chief Executive Officer", "date": "2026-11-09",
      "shares": 2604262, "price": 1.5082, "value": 3927748,
      "dip": null, "sinceBought": null, "source": "confirmed", "note": "Bought again the next day.",
      "sources": [
        { "label": "Kalkine", "url": "https://kalkine.com/news/announcements/john-f-barry-iii-buys-4m-psec-shares-at-151" },
        { "label": "SEC Form 4", "url": "https://www.sec.gov/Archives/edgar/data/0001287032/000129435726000020/wk-form4_1794576401.xml" }
      ]
    },
    {
      "id": "psec-20261110", "ticker": "PSEC", "company": "Prospect Capital", "exchange": "NASDAQ",
      "insider": "John Barry", "title": "Chief Executive Officer", "date": "2026-11-10",
      "shares": 1410633, "price": 1.5077, "value": 2126811,
      "dip": null, "sinceBought": null, "source": "confirmed", "note": "",
      "sources": [
        { "label": "Kalkine", "url": "https://kalkine.com/news/announcements/john-f-barry-iii-buys-4m-psec-shares-at-151" }
      ]
    },
    {
      "id": "fip-20261110", "ticker": "FIP", "company": "FTAI Infrastructure", "exchange": "NASDAQ",
      "insider": "Kenneth Nicholson", "title": "CEO and President", "date": "2026-11-10",
      "shares": 400000, "price": 3.83, "value": 1530000,
      "dip": null, "sinceBought": null, "source": "confirmed", "note": "Raised his holding by about 18%.",
      "sources": [
        { "label": "Simply Wall St (via Webull)", "url": "https://www.webull.com/news/15922340915769344" },
        { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+12%2C+2026" }
      ]
    },
    {
      "id": "hos-20261110", "ticker": "HOS", "company": "Hornbeck Offshore Services", "exchange": null,
      "insider": "Todd Hornbeck", "title": "President and CEO", "date": "2026-11-10", "approxPrice": true,
      "shares": 189569, "price": 5.275, "value": 999981,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+12%2C+2026" } ]
    },
    {
      "id": "csqr-20261111", "ticker": "CSQR", "company": "Csquare", "exchange": "NASDAQ",
      "insider": "Spencer Mullee", "title": "CEO and Director", "date": "2026-11-11", "filedOn": "2026-11-12",
      "shares": 13573, "price": 18.20, "value": 247029,
      "dip": null, "sinceBought": null, "source": "reported",
      "note": "The filing says the buy was made during an open trading window.",
      "sources": [ { "label": "Kalkine (reads the Form 4)", "url": "https://kalkine.com/news/announcements/csquare-ceo-mullee-buys-13573-shares-at-1820" } ]
    },
    {
      "id": "ecx-20261111", "ticker": "ECX", "company": "ECARX Holdings", "exchange": null,
      "insider": "Ziyu Shen", "title": "Chief Executive Officer", "date": "2026-11-11", "approxPrice": true,
      "shares": 300000, "price": 0.779, "value": 233670,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+13%2C+2026" } ]
    },
    {
      "id": "bh-20261112", "ticker": "BH", "company": "Biglari Holdings", "exchange": "NYSE",
      "insider": "Sardar Biglari", "title": "Chairman and CEO", "date": "2026-11-12", "approxPrice": true,
      "shares": 2012, "price": 1768.1, "value": 3557195,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+13%2C+2026" } ]
    },
    {
      "id": "hubs-20261113", "ticker": "HUBS", "company": "HubSpot", "exchange": "NYSE",
      "insider": "Brian Halligan", "title": "CEO (returned Nov 12)", "date": "2026-11-13", "filedOn": "2026-11-16",
      "shares": 22985, "price": 217.44, "value": 4997858,
      "dip": { "pct": 47, "base": "52-week high",
               "how": "TIKR reports HubSpot was 47% below its 52-week high when he bought.",
               "src": { "label": "TIKR", "url": "https://www.tikr.com/blog/hubspot-is-47-below-its-high-its-co-founder-is-back-for-a-refounding-and-bought-5-million" } },
      "sinceBought": null, "source": "confirmed",
      "note": "Bought the day after returning as CEO. His Form 4 says he owes HubSpot $449,642 under the short-swing profit rule because of earlier sales.",
      "sources": [
        { "label": "TIKR", "url": "https://www.tikr.com/blog/hubspot-is-47-below-its-high-its-co-founder-is-back-for-a-refounding-and-bought-5-million" },
        { "label": "The Cerbat Gem (reads the Form 4)", "url": "https://www.thecerbatgem.com/?p=10474672" }
      ]
    },
    {
      "id": "kura-20261113", "ticker": "KURA", "company": "Kura Oncology", "exchange": null,
      "insider": "Troy Wilson", "title": "President and CEO", "date": "2026-11-13", "approxPrice": true,
      "shares": 98881, "price": 7.63, "value": 754462,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+17%2C+2026" } ]
    },
    {
      "id": "hos-20261113", "ticker": "HOS", "company": "Hornbeck Offshore Services", "exchange": null,
      "insider": "Todd Hornbeck", "title": "President and CEO", "date": "2026-11-13", "approxPrice": true,
      "shares": 85912, "price": 5.82, "value": 500000,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+16%2C+2026" } ]
    },
    {
      "id": "crmd-20261113", "ticker": "CRMD", "company": "CorMedix", "exchange": null,
      "insider": "Joseph Todisco", "title": "Chief Executive Officer", "date": "2026-11-13", "approxPrice": true,
      "shares": 80000, "price": 4.89, "value": 391200,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+16%2C+2026" } ]
    },
    {
      "id": "brsp-20261116", "ticker": "BRSP", "company": "BrightSpire Capital", "exchange": null,
      "insider": "Michael Mazzei", "title": "Chief Executive Officer", "date": "2026-11-16", "approxPrice": true,
      "shares": 228463, "price": 3.28, "value": 749358,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+17%2C+2026" } ]
    },
    {
      "id": "scm-20261117", "ticker": "SCM", "company": "Stellus Capital Investment", "exchange": null,
      "insider": "Robert Ladd", "title": "President and CEO", "date": "2026-11-17", "approxPrice": true,
      "shares": 30000, "price": 6.57, "value": 197100,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+20%2C+2026" } ]
    },
    {
      "id": "cgon-20261118", "ticker": "CGON", "company": "CG Oncology", "exchange": null,
      "insider": "Arthur Kuan", "title": "Chairman and CEO", "date": "2026-11-18",
      "shares": null, "price": 78.88, "value": 2400000,
      "dip": null, "sinceBought": null, "source": "reported",
      "also": ["Isabel Kalofonos (Chief Commercial Officer) bought the same day"],
      "note": "Came two days after a Phase 3 trial win and one day after an analyst downgrade. The value is TIKR's rounded figure.",
      "sources": [ { "label": "TIKR", "url": "https://www.tikr.com/blog/cg-oncology-ceo-insider-buying-phase-3-trial-stock" } ]
    },
    {
      "id": "sagt-20261119", "ticker": "SAGT", "company": "Sagtec Global", "exchange": null,
      "insider": "Ng Chen Lok", "title": "Chief Executive Officer", "date": "2026-11-19", "approxPrice": true,
      "shares": 260000, "price": 1.03, "value": 267800,
      "dip": null, "sinceBought": null, "source": "reported", "note": "",
      "sources": [ { "label": "Quiver Quantitative", "url": "https://www.quiverquant.com/news/Insider+Stock+Purchases%3A+November+20%2C+2026" } ]
    },
    {
      "id": "upst-20261119", "ticker": "UPST", "company": "Upstart", "exchange": "NASDAQ",
      "insider": "Paul Gu", "title": "Chief Executive Officer", "date": "2026-11-19",
      "shares": null, "price": 17.20, "value": 860000,
      "dip": { "pct": 44, "base": "90-day peak", "how": "Figure shown in the app screenshot. Not checked.", "src": null },
      "sinceBought": -9.0, "source": "screenshot",
      "note": "Not found in any public report I checked as of Nov 22. Treat as unverified until the SEC updater confirms it.",
      "sources": []
    },
    {
      "id": "glxy-20261120", "ticker": "GLXY", "company": "Galaxy Digital", "exchange": "NASDAQ",
      "insider": "Michael Novogratz", "title": "Founder and CEO", "date": "2026-11-20",
      "shares": null, "price": 11.73, "value": 4900000,
      "dip": { "pct": 57, "base": "90-day peak", "how": "Figure shown in the app screenshot. Not checked.", "src": null },
      "sinceBought": -4.4, "source": "screenshot",
      "note": "Not found in any public report I checked as of Nov 22. Form 4 trackers list only his Nov 5 buy. Treat as unverified.",
      "sources": []
    }
  ]
};
