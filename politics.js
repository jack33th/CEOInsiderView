/* Politician trades. Starter rows were hand-collected from news and tracker sites ("reported").
   scripts/update_data.py adds rows parsed from the House Clerk and Senate eFD ("official").
   Amounts are ranges because that is all the law requires politicians to disclose.
   filedApprox: true means the date is when a news report appeared, close to but not exactly the filing date. */
window.POLITICS_DATA = {
 "updated": "2026-11-22",
 "trades": [
  {
   "id": "hern-nvda-20261023",
   "name": "Kevin Hern",
   "role": "House",
   "party": "R",
   "state": "OK",
   "ticker": "NVDA",
   "company": "NVIDIA",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-23",
   "filed": "2026-11-05",
   "source": "reported",
   "sources": [
    {
     "label": "MarketBeat",
     "url": "https://www.marketbeat.com/congress-stock-trades/"
    }
   ]
  },
  {
   "id": "sessions-pep-20261021",
   "name": "Pete Sessions",
   "role": "House",
   "party": "R",
   "state": "TX",
   "ticker": "PEP",
   "company": "PepsiCo",
   "type": "sell",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-21",
   "filed": "2026-10-27",
   "source": "reported",
   "sources": [
    {
     "label": "MarketBeat",
     "url": "https://www.marketbeat.com/congress-stock-trades/"
    }
   ]
  },
  {
   "id": "rulli-goog-20261016",
   "name": "Michael Rulli",
   "role": "House",
   "party": "R",
   "state": "OH",
   "ticker": "GOOG",
   "company": "Alphabet",
   "type": "sell",
   "amount": "$50,001 - $100,000",
   "traded": "2026-10-16",
   "filed": "2026-10-19",
   "source": "reported",
   "sources": [
    {
     "label": "MarketBeat",
     "url": "https://www.marketbeat.com/congress-stock-trades/"
    }
   ]
  },
  {
   "id": "taylor-t-20261015",
   "name": "David Taylor",
   "role": "House",
   "party": "R",
   "state": "OH",
   "ticker": "T",
   "company": "AT&T",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-15",
   "filed": "2026-10-29",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62744010"
    }
   ]
  },
  {
   "id": "taylor-lrcx-20261015",
   "name": "David Taylor",
   "role": "House",
   "party": "R",
   "state": "OH",
   "ticker": "LRCX",
   "company": "Lam Research",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-15",
   "filed": "2026-10-29",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62744010"
    }
   ]
  },
  {
   "id": "taylor-pld-20261015",
   "name": "David Taylor",
   "role": "House",
   "party": "R",
   "state": "OH",
   "ticker": "PLD",
   "company": "Prologis",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-15",
   "filed": "2026-10-29",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62744010"
    }
   ]
  },
  {
   "id": "taylor-mpc-20261015",
   "name": "David Taylor",
   "role": "House",
   "party": "R",
   "state": "OH",
   "ticker": "MPC",
   "company": "Marathon Petroleum",
   "type": "sell",
   "amount": "$1,001 - $15,000",
   "traded": "2026-10-15",
   "filed": "2026-10-29",
   "filedApprox": true,
   "source": "reported",
   "note": "Two separate sales of this size were reported the same day.",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62744010"
    }
   ]
  },
  {
   "id": "jackson-ddog-20260928",
   "name": "Jonathan Jackson",
   "role": "House",
   "party": "D",
   "state": "IL",
   "ticker": "DDOG",
   "company": "Datadog",
   "type": "buy",
   "amount": "$50,001 - $100,000",
   "traded": "2026-09-28",
   "filed": "2026-10-19",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62471139"
    }
   ]
  },
  {
   "id": "jackson-el-20260928",
   "name": "Jonathan Jackson",
   "role": "House",
   "party": "D",
   "state": "IL",
   "ticker": "EL",
   "company": "Estee Lauder",
   "type": "buy",
   "amount": "$50,001 - $100,000",
   "traded": "2026-09-28",
   "filed": "2026-10-19",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62471139"
    }
   ]
  },
  {
   "id": "jackson-gh-20260928",
   "name": "Jonathan Jackson",
   "role": "House",
   "party": "D",
   "state": "IL",
   "ticker": "GH",
   "company": "Guardant Health",
   "type": "buy",
   "amount": "$15,001 - $50,000",
   "traded": "2026-09-28",
   "filed": "2026-10-19",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62471139"
    }
   ]
  },
  {
   "id": "jackson-vsat-20260928",
   "name": "Jonathan Jackson",
   "role": "House",
   "party": "D",
   "state": "IL",
   "ticker": "VSAT",
   "company": "Viasat",
   "type": "sell",
   "amount": "$50,001 - $100,000",
   "traded": "2026-09-28",
   "filed": "2026-10-19",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62471139"
    }
   ]
  },
  {
   "id": "jackson-wmt-20260928",
   "name": "Jonathan Jackson",
   "role": "House",
   "party": "D",
   "state": "IL",
   "ticker": "WMT",
   "company": "Walmart",
   "type": "sell",
   "amount": "$50,001 - $100,000",
   "traded": "2026-09-28",
   "filed": "2026-10-19",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62471139"
    }
   ]
  },
  {
   "id": "fields-goog-20260914",
   "name": "Cleo Fields",
   "role": "House",
   "party": "D",
   "state": "LA",
   "ticker": "GOOG",
   "company": "Alphabet",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-09-14",
   "filed": "2026-10-01",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62137517"
    }
   ]
  },
  {
   "id": "fields-nflx-20260914",
   "name": "Cleo Fields",
   "role": "House",
   "party": "D",
   "state": "LA",
   "ticker": "NFLX",
   "company": "Netflix",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-09-14",
   "filed": "2026-10-01",
   "filedApprox": true,
   "source": "reported",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62137517"
    }
   ]
  },
  {
   "id": "cisneros-aph-20260807",
   "name": "Gilbert Cisneros",
   "role": "House",
   "party": "D",
   "state": "CA",
   "ticker": "APH",
   "company": "Amphenol",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-08-07",
   "filed": "2026-09-10",
   "source": "reported",
   "sources": [
    {
     "label": "CurvedTrading (House PTRs)",
     "url": "https://curvedtrading.com/congress-trades/?p=19&type=buy"
    }
   ]
  },
  {
   "id": "cisneros-moga-20260807",
   "name": "Gilbert Cisneros",
   "role": "House",
   "party": "D",
   "state": "CA",
   "ticker": "MOG.A",
   "company": "Moog",
   "type": "buy",
   "amount": "$15,001 - $50,000",
   "traded": "2026-08-07",
   "filed": "2026-09-10",
   "source": "reported",
   "sources": [
    {
     "label": "CurvedTrading (House PTRs)",
     "url": "https://curvedtrading.com/congress-trades/?p=19&type=buy"
    }
   ]
  },
  {
   "id": "donalds-nflx-20260812",
   "name": "Byron Donalds",
   "role": "House",
   "party": "R",
   "state": "FL",
   "ticker": "NFLX",
   "company": "Netflix",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-08-12",
   "filed": "2026-09-15",
   "source": "reported",
   "sources": [
    {
     "label": "CurvedTrading (House PTRs)",
     "url": "https://curvedtrading.com/congress-trades/?p=18&type=buy"
    }
   ]
  },
  {
   "id": "boozman-csco-20260924",
   "name": "John Boozman",
   "role": "Senate",
   "party": "R",
   "state": "AR",
   "ticker": "CSCO",
   "company": "Cisco Systems",
   "type": "buy",
   "amount": "$1,001 - $15,000",
   "traded": "2026-09-24",
   "filed": "2026-10-21",
   "source": "reported",
   "sources": [
    {
     "label": "Tapeboard (Senate eFD)",
     "url": "https://tapeboard.com/politician-trades"
    }
   ]
  },
  {
   "id": "boozman-mu-20260924",
   "name": "John Boozman",
   "role": "Senate",
   "party": "R",
   "state": "AR",
   "ticker": "MU",
   "company": "Micron Technology",
   "type": "sell",
   "amount": "$1,001 - $15,000",
   "traded": "2026-09-24",
   "filed": "2026-10-21",
   "source": "reported",
   "sources": [
    {
     "label": "Tapeboard (Senate eFD)",
     "url": "https://tapeboard.com/politician-trades"
    }
   ]
  },
  {
   "id": "boozman-aptv-20260925",
   "name": "John Boozman",
   "role": "Senate",
   "party": "R",
   "state": "AR",
   "ticker": "APTV",
   "company": "Aptiv",
   "type": "sell",
   "amount": "$1,001 - $15,000",
   "traded": "2026-09-25",
   "filed": "2026-10-21",
   "source": "reported",
   "sources": [
    {
     "label": "Tapeboard (Senate eFD)",
     "url": "https://tapeboard.com/politician-trades"
    }
   ]
  },
  {
   "id": "armstrong-wmb-20260908",
   "name": "Alan Armstrong",
   "role": "Senate",
   "party": "R",
   "state": "OK",
   "ticker": "WMB",
   "company": "Williams Companies",
   "type": "sell",
   "amount": "$250,001 - $500,000",
   "traded": "2026-09-08",
   "filed": "2026-10-23",
   "filedApprox": true,
   "source": "reported",
   "note": "Former Williams CEO. Reported as a sale of his old company's stock.",
   "sources": [
    {
     "label": "Benzinga",
     "url": "https://www.benzinga.com/node/62592991"
    }
   ]
  }
 ],
 "figures": [
  {
   "id": "trump",
   "name": "Donald J. Trump",
   "role": "President",
   "party": "R",
   "summary": "His reports list thousands of trades made in his name. They are filed with the Office of Government Ethics as scanned PDFs with dollar ranges, so this site links to them instead of parsing them.",
   "facts": [
    {
     "text": "Q1 2026 report: 3,642 transactions, with purchases outnumbering sales about two to one.",
     "src": {
      "label": "Benzinga",
      "url": "https://www.benzinga.com/news/politics/26/05/52576337/trump-q1-2026-trade-disclosure-nvidia-amd-palantir-microsoft-oracle"
     }
    },
    {
     "text": "Bought between $247K and $630K of Palantir (PLTR) across Q1 2026.",
     "src": {
      "label": "Yahoo Finance",
      "url": "https://finance.yahoo.com/markets/stocks/articles/eric-trump-says-family-assets-192500434.html"
     }
    },
    {
     "text": "The Q1 report's cover notes the filer paid late fees for missing the disclosure window.",
     "src": {
      "label": "Benzinga",
      "url": "https://www.benzinga.com/news/politics/26/05/52576337/trump-q1-2026-trade-disclosure-nvidia-amd-palantir-microsoft-oracle"
     }
    }
   ],
   "holdings": "Annual report (OGE 278e) filed June 30, 2026 lists holdings as value ranges.",
   "links": [
    {
     "label": "Annual report 2026 (holdings)",
     "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/69AEAA9D7455ACD585258E27002DDEE1/$FILE/Donald-J-Trump-2026-278ANNUAL.pdf"
    },
    {
     "label": "Trade report filed June 2026",
     "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/AC43530823BD60D485258E27002DDEF7/$FILE/Donald-J-Trump-06.25.2026-278T.pdf"
    },
    {
     "label": "All OGE filings for the President",
     "url": "https://extapps2.oge.gov/201/Presiden.nsf"
    }
   ]
  }
 ],
 "holdingsLinks": [
  {
   "label": "House members: annual reports and trades (House Clerk)",
   "url": "https://disclosures-clerk.house.gov/FinancialDisclosure"
  },
  {
   "label": "Senators: annual reports and trades (Senate eFD)",
   "url": "https://efdsearch.senate.gov/search/"
  }
 ]
};
