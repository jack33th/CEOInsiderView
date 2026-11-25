"""Backtest of the site's experimental score on every CEO open-market purchase >= $25K filed 2025-01-01..2026-08-20.
Point in time: each buy is scored only with filings that existed on its filing date.
Returns: from the first close AFTER the filing date (when the public could act) to 30/90 calendar days later,
minus SPY over the same dates ("excess return")."""
import json, os, sys, math, random, statistics as S, datetime as dt, collections
D = sys.argv[1]; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, "scripts"); sys.dont_write_bytecode = True
from score import score
import update_data as u
EPOCH = dt.date(1970, 1, 1)
def ep(iso): return (dt.date.fromisoformat(iso) - EPOCH).days
START, END = "2025-01-01", "2026-08-20"

rows = json.load(open(f"{D}/purchases.json"))
uniq = {}
for r in sorted(rows, key=lambda r: r["filed"]):
    uniq.setdefault((r["ticker"], r["date"], r["shares"], r["insider"], r["ceo"]), r)
rows = list(uniq.values())
ceo_all = [r for r in rows if r["ceo"]]
site = [r for r in ceo_all if r["value"] >= 25000]           # what the site lists
by_tk = collections.defaultdict(list)
for r in site: by_tk[r["ticker"]].append(r)
ceo_by_tk = collections.defaultdict(list)
for r in ceo_all: ceo_by_tk[r["ticker"]].append(r)
any_by_tk = collections.defaultdict(list)
for r in rows: any_by_tk[r["ticker"]].append(r)

px = {}
def prices(tk):
    if tk not in px:
        f = f"{D}/px/{tk.replace('/', '_')}.json"
        px[tk] = json.load(open(f)) if os.path.exists(f) else None
    return px[tk]
spy = prices("SPY")
def ret(p, entry_day, days):
    d = p["d"]
    i = next((k for k, x in enumerate(d) if x > entry_day), None)
    if i is None or d[i] - entry_day > 5: return None, None
    target = d[i] + days
    if target > d[-1]: return None, None
    j = max(k for k, x in enumerate(d) if x <= target)
    return p["a"][j] / p["a"][i] - 1, d[i]

test, dropped = [], collections.Counter()
for t in site:
    if not (START <= t["filed"] <= END): continue
    p = prices(t["ticker"])
    if not p or len(p["d"]) < 30: dropped["no price data (often delisted or renamed)"] += 1; continue
    td = ep(t["date"])
    f = 1.0
    for sd, ratio in p["splits"]:
        if sd > td and ratio: f *= ratio
    padj = t["price"] / f
    near = [c for d, c in zip(p["d"], p["c"]) if abs(d - td) <= 3]
    if not near or abs(padj / near[-1] - 1) > 0.5:
        dropped["price paid doesn't match market price (bad ticker/data)"] += 1; continue
    x = dict(t)
    pct = u.dip_at_buy({"d": p["d"], "c": p["c"]}, t["date"], padj)
    x["dip"] = {"pct": pct} if pct is not None else None
    start = (dt.date.fromisoformat(t["date"]) - dt.timedelta(days=365)).isoformat()
    x["prior12"] = sum(1 for h in ceo_by_tk[t["ticker"]] if start <= h["date"] < t["date"] and h["filed"] <= t["filed"])
    known = [y for y in by_tk[t["ticker"]] if y["filed"] <= t["filed"]]
    known = [y if y is not t else x for y in known]
    x["score"], x["parts"] = score(x, known)
    # the "intended" cluster signal: any insider (not just CEOs) buying in the 30 days before, known by filing date
    x["anyInsiders30"] = len({y["ownerCik"] for y in any_by_tk[t["ticker"]]
                              if y["ownerCik"] != t["ownerCik"] and y["filed"] <= t["filed"] and 0 <= (td - ep(y["date"])) <= 30})
    ok = False
    for days in (30, 90):
        r, e = ret(p, ep(t["filed"]), days)
        if r is None: continue
        s, _ = ret(spy, ep(t["filed"]), days)
        if s is None: continue
        x[f"r{days}"], x[f"x{days}"] = r, r - s
        ok = True
    if not ok: dropped["no price after the filing date"] += 1; continue
    test.append(x)

def med(v): return S.median(v) if v else None
def wmean(v):
    if not v: return None
    v = sorted(v); k = max(1, len(v) // 100)
    return S.fmean(v[k:-k] if len(v) > 2 * k + 2 else v)
def stats(g, h):
    v = [t[f"x{h}"] for t in g if f"x{h}" in t]
    return {"n": len(v), "median": med(v), "trimmedMean": wmean(v), "beatSPY": (sum(1 for a in v if a > 0) / len(v)) if v else None}
def boot_diff(a, b, n=4000, seed=1):
    rnd = random.Random(seed); out = []
    for _ in range(n):
        out.append(S.median(rnd.choices(a, k=len(a))) - S.median(rnd.choices(b, k=len(b))))
    out.sort(); return out[int(.025 * n)], out[int(.975 * n)]
def spearman(xs, ys):
    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0] * len(v); i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[o[j + 1]] == v[o[i]]: j += 1
            for k in range(i, j + 1): r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    rx, ry = rank(xs), rank(ys); mx, my = S.fmean(rx), S.fmean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return num / math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
def perm_p(xs, ys, rho, n=2000, seed=2):
    rnd = random.Random(seed); ys = list(ys); c = 0
    for _ in range(n):
        rnd.shuffle(ys)
        if abs(spearman(xs, ys)) >= abs(rho): c += 1
    return (c + 1) / (n + 1)

R = {"sample": {"window": [START, END], "ceoBuysListed": sum(1 for t in site if START <= t["filed"] <= END),
                "tested": len(test), "dropped": dict(dropped)}}
groups = {"all": test, "60+": [t for t in test if t["score"] >= 60], "35-59": [t for t in test if 35 <= t["score"] < 60], "<35": [t for t in test if t["score"] < 35]}
R["byScore"] = {g: {h: stats(v, h) for h in (30, 90)} for g, v in groups.items()}
R["passTest"] = {}
for h in (30, 90):
    hi = [t[f"x{h}"] for t in groups["60+"] if f"x{h}" in t]; rest = [t[f"x{h}"] for t in test if t["score"] < 60 and f"x{h}" in t]
    allv = [t[f"x{h}"] for t in test if f"x{h}" in t]
    lo, up = boot_diff(hi, rest) if len(hi) >= 5 else (None, None)
    xs = [t["score"] for t in test if f"x{h}" in t]; rho = spearman(xs, allv)
    R["passTest"][h] = {"n60": len(hi), "median60": med(hi), "medianAll": med(allv),
                        "beatsMedianCEObuy": bool(hi) and med(hi) > med(allv), "beatsSPY": bool(hi) and med(hi) > 0,
                        "diffVsRest95CI": [lo, up], "gapIsNotLuck": lo is not None and lo > 0,
                        "spearmanScoreVsReturn": rho, "spearmanP": perm_p(xs, allv, rho)}
def fsplit(name, fn):
    out = {}
    for label, g in fn().items():
        out[label] = {h: stats(g, h) for h in (30, 90)}
    return out
R["byFactor"] = {
    "size": fsplit("size", lambda: {"<$100K": [t for t in test if t["value"] < 1e5], "$100K-$1M": [t for t in test if 1e5 <= t["value"] < 1e6], "$1M+": [t for t in test if t["value"] >= 1e6]}),
    "stake": fsplit("stake", lambda: {"unknown": [t for t in test if t["parts"]["stake"] is None], "+<10%": [t for t in test if t["parts"]["stake"] is not None and t["parts"]["stake"] < 9], "+10-49%": [t for t in test if t["parts"]["stake"] in (9, 14)], "+50%+ or new": [t for t in test if (t["parts"]["stake"] or 0) >= 20]}),
    "dip": fsplit("dip", lambda: {"unknown": [t for t in test if t["parts"]["dip"] is None], "<8%": [t for t in test if t["parts"]["dip"] == 0], "8-24%": [t for t in test if t["parts"]["dip"] in (4, 8)], "25-39%": [t for t in test if t["parts"]["dip"] == 14], "40%+": [t for t in test if t["parts"]["dip"] == 20]}),
    "cluster (site: other CEO-titled buyers)": fsplit("c", lambda: {"none": [t for t in test if t["parts"]["cluster"] == 0], "some": [t for t in test if t["parts"]["cluster"] > 0]}),
    "cluster (any insider, 30 days before)": fsplit("c2", lambda: {"none": [t for t in test if t["anyInsiders30"] == 0], "1": [t for t in test if t["anyInsiders30"] == 1], "2+": [t for t in test if t["anyInsiders30"] >= 2]}),
    "first in a year": fsplit("f", lambda: {"first": [t for t in test if t["prior12"] == 0], "1-3 before": [t for t in test if 1 <= t["prior12"] <= 3], "4+ before": [t for t in test if t["prior12"] >= 4]}),
    "10b5-1 plan": fsplit("p", lambda: {"planned": [t for t in test if t["plan"]], "not planned": [t for t in test if not t["plan"]]}),
}
R["byPeriod"] = {p: {g: {h: stats([t for t in v if lo <= t["filed"] <= hi], h) for h in (30, 90)} for g, v in groups.items()}
                 for p, (lo, hi) in {"2025": ("2025-01-01", "2025-12-31"), "2026 (Jan-Aug)": ("2026-01-01", END)}.items()}
R["scoreDistribution"] = dict(sorted(collections.Counter(10 * (t["score"] // 10) for t in test).items()))
json.dump(R, open(f"{D}/results.json", "w"), indent=1)
json.dump([{k: t.get(k) for k in ("ticker", "date", "filed", "insider", "value", "score", "parts", "prior12", "anyInsiders30", "plan", "r30", "x30", "r90", "x90")} for t in test], open(f"{D}/scored_buys.json", "w"))
print(json.dumps({k: R[k] for k in ("sample", "byScore", "passTest")}, indent=1, default=lambda v: round(v, 4)))
