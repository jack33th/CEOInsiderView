"""Daily closes (split-adjusted) + adjusted closes + split events from Yahoo, 2023-09-01 to today, for every
ticker with a CEO purchase >= $25K, plus SPY. Saved as one JSON per ticker; missing tickers are logged."""
import json, os, sys, time, urllib.request, urllib.error, datetime as dt
D = sys.argv[1]; os.makedirs(f"{D}/px", exist_ok=True)
rows = json.load(open(f"{D}/purchases.json"))
tickers = sorted({r["ticker"] for r in rows if r["ceo"] and r["value"] >= 25000} | {"SPY"})
if len(sys.argv) > 3:  # optional sharding: prices.py DIR k n  (run n copies in parallel)
    tickers = tickers[int(sys.argv[2])::int(sys.argv[3])]
p1 = int(dt.datetime(2023, 9, 1).timestamp()); p2 = int(time.time())
miss = []
for i, tk in enumerate(tickers):
    f = f"{D}/px/{tk.replace('/', '_')}.json"
    if os.path.exists(f): continue
    sym = tk.replace(".", "-")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d&events=split"
    data = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; ceo-buys-backtest)"}), timeout=30) as r:
                data = json.loads(r.read()); break
        except urllib.error.HTTPError as e:
            if e.code == 404: break
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    try:
        res = data["chart"]["result"][0]
        q = res["indicators"]["quote"][0]["close"]; adj = res["indicators"]["adjclose"][0]["adjclose"]
        pts = [(ts // 86400, c, a) for ts, c, a in zip(res["timestamp"], q, adj) if c and a]
        splits = [(int(s["date"]) // 86400, s["numerator"] / s["denominator"]) for s in (res.get("events", {}).get("splits", {}) or {}).values()]
        json.dump({"d": [p[0] for p in pts], "c": [p[1] for p in pts], "a": [p[2] for p in pts], "splits": splits}, open(f, "w"))
    except Exception:
        miss.append(tk)
    if i % 100 == 0: print(i, "of", len(tickers), "missing so far", len(miss), flush=True)
    time.sleep(0.25)
json.dump(miss, open(f"{D}/px_missing{'_' + sys.argv[2] if len(sys.argv) > 3 else ''}.json", "w"))
print("done:", len(tickers), "tickers,", len(miss), "with no price data", flush=True)
