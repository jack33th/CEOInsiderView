"""Exact Python port of score() in app.js. trades = the list the site would hold (for the cluster factor)."""
import math, datetime as dt
def jsround(x): return math.floor(x + 0.5)
def days_apart(a, b): return jsround((dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days)
def score(t, trades):
    parts = []
    v = t["value"]
    size = max(0, min(25, jsround((math.log10(max(v, 1)) - math.log10(25000)) / (math.log10(5e6) - math.log10(25000)) * 25)))
    parts.append(("size", size, 25, False))
    oa, sh = t.get("ownedAfter"), t.get("shares")
    if oa is None or not sh: sp = None
    else:
        before = oa - sh
        sp = math.inf if before <= 0 else sh / before * 100
    if sp is None: st = 0
    elif sp == math.inf: st = 20
    else: st = 25 if sp >= 100 else 20 if sp >= 50 else 14 if sp >= 20 else 9 if sp >= 10 else 4 if sp >= 3 else 0
    parts.append(("stake", st, 25, sp is None))
    dp = (t.get("dip") or {}).get("pct") if t.get("dip") else None
    dpts = 0 if dp is None else 20 if dp >= 40 else 14 if dp >= 25 else 8 if dp >= 15 else 4 if dp >= 8 else 0
    parts.append(("dip", dpts, 20, dp is None))
    others, again = set(), 0
    for x in trades:
        if x["ticker"] != t["ticker"] or x is t or abs(days_apart(x["date"], t["date"])) > 30: continue
        if x["insider"] == t["insider"]: again += 1
        else: others.add(x["insider"])
    n = len(others)
    parts.append(("cluster", min(20, (15 if n >= 2 else 10 if n else 0) + (5 if again else 0)), 20, False))
    p12 = t.get("prior12")
    parts.append(("first", 0 if p12 is None else 10 if p12 == 0 else 0 if p12 >= 4 else 4, 10, p12 is None))
    if t.get("plan"): parts.append(("plan", -15, 0, False))
    raw = sum(p for _, p, _, na in parts if not na)
    mx = sum(m for _, _, m, na in parts if not na and m) or 100
    total = max(0, min(100, jsround(raw / mx * 100)))
    return total, {k: (None if na else p) for k, p, _, na in parts}
