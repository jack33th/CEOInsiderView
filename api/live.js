/* Live feed: newest CEO open-market buys straight from the SEC, checked on demand.
   Runs as a Vercel serverless function at /api/live. Needs the env var SEC_USER_AGENT
   ("Your Name you@example.com"), which the SEC requires on every request.

   How it stays fast and polite:
   - Reads EDGAR's real-time "latest Form 4 filings" list (updated as the SEC accepts filings).
   - Parses only the newest MAX_FILINGS filings, a few at a time (well under the SEC's 10 requests/second).
   - The answer is cached at Vercel's edge for 60 seconds, so many visitors still cause at most one SEC check a minute.
*/
'use strict';

const FEED = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&start=0&count=100&output=atom';
const MAX_FILINGS = 40;
const WORKERS = 3;
const GAP_MS = 150;
const MIN_VALUE = 25000;
const CEO_RE = /\b(ceo|chief\s+executive|principal\s+executive)\b/i;
const SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'JR.', 'SR.']);

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function tagText(xml, name) {
  const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
  return m ? unescapeXml(m[1].trim()) : '';
}
function valueOf(xml, name) {
  const block = tagText(xml, name);
  const v = block.match(/<value>([\s\S]*?)<\/value>/);
  return v ? v[1].trim() : block.replace(/<[^>]+>/g, '').trim();
}
function blocks(xml, name) {
  return xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>[\\s\\S]*?</' + name + '>', 'g')) || [];
}
function prettyName(n) {
  let parts = n.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const suffix = parts.length && SUFFIXES.has(parts[parts.length - 1].toUpperCase()) ? [parts.pop()] : [];
  if (parts.length >= 2) parts = parts.slice(1).concat(parts.slice(0, 1));
  return parts.concat(suffix).map(p => (p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p)).join(' ');
}
function titleCase(s) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
}

/* Atom feed -> [{url (.txt), index (-index.htm), accession, filedAt (ISO UTC)}], newest first, one per filing */
function parseFeed(xml) {
  const out = [], seen = new Set();
  for (const e of blocks(xml, 'entry')) {
    if (!tagText(e, 'title').startsWith('4 -')) continue; // skips 4/A amendments
    const href = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    if (!href.endsWith('-index.htm')) continue;
    const accession = href.split('/').pop().replace('-index.htm', '');
    if (seen.has(accession)) continue;
    seen.add(accession);
    const updated = tagText(e, 'updated');
    out.push({
      url: href.replace(/-index\.htm$/, '.txt'), index: href, accession,
      filedAt: updated ? new Date(updated).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    });
  }
  return out;
}

/* One Form 4 submission -> CEO open-market purchases (one row per trade day) */
function parseForm4(text, meta) {
  meta = meta || {};
  const docMatch = text.match(/<ownershipDocument>[\s\S]*?<\/ownershipDocument>/);
  if (!docMatch) return [];
  const doc = docMatch[0];
  const issuer = tagText(doc, 'issuer');
  const ticker = tagText(issuer, 'issuerTradingSymbol').toUpperCase();
  const company = tagText(issuer, 'issuerName');
  if (!ticker || ticker === 'NONE' || ticker === 'N/A') return [];

  let owner = null;
  for (const o of blocks(doc, 'reportingOwner')) {
    const rel = tagText(o, 'reportingOwnerRelationship');
    const title = tagText(rel, 'officerTitle');
    const isOfficer = ['1', 'true'].includes(tagText(rel, 'isOfficer'));
    if (isOfficer && CEO_RE.test(title)) { owner = { name: tagText(o, 'rptOwnerName'), title }; break; }
  }
  if (!owner) return [];

  const byDay = {};
  for (const tx of blocks(doc, 'nonDerivativeTransaction')) {
    if (tagText(tagText(tx, 'transactionCoding'), 'transactionCode') !== 'P') continue;
    const amounts = tagText(tx, 'transactionAmounts');
    if (valueOf(amounts, 'transactionAcquiredDisposedCode') !== 'A') continue;
    const shares = parseFloat(valueOf(amounts, 'transactionShares'));
    const px = parseFloat(valueOf(amounts, 'transactionPricePerShare'));
    const day = valueOf(tx, 'transactionDate').slice(0, 10);
    if (!(shares > 0) || !(px > 0) || !day) continue;
    const b = byDay[day] || (byDay[day] = { shares: 0, value: 0 });
    b.shares += shares; b.value += shares * px;
  }

  const acc = meta.accession || '';
  return Object.keys(byDay).sort().filter(d => byDay[d].value >= (meta.minValue == null ? MIN_VALUE : meta.minValue)).map(day => {
    const b = byDay[day];
    return {
      id: ticker.toLowerCase() + '-' + day.replace(/-/g, '') + '-' + (acc.slice(-6) || 'x'),
      ticker, company: titleCase(company), exchange: null,
      insider: prettyName(owner.name), title: owner.title,
      date: day, shares: Math.round(b.shares), price: Math.round(b.value / b.shares * 10000) / 10000,
      value: Math.round(b.value), dip: null, sinceBought: null, source: 'sec', note: '',
      filedAt: meta.filedAt || null, url: meta.index || '', accession: acc,
      sources: meta.index ? [{ label: 'SEC Form 4 filing', url: meta.index }] : [],
    };
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getText(url, ua, fetchImpl) {
  const r = await (fetchImpl || fetch)(url, { headers: { 'User-Agent': ua, 'Accept-Encoding': 'gzip, deflate' } });
  if (!r.ok) throw new Error('SEC ' + r.status + ' for ' + url);
  return r.text();
}

async function collect(ua, fetchImpl) {
  const feed = parseFeed(await getText(FEED, ua, fetchImpl)).slice(0, MAX_FILINGS);
  const trades = [];
  let next = 0, failed = 0;
  async function worker() {
    while (next < feed.length) {
      const f = feed[next++];
      try {
        trades.push(...parseForm4(await getText(f.url, ua, fetchImpl), f));
      } catch (e) { failed++; }
      await sleep(GAP_MS);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  trades.sort((a, b) => (b.filedAt || '').localeCompare(a.filedAt || ''));
  return { filingsChecked: feed.length, failed, trades };
}

async function handler(req, res) {
  const ua = (process.env.SEC_USER_AGENT || '').trim();
  if (!ua.includes('@')) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Set SEC_USER_AGENT in your Vercel project settings.' }));
  }
  try {
    const out = await collect(ua);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    res.end(JSON.stringify(Object.assign({ checkedAt: new Date().toISOString(), source: 'SEC EDGAR latest Form 4 filings' }, out)));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}

module.exports = handler;
module.exports.parseFeed = parseFeed;
module.exports.parseForm4 = parseForm4;
module.exports.collect = collect;
