#!/usr/bin/env python3
"""Refresh data.js and prices.js with CEO open-market purchases straight from SEC EDGAR.

Two modes
  live      (default) Reads EDGAR's real-time "latest Form 4" feed, so a new filing is picked up
            within one run of this script (every ~10 minutes if scheduled that way).
  backfill  Reads EDGAR's daily indexes for the last --days days. Use it for the first run and
            once a day to catch anything the live feed missed. It also refreshes all price history.

What it keeps
  * Only open-market purchases (transaction code "P") by someone whose officer title says CEO.
  * Exact shares, average price, trade date, filing time and a link to the filing itself.
  * Price history (1 year of daily closes) for each ticker, so the site can draw charts.

Usage
  export SEC_USER_AGENT="Your Name your.email@example.com"   # SEC requires contact details
  python scripts/update_data.py --mode backfill --days 30
  python scripts/update_data.py                              # live

The script only rewrites files when something actually changed.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import http.cookiejar
import html as htmllib
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.environ.get("CEO_DATA_JS", os.path.join(ROOT, "data.js"))
PRICES_JS = os.environ.get("CEO_PRICES_JS", os.path.join(ROOT, "prices.js"))
POLITICS_JS = os.environ.get("CEO_POLITICS_JS", os.path.join(ROOT, "politics.js"))
COMPANIES_JS = os.environ.get("CEO_COMPANIES_JS", os.path.join(ROOT, "companies.js"))
ATOM = "{http://www.w3.org/2005/Atom}"
CEO_RE = re.compile(r"\b(ceo|chief\s+executive|principal\s+executive)\b", re.I)
SUFFIXES = {"JR", "SR", "II", "III", "IV", "JR.", "SR."}
PRICE_UA = "Mozilla/5.0 (compatible; ceo-buys-updater)"
MIN_GAP = 0.15  # seconds between requests to one host (about 6 per second, SEC limit is 10)
EPOCH = dt.date(1970, 1, 1)

_last = {}


def http_get(url, ua, retries=3):
    host = url.split("/")[2]
    for attempt in range(retries):
        wait = MIN_GAP - (time.time() - _last.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Encoding": "identity"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (attempt + 1))
    return None


# ---------- finding filings ----------
def parse_feed(text):
    """Return submission .txt URLs for Form 4 entries in an EDGAR Atom feed (deduplicated)."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    urls = []
    for e in root.findall(ATOM + "entry"):
        if not (e.findtext(ATOM + "title") or "").startswith("4 -"):
            continue  # skips 4/A amendments and anything else
        link = e.find(ATOM + "link")
        href = link.get("href") if link is not None else ""
        if href.endswith("-index.htm"):
            u = href[: -len("-index.htm")] + ".txt"
            if u not in urls:
                urls.append(u)
    return urls


def live_filings(ua, pages=3):
    out, seen = [], set()
    for p in range(pages):
        url = ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb="
               f"&owner=include&start={p * 100}&count=100&output=atom")
        text = http_get(url, ua)
        if not text:
            break
        new = [u for u in parse_feed(text) if u not in seen]
        if not new:
            break
        seen.update(new)
        out.extend(new)
    return out


def business_days(n):
    d, out = dt.date.today(), []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= dt.timedelta(days=1)
    return out


def index_filings(day, ua):
    q = (day.month - 1) // 3 + 1
    text = http_get(f"https://www.sec.gov/Archives/edgar/daily-index/{day.year}/QTR{q}/form.{day:%Y%m%d}.idx", ua)
    if not text:
        return []
    out = []
    for line in text.splitlines():
        if line.startswith("4 "):
            m = re.search(r"(edgar/data/\S+\.txt)\s*$", line)
            if m:
                out.append("https://www.sec.gov/Archives/" + m.group(1))
    return out


# ---------- Form 4 parsing ----------
def _t(node, path):
    el = node.find(path)
    return el.text.strip() if el is not None and el.text else ""


def _f(node, path):
    try:
        return float(_t(node, path))
    except ValueError:
        return None


def pretty_name(n):
    """EDGAR lists 'Last First Middle [Suffix]'. Return 'First Middle Last [Suffix]'."""
    parts = n.replace(",", " ").split()
    suffix = [p for p in parts[-1:] if p.upper() in SUFFIXES]
    if suffix:
        parts = parts[:-1]
    if len(parts) >= 2:
        parts = parts[1:] + parts[:1]
    parts += suffix
    return " ".join(p.capitalize() if p.isupper() else p for p in parts)


def filed_at(text):
    """SEC acceptance time is Eastern. Return ISO UTC like 2026-11-20T20:30:12Z, or None."""
    m = re.search(r"<ACCEPTANCE-DATETIME>(\d{14})", text)
    if not m:
        return None
    local = dt.datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def accession_from_url(url):
    return os.path.basename(url).replace(".txt", "")


def parse_form4(text, min_value=0.0, url="", codes=("P",)):
    """Return CEO open-market trades in one Form 4 submission, one row per trade day and type.
    codes=("P",) gives purchases only; ("P", "S") also returns open-market sales.
    Each row includes ownedAfter (shares held after the last trade that day) and plan
    (True when the filer ticked the Rule 10b5-1 pre-arranged plan box)."""
    m = re.search(r"<ownershipDocument>.*?</ownershipDocument>", text, re.S)
    if not m:
        return []
    try:
        root = ET.fromstring(m.group(0))
    except ET.ParseError:
        return []

    issuer = root.find("issuer")
    if issuer is None:
        return []
    ticker = _t(issuer, "issuerTradingSymbol").upper()
    company = _t(issuer, "issuerName")
    if not ticker or ticker in ("NONE", "N/A"):
        return []

    owner = None
    for o in root.findall("reportingOwner"):
        rel = o.find("reportingOwnerRelationship")
        if rel is None:
            continue
        title = _t(rel, "officerTitle")
        if _t(rel, "isOfficer") in ("1", "true") and CEO_RE.search(title):
            owner = {"name": _t(o, "reportingOwnerId/rptOwnerName"), "title": title}
            break
    if not owner:
        return []
    plan = _t(root, "aff10b5One").lower() in ("1", "true")

    by_key = {}
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        code = _t(tx, "transactionCoding/transactionCode")
        if code not in codes:
            continue
        ad = _t(tx, "transactionAmounts/transactionAcquiredDisposedCode/value")
        if (code == "P" and ad != "A") or (code == "S" and ad != "D"):
            continue
        shares = _f(tx, "transactionAmounts/transactionShares/value")
        px = _f(tx, "transactionAmounts/transactionPricePerShare/value")
        day = _t(tx, "transactionDate/value")[:10]
        if not (shares and px and day):
            continue
        b = by_key.setdefault((day, code), {"shares": 0.0, "value": 0.0, "after": None})
        b["shares"] += shares
        b["value"] += shares * px
        after = _f(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")
        if after is not None and _t(tx, "ownershipNature/directOrIndirectOwnership/value") != "I":
            b["after"] = after

    acc = accession_from_url(url) if url else ""
    link = url[:-4] + "-index.htm" if url.endswith(".txt") else ""
    out = []
    for (day, code), b in sorted(by_key.items()):
        if b["value"] < min_value:
            continue
        row = {
            "id": f"{ticker.lower()}-{day.replace('-', '')}-{acc[-6:] or 'x'}" + ("" if code == "P" else "-s"),
            "ticker": ticker,
            "company": company.title() if company.isupper() else company,
            "exchange": None,
            "insider": pretty_name(owner["name"]),
            "title": owner["title"],
            "date": day,
            "shares": int(round(b["shares"])),
            "price": round(b["value"] / b["shares"], 4),
            "value": int(round(b["value"])),
            "ownedAfter": int(round(b["after"])) if b["after"] is not None else None,
            "plan": plan,
            "dip": None,
            "sinceBought": None,
            "source": "sec",
            "note": "",
            "filedAt": filed_at(text),
            "url": link,
            "accession": acc,
            "sources": [{"label": "SEC Form 4 filing", "url": link}] if link else [],
        }
        if code == "S":
            row["type"] = "sell"
        out.append(row)
    return out


# ---------- prices ----------
def to_epoch(iso):
    return (dt.date.fromisoformat(iso) - EPOCH).days


def fetch_series(ticker, delay_ua=PRICE_UA):
    """Return {"d": [epoch days], "c": [closes]} or None. Yahoo first, Stooq as backup."""
    sym = ticker.replace(".", "-")
    raw = http_get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1y&interval=1d", delay_ua)
    try:
        r = json.loads(raw)["chart"]["result"][0]
        pts = [(ts // 86400, round(c, 4)) for ts, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]) if c]
        if pts:
            return {"d": [p[0] for p in pts], "c": [p[1] for p in pts], "s": "Yahoo Finance"}
    except Exception:
        pass
    raw = http_get(f"https://stooq.com/q/d/l/?s={sym.lower()}.us&i=d", delay_ua)
    try:
        rows = list(csv.DictReader(io.StringIO(raw)))[-260:]
        pts = [(to_epoch(r["Date"]), round(float(r["Close"]), 4)) for r in rows]
        if pts:
            return {"d": [p[0] for p in pts], "c": [p[1] for p in pts], "s": "Stooq"}
    except Exception:
        pass
    return None


def dip_at_buy(series, trade_iso, price, days=90):
    """Percent the stock sat below its recent peak when the CEO bought, or None."""
    td = to_epoch(trade_iso)
    seg = [c for d, c in zip(series["d"], series["c"]) if td - days <= d <= td]
    if len(seg) < 20 or not price:
        return None
    peak = max(seg)
    return max(0, round((peak - price) / peak * 100))


def load_js(path, var):
    try:
        text = open(path, encoding="utf-8").read()
        body = text[text.index(var):]
        return json.loads(body[body.index("{"): body.rindex("}") + 1])
    except Exception:
        return {}


# ---------- merge / write ----------
def trade_key(t):
    return (t["ticker"], t["date"], t.get("shares") or round(t.get("value", 0) / 1000))


def merge(existing, fresh, drop_manual=False):
    out = {}
    for t in existing:
        if drop_manual and t.get("source") != "sec":
            continue
        out[trade_key(t)] = t
    for t in fresh:
        old = out.get(trade_key(t))
        if old:  # keep hand-written extras, but trust the filing for the numbers
            t["note"] = old.get("note") or t.get("note", "")
            t["exchange"] = old.get("exchange")
            t["dip"] = old.get("dip") or t.get("dip")
            if old.get("also"):
                t["also"] = old["also"]
        out[trade_key(t)] = t
    return list(out.values())


def normalise(trades):
    return sorted(trades, key=lambda t: (t["date"], t.get("value", 0), t["ticker"]))


def write_data(trades, days):
    doc = {
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coverage": f"CEO open-market purchases from the last {days} days, read from SEC Form 4 filings.",
        "trades": trades,
    }
    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write("/* Generated by scripts/update_data.py. */\n")
        f.write("window.INSIDER_DATA = " + json.dumps(doc, indent=1, ensure_ascii=False) + ";\n")


SPARK_JS = os.environ.get("CEO_SPARK_JS", os.path.join(ROOT, "spark.js"))
PRICES_DIR = os.environ.get("CEO_PRICES_DIR", os.path.join(ROOT, "prices"))


def safe_name(ticker):
    return re.sub(r"[^A-Z0-9._-]", "_", ticker.upper())


def write_prices(prices):
    """Full history per ticker in prices/TICKER.json, plus a small spark.js summary for the first page load."""
    os.makedirs(PRICES_DIR, exist_ok=True)
    keep = {safe_name(t) + ".json" for t in prices}
    for f in os.listdir(PRICES_DIR):
        if f.endswith(".json") and f not in keep:
            os.remove(os.path.join(PRICES_DIR, f))
    spark = {}
    for tk, s in prices.items():
        with open(os.path.join(PRICES_DIR, safe_name(tk) + ".json"), "w") as f:
            json.dump(s, f, separators=(",", ":"))
        d, c = s["d"], s["c"]
        if not c:
            continue
        cut = d[-1] - 62  # about 2 months for the mini charts
        i = next((k for k, v in enumerate(d) if v >= cut), 0)
        year = [x for x, dd in zip(c, d) if dd >= d[-1] - 365] or c
        spark[tk] = {"d0": d[i], "o": [v - d[i] for v in d[i:]], "c": c[i:], "hi": max(year), "lo": min(year),
                     "last": c[-1], "prev": c[-2] if len(c) > 1 else c[-1], "asof": d[-1], "s": s.get("s", "")}
    with open(SPARK_JS, "w", encoding="utf-8") as f:
        f.write("/* Last ~2 months of closes per ticker (d0 = first day, o = day offsets) plus 52-week high/low.\n"
                "   Full history is in prices/TICKER.json. Generated by scripts/update_data.py. */\n")
        f.write("window.INSIDER_SPARK = " + json.dumps(spark, separators=(",", ":")) + ";\n")


def load_prices():
    out = {}
    if os.path.isdir(PRICES_DIR):
        for f in os.listdir(PRICES_DIR):
            if f.endswith(".json"):
                try:
                    out[f[:-5]] = json.load(open(os.path.join(PRICES_DIR, f)))
                except Exception:
                    pass
    if not out:  # first run after the upgrade: read the old single file
        out = load_js(PRICES_JS, "window.INSIDER_PRICES") or {}
    return out


def returns_after(series, iso, price, days):
    """Return % from the buy price to the first close at least `days` calendar days later, or None."""
    if not series or not price:
        return None
    target = to_epoch(iso) + days
    for d, c in zip(series["d"], series["c"]):
        if d >= target:
            return round((c / price - 1) * 100, 1)
    return None


def add_track_record(trades, prices):
    spy = prices.get("SPY")
    for t in trades:
        s = prices.get(safe_name(t["ticker"])) or prices.get(t["ticker"])
        if not s or not t.get("price"):
            continue
        for n in (30, 90):
            r = returns_after(s, t["date"], t["price"], n)
            if r is not None:
                t["r%d" % n] = r
                if spy:
                    base = next((c for d, c in zip(spy["d"], spy["c"]) if d >= to_epoch(t["date"])), None)
                    after = next((c for d, c in zip(spy["d"], spy["c"]) if d >= to_epoch(t["date"]) + n), None)
                    if base and after:
                        t["spy%d" % n] = round((after / base - 1) * 100, 1)


# ======================= politicians (House Clerk + Senate eFD) =======================
HOUSE_ZIP = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
HOUSE_PDF = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc}.pdf"
LEGISLATORS = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
SENATE = "https://efdsearch.senate.gov"
OWNER = {"SP": "Spouse", "JT": "Joint", "DC": "Child"}
HOUSE_ROW = re.compile(
    r"\(([A-Z]{1,5}(?:[.\-][A-Z]{1,2})?)\)\s*\[(ST)\]\s*(P|S \(partial\)|S|E)\s+"
    r"(\d{1,2}/\d{1,2}/\d{4})\s*(\d{1,2}/\d{1,2}/\d{4})\s*"
    r"(\$[\d,]+\s*-\s*\$[\d,]+|Over \$[\d,]+|\$[\d,]+\s*\+?)")


def us_date(s):
    m, d, y = (int(x) for x in s.split("/"))
    return dt.date(y, m, d).isoformat()


def party_map(ua):
    """{('house','CA',31): {...}, ('senate','boozman'): {...}} from the unitedstates project (free, on GitHub)."""
    raw = http_get(LEGISLATORS, ua)
    out = {}
    try:
        for p in json.loads(raw):
            term = p["terms"][-1]
            info = {"party": {"Democrat": "D", "Republican": "R"}.get(term.get("party"), "I"),
                    "state": term.get("state"), "name": p["name"].get("official_full") or
                    f'{p["name"]["first"]} {p["name"]["last"]}'}
            if term["type"] == "rep":
                out[("house", term["state"], int(term.get("district") or 0))] = info
            else:
                out[("senate", p["name"]["last"].lower())] = info
    except Exception:
        pass
    return out


def pdf_text(data):
    try:
        from pypdf import PdfReader  # pip install pypdf
    except ImportError:
        print("pypdf not installed; skipping House PDFs (pip install pypdf)")
        return None
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((pg.extract_text() or "") for pg in reader.pages)
    except Exception:
        return ""


def parse_house_ptr(text):
    """Return stock rows from the text of an electronically filed House PTR."""
    t = re.sub(r"\s+", " ", text.replace("\x00", " "))
    rows, last = [], 0
    for m in HOUSE_ROW.finditer(t):
        before = t[last:m.start()].strip()
        last = m.end()
        owner = ""
        om = re.search(r"\b(SP|JT|DC)\s+(?=[^\s])", before[-160:])
        if om:
            owner = OWNER[om.group(1)]
            before = before[-160:][om.end():]
        company = re.sub(r"\s*-\s*(Common Stock|Class [A-Z].*|Ordinary Shares.*)$", "", before[-90:]).strip(" -:")
        kind = m.group(3)
        rows.append({
            "ticker": m.group(1).replace("-", "."), "company": company,
            "type": "buy" if kind == "P" else "sell" if kind.startswith("S") else "exchange",
            "traded": us_date(m.group(4)), "notified": us_date(m.group(5)),
            "amount": re.sub(r"\s+", " ", m.group(6)).strip(), "owner": owner,
        })
    return rows


def house_trades(ua, since, known_docs, parties):
    """Returns (rows, ok)."""
    rows, ok = [], False
    years = sorted({since.year, dt.date.today().year})
    for year in years:
        req = urllib.request.Request(HOUSE_ZIP.format(year=year), headers={"User-Agent": ua})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                z = zipfile.ZipFile(io.BytesIO(r.read()))
        except Exception as e:
            print("House index failed:", e)
            continue
        xml_name = next((n for n in z.namelist() if n.lower().endswith(".xml")), None)
        if not xml_name:
            continue
        ok = True
        root = ET.fromstring(z.read(xml_name))
        for mem in root.iter("Member"):
            if (mem.findtext("FilingType") or "").strip() != "P":
                continue
            doc = (mem.findtext("DocID") or "").strip()
            try:
                filed = us_date((mem.findtext("FilingDate") or "").strip())
            except ValueError:
                continue
            if filed < since.isoformat() or not doc or doc in known_docs:
                continue
            sd = (mem.findtext("StateDst") or "").strip()
            st, dist = sd[:2], int(sd[2:] or 0) if sd[2:].isdigit() else 0
            info = parties.get(("house", st, dist), {})
            name = info.get("name") or f'{(mem.findtext("First") or "").strip()} {(mem.findtext("Last") or "").strip()}'
            url = HOUSE_PDF.format(year=year, doc=doc)
            req = urllib.request.Request(url, headers={"User-Agent": ua})
            try:
                time.sleep(MIN_GAP)
                with urllib.request.urlopen(req, timeout=60) as r:
                    text = pdf_text(r.read())
            except Exception:
                continue
            if text is None:
                return rows, False
            for i, row in enumerate(parse_house_ptr(text)):
                row.update({"id": f"h{doc}-{i}", "name": name.strip(), "role": "House", "party": info.get("party"),
                            "state": st, "filed": filed, "url": url, "doc": doc, "source": "official"})
                rows.append(row)
    return rows, ok


class Senate:
    """Senate eFD needs a click-through agreement and a CSRF token before searches work."""
    def __init__(self, ua):
        self.ua = ua
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def _req(self, path, data=None, extra=None):
        h = {"User-Agent": self.ua, "Referer": SENATE + "/search/"}
        h.update(extra or {})
        body = urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None
        time.sleep(MIN_GAP * 2)
        with self.op.open(urllib.request.Request(SENATE + path, data=body, headers=h), timeout=40) as r:
            return r.read().decode("utf-8", "replace")

    def _csrf(self):
        return next((c.value for c in self.jar if c.name == "csrftoken"), "")

    def login(self):
        page = self._req("/search/home/")
        m = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', page)
        if not m:
            raise RuntimeError("no CSRF token on Senate eFD home page")
        self._req("/search/home/", {"prohibition_agreement": "1", "csrfmiddlewaretoken": m.group(1)},
                  {"Referer": SENATE + "/search/home/"})

    def reports(self, since):
        out, start = [], 0
        while True:
            data = {"start": str(start), "length": "100", "report_types": "[11]", "filer_types": "[]",
                    "submitted_start_date": since.strftime("%m/%d/%Y 00:00:00"), "submitted_end_date": "",
                    "candidate_state": "", "senator_state": "", "office_id": "", "first_name": "", "last_name": "",
                    "csrfmiddlewaretoken": self._csrf()}
            j = json.loads(self._req("/search/report/data/", data, {"X-CSRFToken": self._csrf()}))
            rows = j.get("data", [])
            out.extend(rows)
            if len(rows) < 100:
                return out
            start += 100

    def ptr_rows(self, path):
        page = self._req(path)
        rows = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
            tds = [htmllib.unescape(re.sub(r"<[^>]+>", " ", td)).strip() for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            tds = [re.sub(r"\s+", " ", x) for x in tds]
            if len(tds) >= 8 and re.match(r"\d{2}/\d{2}/\d{4}", tds[1]):
                rows.append(tds)
        return rows


def senate_trades(ua, since, known_docs, parties):
    s, rows = Senate(ua), []
    try:
        s.login()
        reports = s.reports(since)
    except Exception as e:
        print("Senate eFD not reachable, keeping existing Senate rows:", e)
        return rows, False
    for rep in reports:
        first, last, office, link, filed = (list(rep) + [""] * 5)[:5]
        m = re.search(r'href="(/search/view/ptr/([0-9a-f\-]+)/)"', link)
        if not m or m.group(2) in known_docs:
            continue  # paper filings are images; skipped
        try:
            filed_iso = us_date(filed)
            trs = s.ptr_rows(m.group(1))
        except Exception:
            continue
        info = parties.get(("senate", last.split(",")[0].strip().lower()), {})
        for i, td in enumerate(trs):
            # columns: #, Transaction Date, Owner, Ticker, Asset Name, Asset Type, Type, Amount, Comment
            ticker = td[3].strip()
            if ticker in ("--", "") or "Stock" not in td[5]:
                continue
            kind = td[6].lower()
            rows.append({
                "id": f"s{m.group(2)[:8]}-{i}", "name": info.get("name") or f"{first.strip()} {last.strip()}",
                "role": "Senate", "party": info.get("party"), "state": info.get("state"),
                "ticker": ticker, "company": td[4], "type": "buy" if "purchase" in kind else "sell" if "sale" in kind else "exchange",
                "amount": td[7], "traded": us_date(td[1]), "filed": filed_iso, "owner": td[2] if td[2] != "Self" else "",
                "url": SENATE + m.group(1), "doc": m.group(2), "source": "official",
            })
    return rows, True


def update_politics(ua, days, mode):
    doc = load_js(POLITICS_JS, "window.POLITICS_DATA") or {}
    old = doc.get("trades", [])
    known = {t.get("doc") for t in old if t.get("doc")}
    since = dt.date.today() - dt.timedelta(days=days)
    parties = party_map(ua)
    h_rows, h_ok = house_trades(ua, since, set() if mode == "backfill" else known, parties)
    s_rows, s_ok = senate_trades(ua, since, set() if mode == "backfill" else known, parties)
    print(f"House: {len(h_rows)} rows (ok={h_ok}); Senate: {len(s_rows)} rows (ok={s_ok})")

    keep = []
    for t in old:
        official_ok = (t.get("role") == "House" and h_ok) or (t.get("role") == "Senate" and s_ok)
        if t.get("source") == "reported" and official_ok and mode == "backfill":
            continue  # replaced by the official data
        keep.append(t)
    by_id = {t["id"]: t for t in keep}
    new = [r for r in h_rows + s_rows if r["id"] not in by_id]
    for r in h_rows + s_rows:
        by_id[r["id"]] = r
    trades = [t for t in by_id.values() if (t.get("filed") or t["traded"]) >= since.isoformat() and t.get("type") != "exchange"]
    trades.sort(key=lambda t: (t.get("filed") or t["traded"], t["traded"], t["id"]), reverse=True)
    if trades == sorted(old, key=lambda t: (t.get("filed") or t["traded"], t["traded"], t["id"]), reverse=True):
        return trades, []
    doc.update({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "trades": trades})
    doc.setdefault("figures", [])
    doc.setdefault("holdingsLinks", [])
    with open(POLITICS_JS, "w", encoding="utf-8") as f:
        f.write("/* Politician trades. Official rows come from House Clerk and Senate eFD. Generated by scripts/update_data.py. */\n")
        f.write("window.POLITICS_DATA = " + json.dumps(doc, indent=1, ensure_ascii=False) + ";\n")
    print("Updated", POLITICS_JS)
    return trades, new


# ======================= company details + 12-month CEO history ("Know more") =======================
def enrich_companies(ua, trades, prices, max_fetch=3000):
    """For each company with a recent CEO buy: industry, exchange, shares outstanding and every
    open-market buy and sell by its CEO in the last 12 months. Results are cached in companies.js,
    so later runs only read filings they have not seen yet. A company's history is marked complete
    only once every Form 4 from its past year has been read; until then prior12 stays unknown (None),
    so a half-read history never looks like "no earlier buys"."""
    doc = load_js(COMPANIES_JS, "window.INSIDER_COMPANIES") or {}
    data = doc.get("data", {})
    raw = http_get("https://www.sec.gov/files/company_tickers.json", ua)
    try:
        ciks = {v["ticker"].upper(): int(v["cik_str"]) for v in json.loads(raw).values()}
    except Exception:
        print("Company list not reachable; keeping existing company details.")
        return False
    since = (dt.date.today() - dt.timedelta(days=365)).isoformat()
    fetched, changed = 0, False
    wanted = sorted({t["ticker"] for t in trades})
    for tk in wanted:
        cik = ciks.get(tk) or ciks.get(tk.replace(".", "-"))
        if not cik:
            continue
        entry = data.get(tk) or {"history": [], "seen": []}
        try:
            sub = json.loads(http_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json", ua) or "null")
        except Exception:
            sub = None
        if not sub:
            continue
        entry.update({"cik": cik, "name": sub.get("name"), "industry": sub.get("sicDescription") or None,
                      "exchange": (sub.get("exchanges") or [None])[0]})
        try:
            so = json.loads(http_get(f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/dei/EntityCommonStockSharesOutstanding.json", ua) or "null")
            vals = [v for u in (so or {}).get("units", {}).values() for v in u if v.get("val")]
            if vals:
                last = max(vals, key=lambda v: v.get("end", ""))
                entry["sharesOut"], entry["sharesOutDate"] = int(last["val"]), last.get("end")
        except Exception:
            pass
        rec = sub.get("filings", {}).get("recent", {})
        seen = set(entry.get("seen", []))
        todo = [(acc, fd) for f, acc, fd in zip(rec.get("form", []), rec.get("accessionNumber", []), rec.get("filingDate", []))
                if f == "4" and fd >= since and acc not in seen]
        unread = 0
        for acc, fd in todo:
            if fetched >= max_fetch:
                unread += 1
                continue
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{acc}.txt"
            text = http_get(url, ua)
            fetched += 1
            if text is None:
                unread += 1
                continue
            seen.add(acc)
            for r in parse_form4(text, 0, url, codes=("P", "S")):
                entry["history"].append({"date": r["date"], "type": r.get("type", "buy"), "shares": r["shares"],
                                         "price": r["price"], "value": r["value"], "insider": r["insider"],
                                         "ownedAfter": r["ownedAfter"], "plan": r["plan"], "url": r["url"]})
            changed = True
        hist = {(h["date"], h["type"], h["shares"], h["insider"]): h for h in entry["history"] if h["date"] >= since}
        entry["history"] = sorted(hist.values(), key=lambda h: h["date"], reverse=True)
        entry["seen"] = sorted(seen)
        # the SEC lists only the latest ~1000 filings of any form; if those don't reach back a full year, the year isn't covered
        covers_year = bool(rec.get("filingDate")) and min(rec["filingDate"]) <= since or not sub.get("filings", {}).get("files")
        entry["complete"] = unread == 0 and covers_year
        for h in entry["history"]:
            if h["type"] == "buy":
                tmp = dict(h, ticker=tk)
                add_track_record([tmp], prices)
                for k in ("r30", "r90", "spy30", "spy90"):
                    if k in tmp:
                        h[k] = tmp[k]
        data[tk] = entry
        changed = True
    data = {k: v for k, v in data.items() if k in wanted}
    for t in trades:  # how many earlier CEO buys this company had in the year before each buy
        co = data.get(t["ticker"]) or {}
        hist = co.get("history")
        if hist is None or not co.get("complete") or not t.get("date"):
            t.pop("prior12", None)  # not fully read yet: unknown, not zero
            continue
        start = (dt.date.fromisoformat(t["date"]) - dt.timedelta(days=365)).isoformat()
        t["prior12"] = sum(1 for h in hist if h["type"] == "buy" and start <= h["date"] < t["date"])
    with open(COMPANIES_JS, "w", encoding="utf-8") as f:
        f.write("/* Company details and each CEO's open-market buys and sells over 12 months, from SEC EDGAR.\n"
                "   Loaded only when someone opens Know more. Generated by scripts/update_data.py. */\n")
        f.write("window.INSIDER_COMPANIES = " + json.dumps({"updated": dt.date.today().isoformat(), "data": data},
                                                          separators=(",", ":"), ensure_ascii=False) + ";\n")
    print(f"Companies: {len(data)} (read {fetched} new filings; "
          f"{sum(1 for v in data.values() if not v.get('complete'))} still incomplete)")
    return changed


# ======================= phone push (optional, via ntfy.sh) =======================
def push(lines):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not lines:
        return
    title = f"{len(lines)} new insider trade" + ("s" if len(lines) > 1 else "")
    body = "\n".join(lines[:6]) + ("\n..." if len(lines) > 6 else "")
    req = urllib.request.Request(f"https://ntfy.sh/{urllib.parse.quote(topic)}", data=body.encode(),
                                 headers={"Title": title, "Tags": "chart_with_upwards_trend"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        print("Sent phone alert")
    except Exception as e:
        print("Phone alert failed:", e)


def fmt_money(v):
    return f"${v / 1e6:.1f}M" if v >= 1e6 else f"${v / 1e3:.0f}K"


# ======================= main =======================
def run_ceo(args, ua):
    """Returns (trades, new_trades) or (None, []) if nothing should be written."""
    old_doc = load_js(DATA_JS, "window.INSIDER_DATA")
    existing = old_doc.get("trades", [])
    known = {t.get("accession") for t in existing if t.get("accession")}
    if args.mode == "live":
        urls = live_filings(ua, args.pages)
    else:
        urls = []
        scan = args.scan_days or args.days  # how far back to re-read; trades older than this but within --days are kept
        for day in business_days(max(2, int(scan * 5 / 7) + 1)):
            found = index_filings(day, ua)
            print(f"{day}: {len(found)} Form 4 filings", flush=True)
            urls.extend(found)
    if not urls:
        print("No filings returned by EDGAR; leaving CEO data untouched.")
        return existing, [], False
    todo = [u for u in urls if args.mode == "backfill" or accession_from_url(u) not in known]
    print(f"{len(urls)} filings listed, reading {len(todo)}", flush=True)
    fresh, failed = [], 0
    for u in todo:
        text = http_get(u, ua)
        if text is None:
            failed += 1
            continue
        fresh.extend(parse_form4(text, args.min_value, u))
    if todo and failed > len(todo) / 2:
        print(f"Too many failed downloads ({failed}/{len(todo)}); leaving CEO data untouched.")
        return existing, [], False
    uniq = {}
    for t in fresh:  # a trade can appear in several filings (joint filers); keep one
        uniq[(t["ticker"], t["date"], t["shares"], t["insider"])] = t
    fresh = list(uniq.values())
    print(f"Found {len(fresh)} CEO purchases")
    old_keys = {trade_key(t) for t in existing}
    new = [t for t in fresh if trade_key(t) not in old_keys]
    cutoff = (dt.date.today() - dt.timedelta(days=args.days)).isoformat()
    trades = merge(existing, fresh, drop_manual=(args.mode == "backfill" and not args.keep_manual))
    trades = normalise([t for t in trades if t["date"] >= cutoff])
    changed = normalise(existing) != trades
    return trades, new, changed


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["live", "backfill"], default="live")
    ap.add_argument("--days", type=int, default=30, help="how far back to keep CEO trades")
    ap.add_argument("--min-value", type=float, default=25000)
    ap.add_argument("--scan-days", type=int, default=0,
                    help="backfill: only re-read filings from this many days (default: all of --days)")
    ap.add_argument("--pages", type=int, default=3, help="live mode: feed pages to read (100 entries each)")
    ap.add_argument("--no-prices", action="store_true")
    ap.add_argument("--keep-manual", action="store_true", help="keep non-SEC rows when backfilling")
    ap.add_argument("--politics", action="store_true", help="also refresh House and Senate trades")
    ap.add_argument("--politics-days", type=int, default=90)
    ap.add_argument("--companies", action="store_true", help="refresh company details even in live mode")
    args = ap.parse_args(argv)

    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if "@" not in ua:
        sys.exit('Set SEC_USER_AGENT to "Your Name your.email@example.com" (SEC requires contact details).')

    res = run_ceo(args, ua)
    trades, new_ceo = res[0], res[1]
    ceo_changed = res[2] if len(res) > 2 else False

    pol_trades, new_pol = [], []
    if args.politics:
        try:
            pol_trades, new_pol = update_politics(ua, args.politics_days, args.mode)
        except Exception as e:
            print("Politics update failed:", e)
    else:
        pol_trades = (load_js(POLITICS_JS, "window.POLITICS_DATA") or {}).get("trades", [])

    prices_changed = False
    old_prices = load_prices()
    wanted = {t["ticker"] for t in trades} | {t["ticker"] for t in pol_trades} | {"SPY"}
    prices = {k: v for k, v in old_prices.items() if k in wanted}
    if not args.no_prices:
        for tk in sorted(wanted):
            if args.mode == "backfill" or tk not in prices:
                s = fetch_series(tk)
                if s:
                    prices[tk] = s
                    prices_changed = True
        for t in trades:
            if t.get("source") == "sec" and not t.get("dip") and t["ticker"] in prices:
                pct = dip_at_buy(prices[t["ticker"]], t["date"], t["price"])
                if pct is not None:
                    t["dip"] = {"pct": pct, "base": "90-day peak"}
                    ceo_changed = True
    prices_changed = prices_changed or set(prices) != set(old_prices) or not os.path.exists(SPARK_JS)
    before = json.dumps([[t.get("r30"), t.get("r90")] for t in trades])
    add_track_record(trades, prices)
    ceo_changed = ceo_changed or before != json.dumps([[t.get("r30"), t.get("r90")] for t in trades])

    if args.mode == "backfill" or args.companies:
        try:
            before = json.dumps([t.get("prior12") for t in trades])
            enrich_companies(ua, trades, prices)
            ceo_changed = ceo_changed or before != json.dumps([t.get("prior12") for t in trades])
        except Exception as e:
            print("Company details failed:", e)

    if ceo_changed:
        write_data(trades, args.days)
        print("Updated", DATA_JS)
    if prices_changed:
        write_prices(prices)
        if os.path.exists(PRICES_JS):
            os.remove(PRICES_JS)  # replaced by spark.js + prices/
        print("Updated", SPARK_JS, "and", PRICES_DIR)

    # only push things made public in the last 2 days, so a first backfill doesn't spam
    recent = (dt.date.today() - dt.timedelta(days=2)).isoformat()
    lines = [f'{t["insider"]} (CEO) bought {fmt_money(t["value"])} of {t["ticker"]}'
             for t in new_ceo if (t.get("filedAt") or t["date"])[:10] >= recent]
    lines += [f'{t["name"]} ({t.get("party") or "?"}-{t.get("state") or ""}, {t["role"]}) '
              f'{"bought" if t["type"] == "buy" else "sold"} {t["ticker"]}, {t["amount"]}'
              for t in new_pol if t.get("filed", "") >= recent]
    push(lines)
    if not (ceo_changed or prices_changed or new_pol):
        print("Nothing new.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
