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


def parse_form4(text, min_value=0.0, url=""):
    """Return CEO open-market purchases found in one Form 4 submission (one row per trade day)."""
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

    by_day = {}
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        if _t(tx, "transactionCoding/transactionCode") != "P":
            continue
        if _t(tx, "transactionAmounts/transactionAcquiredDisposedCode/value") != "A":
            continue
        shares = _f(tx, "transactionAmounts/transactionShares/value")
        px = _f(tx, "transactionAmounts/transactionPricePerShare/value")
        day = _t(tx, "transactionDate/value")[:10]
        if not (shares and px and day):
            continue
        b = by_day.setdefault(day, {"shares": 0.0, "value": 0.0})
        b["shares"] += shares
        b["value"] += shares * px

    acc = accession_from_url(url) if url else ""
    link = url[:-4] + "-index.htm" if url.endswith(".txt") else ""
    out = []
    for day, b in sorted(by_day.items()):
        if b["value"] < min_value:
            continue
        out.append({
            "id": f"{ticker.lower()}-{day.replace('-', '')}-{acc[-6:] or 'x'}",
            "ticker": ticker,
            "company": company.title() if company.isupper() else company,
            "exchange": None,
            "insider": pretty_name(owner["name"]),
            "title": owner["title"],
            "date": day,
            "shares": int(round(b["shares"])),
            "price": round(b["value"] / b["shares"], 4),
            "value": int(round(b["value"])),
            "dip": None,
            "sinceBought": None,
            "source": "sec",
            "note": "",
            "filedAt": filed_at(text),
            "url": link,
            "accession": acc,
            "sources": [{"label": "SEC Form 4 filing", "url": link}] if link else [],
        })
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


def write_prices(prices):
    with open(PRICES_JS, "w", encoding="utf-8") as f:
        f.write("/* Daily closes (d = days since 1970-01-01). Generated by scripts/update_data.py. */\n")
        f.write("window.INSIDER_PRICES = " + json.dumps(prices, separators=(",", ":")) + ";\n")


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
        for day in business_days(max(2, int(args.days * 5 / 7) + 1)):
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
    ap.add_argument("--pages", type=int, default=3, help="live mode: feed pages to read (100 entries each)")
    ap.add_argument("--no-prices", action="store_true")
    ap.add_argument("--keep-manual", action="store_true", help="keep non-SEC rows when backfilling")
    ap.add_argument("--politics", action="store_true", help="also refresh House and Senate trades")
    ap.add_argument("--politics-days", type=int, default=90)
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
    old_prices = load_js(PRICES_JS, "window.INSIDER_PRICES")
    wanted = {t["ticker"] for t in trades} | {t["ticker"] for t in pol_trades}
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
    prices_changed = prices_changed or set(prices) != set(old_prices)

    if ceo_changed:
        write_data(trades, args.days)
        print("Updated", DATA_JS)
    if prices_changed:
        write_prices(prices)
        print("Updated", PRICES_JS)

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
