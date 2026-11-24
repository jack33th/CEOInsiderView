"""Robustness checks on backtest.py's output: small-cap benchmark (IWM), company-level bootstrap, factor effects by year.
Usage: python3 scripts/score_test/robustness.py DIR   (DIR = the folder backtest.py wrote scored_buys.json to)"""
import json, sys, time, urllib.request, datetime as dt, statistics as S, random, collections
D = sys.argv[1]; EP = dt.date(1970, 1, 1)
p1, p2 = int(dt.datetime(2023, 9, 1).timestamp()), int(time.time())
url = f"https://query1.finance.yahoo.com/v8/finance/chart/IWM?period1={p1}&period2={p2}&interval=1d"
res = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read())["chart"]["result"][0]
iwm = [(ts // 86400, x) for ts, x in zip(res["timestamp"], res["indicators"]["adjclose"][0]["adjclose"]) if x]
def ret(s, filed, days):
    e = (dt.date.fromisoformat(filed) - EP).days
    i = next((k for k, (d, _) in enumerate(s) if d > e), None)
    if i is None or s[i][0] - e > 5 or s[i][0] + days > s[-1][0]: return None
    j = max(k for k, (d, _) in enumerate(s) if d <= s[i][0] + days)
    return s[j][1] / s[i][1] - 1
def med(v): return S.median(v) if v else float("nan")
buys = json.load(open(f"{D}/scored_buys.json"))
for t in buys:
    for h in (30, 90):
        b = ret(iwm, t["filed"], h) if t.get(f"r{h}") is not None else None
        t[f"i{h}"] = None if b is None else t[f"r{h}"] - b
hi, rest = [t for t in buys if t["score"] >= 60], [t for t in buys if t["score"] < 60]
print("Median excess return vs IWM (small caps)")
for name, g in (("all", buys), ("60+", hi), ("<60", rest)):
    for h in (30, 90):
        v = [t[f"i{h}"] for t in g if t.get(f"i{h}") is not None]
        print(f"  {name:4} {h}d n={len(v)} median {med(v)*100:+.1f}%  beat IWM {sum(x > 0 for x in v) / len(v) * 100:.0f}%")
print(f"60+ group: {len(hi)} buys at {len({t['ticker'] for t in hi})} companies")
for key, label in (("x90", "SPY"), ("i90", "IWM")):
    byc = collections.defaultdict(list)
    for t in buys:
        if t.get(key) is not None: byc[t["ticker"]].append(t)
    comps, rnd, diffs = list(byc), random.Random(3), []
    for _ in range(3000):
        smp = [t for c in rnd.choices(comps, k=len(comps)) for t in byc[c]]
        a = [t[key] for t in smp if t["score"] >= 60]; b = [t[key] for t in smp if t["score"] < 60]
        if len(a) > 5: diffs.append(med(a) - med(b))
    diffs.sort()
    print(f"  90d gap (60+ minus rest) vs {label}, company-level 95% range: {diffs[int(.025 * len(diffs))] * 100:+.1f}% to {diffs[int(.975 * len(diffs))] * 100:+.1f}%")
tests = {
    "10b5-1 planned": (lambda t: t["plan"], lambda t: not t["plan"]),
    "4+ CEO buys in prior year": (lambda t: t["prior12"] >= 4, lambda t: t["prior12"] < 4),
    "dip 40%+": (lambda t: (t["parts"]["dip"] or 0) == 20, lambda t: t["parts"]["dip"] is not None and t["parts"]["dip"] < 20),
    "$1M+": (lambda t: t["value"] >= 1e6, lambda t: t["value"] < 1e6),
    "repeat/cluster (site)": (lambda t: t["parts"]["cluster"] > 0, lambda t: t["parts"]["cluster"] == 0),
    "2+ other insiders (any)": (lambda t: t["anyInsiders30"] >= 2, lambda t: t["anyInsiders30"] == 0),
    "first in a year": (lambda t: t["prior12"] == 0, lambda t: t["prior12"] > 0),
    "stake unknown (indirect)": (lambda t: t["parts"]["stake"] is None, lambda t: t["parts"]["stake"] is not None),
}
print("90d median vs IWM, with factor minus without   [2025 | 2026]")
for name, (yes, no) in tests.items():
    row = []
    for lo, hi_ in (("2025-01-01", "2025-12-31"), ("2026-01-01", "2026-12-31")):
        g = [t for t in buys if lo <= t["filed"] <= hi_]
        a = [t["i90"] for t in g if yes(t) and t.get("i90") is not None]; c = [t["i90"] for t in g if no(t) and t.get("i90") is not None]
        row.append(f"{(med(a) - med(c)) * 100:+5.1f} (n={len(a)})")
    print(f"  {name:27} " + " | ".join(row))
