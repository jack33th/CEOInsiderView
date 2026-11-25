/* Daily closing prices for one ticker, on demand: /api/prices?t=TROX
   Used when a buy is newer than the saved price files (prices/TICKER.json, spark.js), which only
   refresh when the GitHub Action runs. Daily closes exist whether or not the market is open, so this
   works nights, weekends and holidays. Yahoo Finance first, Stooq as backup.

   Answer: { t, s, d: [epoch days], c: [closes], last, prev, hi, lo, asof }
   Cached at Vercel's edge for an hour (closes change once a day), served stale for a day if the
   source is down, so many visitors cause at most one lookup per ticker per hour. */
'use strict';

const UA = 'Mozilla/5.0 (compatible; ceo-insider-view)';

// "NYSE:FLG" -> "FLG", "HEI, HEI-A" -> "HEI", "BRK.B" stays "BRK.B"
function cleanTicker(raw) {
  let t = String(raw || '').toUpperCase().trim().split(/[\s,;]+/)[0] || '';
  if (t.includes(':')) t = t.split(':').pop();
  return /^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(t) ? t : '';
}

function fromYahoo(j, nowSec) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return null;
  // While the market is open, Yahoo's newest point is today's live price, not a close: leave it out,
  // so every number on the site is a finished day's close (and matches the saved price files).
  const reg = r.meta && r.meta.currentTradingPeriod && r.meta.currentTradingPeriod.regular;
  const now = nowSec || Date.now() / 1000;
  const closes = r.indicators.quote[0].close, d = [], c = [];
  r.timestamp.forEach((ts, i) => {
    const v = closes[i];
    if (reg && ts >= reg.start && now < reg.end) return;  // today's session isn't over yet
    if (v != null && isFinite(v)) { d.push(Math.floor(ts / 86400)); c.push(Math.round(v * 10000) / 10000); }
  });
  return c.length ? { d, c, s: 'Yahoo Finance' } : null;
}

function fromStooq(text) {
  const rows = String(text || '').trim().split('\n').slice(1).slice(-260), d = [], c = [];
  rows.forEach((line) => {
    const p = line.split(',');  // Date,Open,High,Low,Close,Volume
    const v = parseFloat(p[4]), day = Date.parse(p[0] + 'T00:00:00Z');
    if (isFinite(v) && isFinite(day)) { d.push(Math.floor(day / 864e5)); c.push(v); }
  });
  return c.length ? { d, c, s: 'Stooq' } : null;
}

async function series(ticker, fetchImpl) {
  const f = fetchImpl || fetch, sym = encodeURIComponent(ticker.replace(/\./g, '-'));
  try {
    const r = await f(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d`, { headers: { 'User-Agent': UA } });
    if (r.ok) { const s = fromYahoo(await r.json()); if (s) return s; }
  } catch (e) { /* fall through to Stooq */ }
  try {
    const r = await f(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}.us&i=d`, { headers: { 'User-Agent': UA } });
    if (r.ok) { const s = fromStooq(await r.text()); if (s) return s; }
  } catch (e) { /* no source answered */ }
  return null;
}

function summary(t, s) {
  const n = s.c.length, year = s.c.slice(-252);
  return {
    t, s: s.s, d: s.d, c: s.c,
    last: s.c[n - 1], prev: n > 1 ? s.c[n - 2] : null, asof: s.d[n - 1],
    hi: Math.max.apply(null, year), lo: Math.min.apply(null, year)
  };
}

async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const t = cleanTicker(q.get('t'));
  res.setHeader('Content-Type', 'application/json');
  if (!t) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Pass a ticker, e.g. /api/prices?t=AAPL' }));
  }
  const s = await series(t);
  if (!s) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=600');  // don't hammer the sources for unknown tickers
    return res.end(JSON.stringify({ error: 'No price history found for ' + t, t }));
  }
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(JSON.stringify(summary(t, s)));
}

module.exports = handler;
module.exports.cleanTicker = cleanTicker;
module.exports.series = series;
module.exports.summary = summary;
module.exports.fromYahoo = fromYahoo;
