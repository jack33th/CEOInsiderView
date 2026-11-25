"""Every open-market purchase (code P, acquired) in SEC Form 4 data sets, one row per filing/owner/day.
Mirrors scripts/update_data.py parse_form4: original Form 4s only (no 4/A), shares and value summed per day,
shares owned after = last direct holding that day, CEO = officer whose title matches the site's CEO regex."""
import csv, io, json, re, sys, zipfile, datetime as dt, glob, os
csv.field_size_limit(10**8)
CEO_RE = re.compile(r"\b(ceo|chief\s+executive|principal\s+executive)\b", re.I)
def d(s):
    return dt.datetime.strptime(s, "%d-%b-%Y").date().isoformat() if s else ""
def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8", errors="replace"), delimiter="\t", quoting=csv.QUOTE_NONE)
def num(s):
    try: return float(s)
    except (TypeError, ValueError): return None
out = []
for path in sorted(glob.glob(os.path.join(sys.argv[1], "*.zip"))):
    z = zipfile.ZipFile(path)
    sub = {}
    for r in rows(z, "SUBMISSION.tsv"):
        if r["DOCUMENT_TYPE"] == "4":
            sub[r["ACCESSION_NUMBER"]] = r
    owners = {}
    for r in rows(z, "REPORTINGOWNER.tsv"):
        a = r["ACCESSION_NUMBER"]
        if a in sub:
            owners.setdefault(a, []).append(r)
    agg = {}
    for r in rows(z, "NONDERIV_TRANS.tsv"):
        a = r["ACCESSION_NUMBER"]
        if a not in sub or r["TRANS_CODE"] != "P" or r["TRANS_ACQUIRED_DISP_CD"] != "A":
            continue
        sh, px, day = num(r["TRANS_SHARES"]), num(r["TRANS_PRICEPERSHARE"]), d(r["TRANS_DATE"])
        if not (sh and px and day):
            continue
        b = agg.setdefault((a, day), {"shares": 0.0, "value": 0.0, "after": None})
        b["shares"] += sh; b["value"] += sh * px
        af = num(r["SHRS_OWND_FOLWNG_TRANS"])
        if af is not None and r["DIRECT_INDIRECT_OWNERSHIP"] != "I":
            b["after"] = af
    n = 0
    for (a, day), b in agg.items():
        s = sub[a]
        tk = (s["ISSUERTRADINGSYMBOL"] or "").strip().upper()
        if not tk or tk in ("NONE", "N/A"):
            continue
        ow = owners.get(a, [])
        ceo = next((o for o in ow if "Officer" in o["RPTOWNER_RELATIONSHIP"] and CEO_RE.search(o["RPTOWNER_TITLE"] or "")), None)
        who = ceo or (ow[0] if ow else None)
        out.append({"acc": a, "filed": d(s["FILING_DATE"]), "date": day, "ticker": tk, "cik": s["ISSUERCIK"],
                    "insider": (who or {}).get("RPTOWNERNAME", ""), "ownerCik": (who or {}).get("RPTOWNERCIK", ""),
                    "ceo": bool(ceo), "shares": round(b["shares"]), "value": round(b["value"]),
                    "price": round(b["value"] / b["shares"], 4), "ownedAfter": round(b["after"]) if b["after"] is not None else None,
                    "plan": s.get("AFF10B5ONE") in ("1", "true", "TRUE")})
        n += 1
    print(os.path.basename(path), "purchases:", n, flush=True)
json.dump(out, open(sys.argv[2], "w"))
ceo = [r for r in out if r["ceo"]]
print("all insider purchases:", len(out), "| CEO purchases:", len(ceo), "| CEO >= $25K:", sum(r["value"] >= 25000 for r in ceo),
      "| tickers (CEO>=25K):", len({r["ticker"] for r in ceo if r["value"] >= 25000}))
