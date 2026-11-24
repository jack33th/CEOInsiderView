/* CEO Insider View: one file for the whole site.
   Data: data.js (CEO buys), spark.js (2-month prices + quotes), prices/TICKER.json (full history, on demand),
         companies.js (company details + CEO 12-month history, on demand), politics.js (Congress, on demand),
         /api/live (new filings straight from the SEC, every 30 s). */
(function () {
  'use strict';

  /* =================== helpers =================== */
  var $ = function (id) { return document.getElementById(id); };
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    if (v == null || isNaN(v)) return '—';
    var a = Math.abs(v);
    if (a >= 999500) return '$' + Number((v / 1e6).toFixed(a >= 1e8 ? 0 : 1)) + 'M';
    if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function p2(v) { return v == null ? '—' : '$' + (v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function num(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US'); }
  function signPct(v, d) { return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d == null ? 1 : d) + '%'; }
  function parseDay(iso) { return new Date(iso + 'T00:00:00Z'); }
  function epoch(iso) { return Math.round(parseDay(iso).getTime() / 864e5); }
  function isoOf(e) { return new Date(e * 864e5).toISOString().slice(0, 10); }
  function day(iso, year) {
    var o = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (year) o.year = 'numeric';
    return parseDay(iso).toLocaleDateString('en-US', o);
  }
  function et(isoDT) {
    return new Date(isoDT).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  }
  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    var d = Math.round(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function daysApart(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 864e5); }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.body.appendChild(s);
    });
  }
  var AV = ['#3b6fb6', '#2f8f6b', '#8e5bc4', '#b7652c', '#2f8a9a', '#a84a6a', '#6f7d2f', '#5b63c4'];
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function avatar(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return '<span class="av" style="--av:' + AV[h % AV.length] + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
  }
  function srcLink(s) {
    return s && s.url ? '<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' : '';
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3600);
  }

  /* Rolling numbers: $11 -> $12 -> $20 instead of jumping */
  function parseNum(text) {
    var m = String(text).match(/^([^\d\-−+]*)([\-−+]?)([\d,]*\.?\d+)(.*)$/);
    if (!m) return null;
    return { pre: m[1], plus: m[2] === '+', neg: m[2] === '-' || m[2] === '−', v: parseFloat(m[3].replace(/,/g, '')),
             dec: (m[3].split('.')[1] || '').length, suf: m[4], comma: m[3].indexOf(',') >= 0 };
  }
  function roll(el, text, ms) {
    if (!el) return;
    var p = parseNum(text);
    if (!p || REDUCED) { el.textContent = text; return; }
    var to = p.neg ? -p.v : p.v, from = el._v == null ? 0 : el._v, t0 = performance.now(), dur = ms || 600;
    el._v = to; cancelAnimationFrame(el._raf);
    (function step(now) {
      var k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      var s = Math.abs(v).toFixed(p.dec);
      if (p.comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      el.textContent = k < 1 ? p.pre + (v < 0 ? '−' : p.plus ? '+' : '') + s + p.suf : text;
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }

  /* =================== data =================== */
  var DATA = window.INSIDER_DATA || { trades: [] };
  var TRADES = (DATA.trades || []).filter(function (t) { return t && t.ticker && t.date && t.type !== 'sell'; });
  if (TRADES.some(function (t) { return t.source === 'sec'; })) TRADES = TRADES.filter(function (t) { return t.source === 'sec'; });
  var SPARK = window.INSIDER_SPARK || {};
  var COMPANIES = null; // filled on demand

  function quote(tk) {
    var s = SPARK[tk];
    if (!s || !s.last) return null;
    return { last: s.last, chg: s.prev ? (s.last / s.prev - 1) * 100 : 0, hi: s.hi, lo: s.lo, asof: s.asof };
  }
  function filedMs(t) { return t.filedAt ? Date.parse(t.filedAt) : Date.parse(t.date + 'T21:00:00Z'); }
  function since(t) { var q = quote(t.ticker); return q && t.price ? (q.last / t.price - 1) * 100 : null; }
  function stakePct(t) {
    if (t.ownedAfter == null || !t.shares) return null;
    var before = t.ownedAfter - t.shares;
    return before <= 0 ? Infinity : t.shares / before * 100;
  }

  /* =================== score (experimental) =================== */
  // Until the score passes its backtest (see README), every ring is shown in one neutral colour,
  // so no row looks endorsed. Set to false once it passes.
  var SCORE_EXPERIMENTAL = true;
  var RES = {
    contrarian: { label: 'Research: insiders tend to buy after drops', url: 'https://www.interactivebrokers.com/campus/traders-insight/securities/stocks/what-corporate-insider-buying-can-tell-investors-evidence-from-academic-research/' },
    cluster: { label: 'Study: cluster buys earned ~2x single buys', url: 'https://journal.tinkoff.ru/media/insider-pdf-002.pdf' },
    unusual: { label: 'NBER: unusual trades carry the signal', url: 'https://www.nber.org/papers/w16454.pdf' },
    plan: { label: 'SEC: Rule 10b5-1 trading plans', url: 'https://www.sec.gov/newsroom/press-releases/2022-222' }
  };
  function filingSrc(t) { return t.url ? { label: 'SEC Form 4', url: t.url } : (t.sources && t.sources[0]) || null; }
  function score(t) {
    if (t._score) return t._score;
    var parts = [], src = filingSrc(t);
    // 1. Size (0-25), log scale: $25K = 0, $1M = 17, $5M+ = 25
    var size = Math.max(0, Math.min(25, Math.round((Math.log10(Math.max(t.value, 1)) - Math.log10(25000)) / (Math.log10(5e6) - Math.log10(25000)) * 25)));
    parts.push({ pts: size, max: 25, t: 'Size: ' + money(t.value) + ' of their own money',
      how: t.shares && t.price ? num(t.shares) + ' shares × ' + p2(t.price) + '. Scored on a scale where $25K = 0 and $5M or more = 25.' : 'Scored on a scale where $25K = 0 and $5M or more = 25.', src: src });
    // 2. Stake growth (0-25)
    var sp = stakePct(t), st = 0;
    if (sp === Infinity) st = 20; else if (sp != null) st = sp >= 100 ? 25 : sp >= 50 ? 20 : sp >= 20 ? 14 : sp >= 10 ? 9 : sp >= 3 ? 4 : 0;
    parts.push({ pts: st, max: 25, na: sp == null, t: sp == null ? 'Stake growth: not in this filing' : sp === Infinity ? 'Stake growth: a brand-new position' : 'Stake growth: +' + (sp >= 10 ? Math.round(sp) : sp.toFixed(1)) + '% more shares',
      how: sp == null ? 'Older rows lack the "shares owned after" figure. The next update adds it.' : 'Owned ' + num(t.ownedAfter) + ' shares directly after the buy, up from ' + num(t.ownedAfter - t.shares) + '. Doubling a stake matters more than adding 1%.', src: sp == null ? null : src });
    // 3. Drop before the buy (0-20)
    var dp = t.dip && t.dip.pct, dpts = dp >= 40 ? 20 : dp >= 25 ? 14 : dp >= 15 ? 8 : dp >= 8 ? 4 : 0;
    parts.push({ pts: dpts, max: 20, na: dp == null, t: dp != null ? 'Bought ' + dp + '% below the ' + (t.dip.base || 'recent peak') : 'Drop before the buy: unknown',
      how: dp != null ? 'Price paid ' + p2(t.price) + ' compared with the highest close in the 90 days before.' : 'No price history for this ticker yet.',
      src: dp != null ? { label: 'Daily closes (' + ((SPARK[t.ticker] || {}).s || 'price feed') + ')', url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(t.ticker) + '/history' } : null, res: dpts ? RES.contrarian : null });
    // 4. Other insiders / coming back (0-20)
    var others = {}, again = 0;
    TRADES.forEach(function (x) {
      if (x.ticker !== t.ticker || x === t || Math.abs(daysApart(x.date, t.date)) > 30) return;
      if (x.insider === t.insider) again++; else others[x.insider] = x.date;
    });
    var on = Object.keys(others), cpts = Math.min(20, (on.length >= 2 ? 15 : on.length ? 10 : 0) + (again ? 5 : 0));
    parts.push({ pts: cpts, max: 20, t: on.length ? on.length + ' other insider' + (on.length > 1 ? 's' : '') + ' bought within 30 days' + (again ? ', and the CEO bought more than once' : '') : again ? 'The CEO bought more than once within 30 days' : 'No other insider buys nearby',
      how: on.length ? on.map(function (n) { return esc(n) + ' (' + day(others[n]) + ')'; }).join(', ') : 'Checked every buy at this company within 30 days either side.', src: null, res: on.length ? RES.cluster : null });
    // 5. Unusual: first buy in a year (0-10)
    var upts = t.prior12 == null ? 0 : t.prior12 === 0 ? 10 : t.prior12 >= 4 ? 0 : 4;
    parts.push({ pts: upts, max: 10, na: t.prior12 == null, t: t.prior12 == null ? 'Buying history: arrives with the nightly update' : t.prior12 === 0 ? 'First CEO buy here in 12 months' : t.prior12 + ' earlier CEO buy' + (t.prior12 > 1 ? 's' : '') + ' in the last 12 months',
      how: t.prior12 == null ? 'Needs the 12-month filing history, which the daily update collects.' : 'Counted from every Form 4 filed for this company in the past year.', src: null, res: t.prior12 === 0 ? RES.unusual : null });
    // 6. Pre-planned (minus 15)
    if (t.plan) parts.push({ pts: -15, t: 'Pre-scheduled under a 10b5-1 plan', how: 'The filer ticked the 10b5-1 box, so the buy was arranged in advance, not decided this week.', src: src, res: RES.plan });
    // Factors we can't check yet are left out, and the rest is scaled to 100, so missing data never drags a score down.
    var raw = parts.reduce(function (a, p) { return a + (p.na ? 0 : p.pts); }, 0);
    var max = parts.reduce(function (a, p) { return a + (p.na || !p.max ? 0 : p.max); }, 0) || 100;
    var known = parts.filter(function (p) { return p.max && !p.na; }).length;
    var total = Math.max(0, Math.min(100, Math.round(raw / max * 100)));
    return (t._score = { total: total, parts: parts, known: known, raw: raw, max: max, tier: total >= 60 ? 'hi' : total >= 35 ? 'mid' : 'lo' });
  }

  /* =================== state =================== */
  var WATCH = store.get('cib_watch', []);
  var LAST_SEEN = store.get('cib_seen', null);          // ms of the newest filing the person has seen
  var NOTIFY = store.get('cib_notify', false);
  var st = { q: '', f: 'all', sort: 'new', limit: 40, open: {} };
  var freshIds = {};

  function newest() { return TRADES.reduce(function (m, t) { return Math.max(m, filedMs(t)); }, 0); }
  function isNew(t) { return LAST_SEEN != null && filedMs(t) > LAST_SEEN; }
  if (LAST_SEEN == null) LAST_SEEN = Date.now() - 2 * 864e5; // first visit: the last 2 days count as new
  var seenTimer = setTimeout(function () { store.set('cib_seen', Math.max(newest(), LAST_SEEN)); }, 6000);

  /* =================== CEO feed =================== */
  var FILTERS = [
    ['all', 'All'], ['watch', 'Watchlist'], ['dip', 'Bought the dip'],
    ['cluster', 'Several insiders'], ['big', '$1M+'], ['first', 'First in a year'], ['hi', 'Score 60+ (beta)']
  ];
  function passes(t) {
    var s = score(t);
    switch (st.f) {
      case 'hi': return s.total >= 60;
      case 'watch': return WATCH.indexOf(t.ticker) >= 0;
      case 'dip': return t.dip && t.dip.pct >= 40;  // 25% matched ~60% of buys, so it didn't filter
      case 'cluster': return s.parts[3].pts >= 10;
      case 'big': return t.value >= 1e6;
      case 'first': return t.prior12 === 0;
    }
    return true;
  }
  function matches(t) {
    if (!st.q) return true;
    var q = st.q.toLowerCase();
    return (t.ticker + ' ' + t.company + ' ' + t.insider).toLowerCase().indexOf(q) >= 0;
  }
  function sorted(list) {
    var by = {
      'new': function (a, b) { return filedMs(b) - filedMs(a) || b.value - a.value; },
      score: function (a, b) { return score(b).total - score(a).total || filedMs(b) - filedMs(a); },
      value: function (a, b) { return b.value - a.value; },
      dip: function (a, b) { return ((b.dip && b.dip.pct) || -1) - ((a.dip && a.dip.pct) || -1); }
    }[st.sort];
    return list.slice().sort(by);
  }
  function renderFilters() {
    var counts = {}; FILTERS.forEach(function (f) { var o = st.f; st.f = f[0]; counts[f[0]] = TRADES.filter(passes).length; st.f = o; });
    $('filters').innerHTML = FILTERS.map(function (f) {
      if (f[0] === 'first' && !TRADES.some(function (t) { return t.prior12 != null; })) return '';
      return '<button type="button" class="chip' + (st.f === f[0] ? ' is-on' : '') + '" data-f="' + f[0] + '" aria-pressed="' + (st.f === f[0]) + '">' +
        f[1] + ' <span class="n">' + counts[f[0]] + '</span></button>';
    }).join('') + '<button type="button" class="chip chip--bell' + (NOTIFY ? ' is-on' : '') + '" id="bell" aria-pressed="' + NOTIFY + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>' +
      (NOTIFY ? 'Alerts on' : 'Get alerts') + '</button>';
  }
  function quoteHtml(tk) {
    var q = quote(tk);
    return q ? '<span class="q ' + (q.chg >= 0 ? 'pos' : 'neg') + '">' + p2(q.last) + ' ' + (q.chg >= 0 ? '▲' : '▼') + Math.abs(q.chg).toFixed(1) + '%</span>' : '';
  }
  function rowHtml(t) {
    var s = score(t), sp = stakePct(t), w = WATCH.indexOf(t.ticker) >= 0, open = !!st.open[t.id];
    var stake = t.plan ? '<span class="row__stake plan">Pre-planned</span>'
      : sp === Infinity ? '<span class="row__stake">New position</span>'
      : sp != null && sp >= 1 ? '<span class="row__stake">+' + (sp >= 10 ? Math.round(sp) : sp.toFixed(1)) + '% stake</span>' : '';
    return '<article class="row' + (open ? ' is-open' : '') + (isNew(t) ? ' is-new' : '') + (freshIds[t.id] ? ' fresh' : '') + '" data-id="' + esc(t.id) + '">' +
      '<button type="button" class="row__head" aria-expanded="' + open + '" aria-controls="b-' + esc(t.id) + '">' +
      '<span class="ring ring--' + (SCORE_EXPERIMENTAL ? 'mid' : s.tier) + '" style="--p:' + s.total + '" title="Experimental score ' + s.total + ' of 100' + (s.known < 5 ? ', based on ' + s.known + ' of 5 factors' : '') + '. Not yet tested against returns." aria-label="Experimental score ' + s.total + ' of 100"><span>' + s.total + '</span></span>' +
      '<span class="row__main"><span class="row__l1"><span class="row__co">' + esc(t.company) + '</span><span class="tk">' + esc(t.ticker) + '</span>' + (w ? '<span class="star" title="On your watchlist">★</span>' : '') + '</span>' +
      '<span class="row__l2"><span>' + esc(t.insider) + '</span><span class="row__time">' + (t.filedAt ? 'Filed ' + ago(filedMs(t)) : 'Bought ' + day(t.date)) + '</span>' + stake + '</span></span>' +
      '<span class="row__right"><span class="row__amt">' + money(t.value) + '</span>' + quoteHtml(t.ticker) + '</span></button>' +
      '<div class="row__body" id="b-' + esc(t.id) + '"><div class="row__inner">' + (open ? bodyHtml(t) : '') + '</div></div></article>';
  }
  function renderFeed() {
    var list = sorted(TRADES.filter(function (t) { return passes(t) && matches(t); }));
    var shown = list.slice(0, st.limit), html = '', dividerDone = false, anyNew = false;
    shown.forEach(function (t) {
      if (st.sort === 'new' && !st.q) {
        if (isNew(t) && !anyNew) {
          anyNew = true;
          html += '<div class="divider">New since your last visit · ' + list.filter(isNew).length + '</div>';
        } else if (anyNew && !isNew(t) && !dividerDone) {
          dividerDone = true; html += '<div class="divider divider--old">Earlier</div>';
        }
      }
      html += rowHtml(t);
    });
    $('feed').innerHTML = html || '<div class="empty">' + (st.f === 'watch' ? 'Star a company (open any buy) to add it to your watchlist.' : 'No buys match.') + '</div>';
    $('more').hidden = list.length <= st.limit;
    $('more').textContent = 'Show ' + Math.min(40, list.length - st.limit) + ' more';
    freshIds = {};
  }
  function renderSummary() {
    var total = TRADES.reduce(function (a, t) { return a + t.value; }, 0), cos = {};
    TRADES.forEach(function (t) { cos[t.ticker] = 1; });
    var span = TRADES.length ? daysApart(TRADES.reduce(function (m, t) { return t.date < m ? t.date : m; }, TRADES[0].date), new Date().toISOString().slice(0, 10)) : 0;
    $('summary').innerHTML = '<b id="s1"></b> CEO buys in ' + span + ' days · <b id="s2"></b> in total · <b id="s3"></b> companies' + (SCORE_EXPERIMENTAL ? ' · <span class="beta">Scores are experimental</span>' : '');
    roll($('s1'), String(TRADES.length), 800); roll($('s2'), money(total), 900); roll($('s3'), String(Object.keys(cos).length), 800);
  }

  /* expanded row */
  function miniChart(t) {
    var s = SPARK[t.ticker];
    if (!s || !s.c || s.c.length < 3) return '<p class="fine">No price history for ' + esc(t.ticker) + ' yet.</p>';
    var n = s.c.length, lo = Math.min.apply(null, s.c), hi = Math.max.apply(null, s.c), W = 300, H = 64;
    if (t.price) { lo = Math.min(lo, t.price); hi = Math.max(hi, t.price); }
    function X(i) { return 2 + i / (n - 1) * (W - 4); }
    function Y(v) { return 4 + (1 - (v - lo) / ((hi - lo) || 1)) * (H - 8); }
    var d = s.c.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
    var te = epoch(t.date) - s.d0, k = -1;
    s.o.forEach(function (o, i) { if (o <= te) k = i; });
    var mk = k >= 0 && te >= 0 ? '<circle class="mini__m" cx="' + X(k).toFixed(1) + '" cy="' + Y(s.c[k]).toFixed(1) + '" r="4"/>' : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(t.ticker) + ' last two months, buy marked">' +
      '<path class="mini__l ' + (s.c[n - 1] >= s.c[0] ? 'up' : 'dn') + '" d="' + d + '"/>' + mk + '</svg>';
  }
  function bodyHtml(t) {
    var s = score(t), sp = stakePct(t), sb = since(t), q = quote(t.ticker), lag = t.filedAt ? daysApart(t.date, t.filedAt.slice(0, 10)) : null;
    var kv = [
      ['Bought on', day(t.date, true), ''],
      ['Filed with SEC', t.filedAt ? et(t.filedAt) : '—', lag != null ? (lag === 0 ? 'same day' : lag + (lag === 1 ? ' day' : ' days') + ' after the trade') : ''],
      ['Price paid', p2(t.price), t.shares ? num(t.shares) + ' shares' : ''],
      ['Stake after', t.ownedAfter != null ? num(t.ownedAfter) + ' sh' : '—', sp === Infinity ? 'new position' : sp != null ? '+' + (sp >= 10 ? Math.round(sp) : sp.toFixed(1)) + '% from this buy' : 'arrives with next update'],
      ['Fell before buy', t.dip ? '<span class="neg">−' + t.dip.pct + '%</span>' : '—', t.dip ? 'vs ' + esc(t.dip.base) : ''],
      ['Since the buy', sb != null ? '<span class="' + (sb < 0 ? 'neg' : 'pos') + '">' + signPct(sb) + '</span>' : '—', q ? 'last close ' + p2(q.last) : ''],
      ['52-week range', q && q.lo ? p2(q.lo) + ' – ' + p2(q.hi) : '—', ''],
      ['Pre-planned?', t.plan ? 'Yes (10b5-1)' : t.plan === false ? 'No' : '—', t.plan === false ? 'decided, not scheduled' : '']
    ];
    var w = WATCH.indexOf(t.ticker) >= 0;
    return '<div class="row__pad">' +
      '<p class="headline">' + avatar(t.insider) + '<strong>' + esc(t.insider) + '</strong>, ' + esc(t.title) + ', bought <strong>' + money(t.value) +
      '</strong> of ' + esc(t.company) + ' stock' + (t.price ? ' at ' + p2(t.price) + ' a share' : '') + '.</p>' +
      '<dl class="kv">' + kv.map(function (k) { return '<div><dt>' + k[0] + '</dt><dd>' + k[1] + (k[2] ? '<small>' + k[2] + '</small>' : '') + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="mini">' + miniChart(t) + '<div style="display:grid;gap:8px">' +
      '<button type="button" class="btn btn--fill" data-chart="' + esc(t.id) + '">Full chart</button>' +
      '<button type="button" class="btn btn--soft" data-watch="' + esc(t.ticker) + '" aria-pressed="' + w + '">' + (w ? '★ Watching' : '☆ Watch') + '</button></div></div>' +
      '<details class="more-d" data-more="' + esc(t.id) + '"><summary>Know more <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>' +
      '<div class="more-d__body" id="m-' + esc(t.id) + '"></div></details></div>';
  }
  function knowMoreHtml(t) {
    var s = score(t), co = COMPANIES && COMPANIES[t.ticker], q = quote(t.ticker), html = '';
    html += '<div><div class="sub-h">Experimental score: why it gets ' + s.total + ' / 100</div><ul class="score-list">' + s.parts.map(function (p) {
      return '<li><span class="pts' + (p.na || p.pts === 0 ? ' zero' : p.pts < 0 ? ' minus' : '') + '">' + (p.na ? '–' : (p.pts > 0 ? '+' : '') + p.pts) + '</span><div>' +
        '<div class="why__t">' + esc(p.t) + '</div><div class="why__how">' + p.how + '</div>' +
        (p.src || p.res ? '<div class="why__src">' + (p.src ? 'Source: ' + srcLink(p.src) : '') + (p.res ? srcLink(p.res) : '') + '</div>' : '') + '</div></li>';
    }).join('') + '</ul><p class="fine" style="margin-top:8px">' + (s.known < 5 ? 'Scored on ' + s.known + ' of 5 factors (' + s.raw + ' of ' + s.max + ' possible points, scaled to 100). Factors marked – aren\'t counted yet. ' : '') + '<strong>Experimental.</strong> Our own formula from facts in the filing. It has not yet been tested against what these stocks did afterwards, so treat it as a summary of the facts above, not a prediction.</p></div>';
    html += '<div><div class="sub-h">The company</div>';
    if (co) {
      var cap = co.sharesOut && q ? co.sharesOut * q.last : null;
      html += '<dl class="kv">' +
        '<div><dt>Industry</dt><dd style="font-size:.875rem">' + esc(co.industry || '—') + '</dd></div>' +
        '<div><dt>Exchange</dt><dd>' + esc(co.exchange || '—') + '</dd></div>' +
        '<div><dt>Company value</dt><dd>' + (cap ? money(cap) : '—') + '<small>' + (cap ? num(co.sharesOut) + ' shares × last close' : 'shares outstanding not reported') + '</small></dd></div>' +
        '<div><dt>This buy is</dt><dd>' + (cap ? (t.value / cap * 100 < 0.01 ? '<0.01' : (t.value / cap * 100).toFixed(2)) + '%' : '—') + '<small>of the company\'s value</small></dd></div></dl>';
      html += '<p class="why__src">Source: ' + srcLink({ label: 'SEC company profile', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + co.cik }) + '</p>';
    } else {
      html += '<p class="fine">' + (COMPANIES ? 'No company details for ' + esc(t.ticker) + ' yet. They arrive with the nightly update.' : 'Loading…') + '</p>';
    }
    html += '</div><div><div class="sub-h">CEO trades at ' + esc(t.ticker) + ', last 12 months</div>';
    var hist = co && co.history ? co.history : TRADES.filter(function (x) { return x.ticker === t.ticker; }).map(function (x) {
      return { date: x.date, type: 'buy', value: x.value, price: x.price, insider: x.insider, url: x.url, plan: x.plan };
    });
    hist = hist.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var buys = hist.filter(function (h) { return h.type === 'buy'; }).length, sells = hist.length - buys;
    html += '<p class="fine" style="margin-bottom:8px">' + buys + ' buy' + (buys === 1 ? '' : 's') + ' and ' + sells + ' sale' + (sells === 1 ? '' : 's') +
      (co ? '' : ' in our ' + (DATA.coverage ? 'current window' : 'data') + ' (full year arrives with the nightly update)') +
      (sells > buys ? '. Note: more selling than buying this year.' : '') + '</p><div class="hist">' + hist.slice(0, 8).map(function (h) {
        return '<div class="hist__r"><span class="pill pill--' + h.type + '">' + (h.type === 'buy' ? 'Buy' : 'Sell') + '</span>' +
          '<span>' + day(h.date, true) + ' · ' + esc(h.insider) + (h.plan ? ' <span class="badge badge--plan">10b5-1</span>' : '') +
          (h.r30 != null ? ' <span class="' + (h.r30 < 0 ? 'neg' : 'pos') + '">' + signPct(h.r30) + ' after 30d</span>' : '') + '</span>' +
          '<span>' + (h.url ? '<a class="src" style="margin:0" href="' + esc(h.url) + '" target="_blank" rel="noopener noreferrer">' + money(h.value) + '</a>' : money(h.value)) + '</span></div>';
      }).join('') + '</div></div>';
    html += '<div><div class="sub-h">Sources</div>' + (t.sources || []).map(srcLink).join('') +
      srcLink({ label: 'All ' + t.ticker + ' insider filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + encodeURIComponent(co && co.cik || t.ticker) + '&type=4&dateb=&owner=include&count=40' }) + '</div>';
    return html;
  }
  function ensureCompanies() {
    if (COMPANIES || ensureCompanies._p) return ensureCompanies._p || Promise.resolve();
    ensureCompanies._p = loadScript('companies.js').then(function () {
      COMPANIES = (window.INSIDER_COMPANIES || {}).data || {};
    }).catch(function () { COMPANIES = {}; });
    return ensureCompanies._p;
  }
  function toggleRow(id) {
    var el = document.querySelector('.row[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    var t = byId(id), open = !el.classList.contains('is-open');
    st.open[id] = open;
    if (open && !el.querySelector('.row__pad')) el.querySelector('.row__inner').innerHTML = bodyHtml(t);
    requestAnimationFrame(function () {
      el.classList.toggle('is-open', open);
      el.querySelector('.row__head').setAttribute('aria-expanded', String(open));
    });
  }
  function byId(id) { return TRADES.filter(function (t) { return t.id === id; })[0]; }

  /* track record */
  function renderTrack() {
    var done = TRADES.filter(function (t) { return t.r30 != null; });
    if (COMPANIES) Object.keys(COMPANIES).forEach(function (k) {
      (COMPANIES[k].history || []).forEach(function (h) { if (h.type === 'buy' && h.r30 != null && !TRADES.some(function (t) { return t.ticker === k && t.date === h.date; })) done.push(h); });
    });
    var el = $('track');
    if (done.length < 8) {
      el.innerHTML = '<h2 id="track-h">Track record</h2><p class="fine">Do CEO buys actually go up? This fills in as buys turn 30 days old: ' + done.length +
        ' so far. Every buy is measured from the price the CEO paid, against the S&P 500 (SPY) over the same 30 days.</p>';
      return;
    }
    function med(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
    var r = done.map(function (t) { return t.r30; }), spy = done.filter(function (t) { return t.spy30 != null; }).map(function (t) { return t.spy30; });
    var winners = r.filter(function (x) { return x > 0; }).length, beat = done.filter(function (t) { return t.spy30 != null && t.r30 > t.spy30; }).length;
    var hiDone = done.filter(function (t) { return t.ticker && score(t).total >= 60; });
    var rows = [['All CEO buys', med(r), r.length]];
    if (hiDone.length >= 3) rows.push(['Score 60+ (experimental)', med(hiDone.map(function (t) { return t.r30; })), hiDone.length]);
    if (spy.length) rows.push(['S&P 500', med(spy), spy.length]);
    var maxAbs = Math.max.apply(null, rows.map(function (x) { return Math.abs(x[1]); })) || 1;
    el.innerHTML = '<h2 id="track-h">Track record: 30 days after the buy</h2>' +
      '<div><span class="big ' + (med(r) >= 0 ? 'pos' : 'neg') + '" id="tr-med"></span> <span class="fine">median move, from the price the CEO paid</span></div>' +
      '<div class="bars">' + rows.map(function (x) {
        return '<div class="bar-r"><span>' + x[0] + '</span><span class="bar-t"><span style="width:' + Math.max(3, Math.abs(x[1]) / maxAbs * 100) + '%;background:' + (x[1] >= 0 ? 'var(--green)' : 'var(--red)') + '"></span></span><span class="' + (x[1] >= 0 ? 'pos' : 'neg') + '">' + signPct(x[1]) + '</span></div>';
      }).join('') + '</div>' +
      '<p class="fine">' + winners + ' of ' + r.length + ' were up after 30 days' + (spy.length ? ', and ' + beat + ' beat the S&P 500' : '') + '. Past results don\'t guarantee future ones. Small samples swing a lot.</p>';
    roll($('tr-med'), signPct(med(r)), 900);
  }

  /* ticker tape */
  function renderTape() {
    var latest = TRADES.slice().sort(function (a, b) { return filedMs(b) - filedMs(a); }).slice(0, 16);
    if (!latest.length) { $('tape').hidden = true; return; }
    var one = latest.map(function (t) {
      var q = quote(t.ticker);
      return '<button type="button" class="tick" data-jump="' + esc(t.id) + '"><b>' + esc(t.ticker) + '</b>' + money(t.value) +
        (q ? ' <span class="' + (q.chg >= 0 ? 'up' : 'dn') + '">' + (q.chg >= 0 ? '▲' : '▼') + Math.abs(q.chg).toFixed(1) + '%</span>' : '') + '</button>';
    }).join('');
    $('tape-track').innerHTML = one + one.replace(/<button /g, '<button tabindex="-1" aria-hidden="true" ');
    TAPE.secs = Math.max(30, latest.length * 4);  // time for one full pass of the list
  }
  /* Auto-scroll in JS (not a CSS animation) so the strip can also be swiped and every item stays tappable.
     Pauses while touched, hovered or focused, resumes 3s later. Starts paused for people who set Reduce Motion;
     the pause button overrides that and is remembered. */
  var TAPE = { secs: 60, on: store.get('cib_tape', !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)),
    hold: false, resumeAt: 0, pos: 0, last: 0 };
  function tapeButton() {
    var b = $('tape-btn');
    b.setAttribute('aria-pressed', String(!TAPE.on));
    b.setAttribute('aria-label', TAPE.on ? 'Pause ticker' : 'Play ticker');
    b.innerHTML = TAPE.on ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
  }
  function tapeFrame(ts) {
    var el = $('tape'), half = $('tape-track').scrollWidth / 2;
    var moving = TAPE.on && !TAPE.hold && Date.now() > TAPE.resumeAt && !document.hidden && half > el.clientWidth / 2;
    if (moving && TAPE.last) {
      TAPE.pos += (ts - TAPE.last) * half / (TAPE.secs * 1000);
      if (TAPE.pos >= half) TAPE.pos -= half;   // second copy lines up with the first: no visible jump
      el.scrollLeft = TAPE.pos;
    } else {
      if (half && el.scrollLeft >= half) el.scrollLeft -= half;  // swiped past the end: wrap
      TAPE.pos = el.scrollLeft;
    }
    TAPE.last = ts;
    requestAnimationFrame(tapeFrame);
  }
  (function () {
    var el = $('tape');
    function hold() { TAPE.hold = true; }
    function release() { TAPE.hold = false; TAPE.resumeAt = Date.now() + 3000; }
    el.addEventListener('touchstart', hold, { passive: true });
    el.addEventListener('touchend', release, { passive: true });
    el.addEventListener('touchcancel', release, { passive: true });
    el.addEventListener('mouseenter', hold);
    el.addEventListener('mouseleave', release);
    el.addEventListener('focusin', hold);
    el.addEventListener('focusout', release);
    el.addEventListener('wheel', function () { TAPE.resumeAt = Date.now() + 3000; }, { passive: true });
    $('tape-btn').addEventListener('click', function () {
      TAPE.on = !TAPE.on; store.set('cib_tape', TAPE.on); TAPE.resumeAt = 0; tapeButton();
    });
    tapeButton();
    requestAnimationFrame(tapeFrame);
  })();
  function jumpTo(id) {
    st.f = 'all'; st.q = ''; $('q').value = ''; st.sort = 'new'; $('sort').value = 'new';
    var list = sorted(TRADES), i = list.indexOf(byId(id));
    st.limit = Math.max(st.limit, i + 5); st.open[id] = true;
    renderFilters(); renderFeed();
    var el = document.querySelector('.row[data-id="' + CSS.escape(id) + '"]');
    if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  }

  /* =================== live feed (/api/live) =================== */
  var lastCheck = 0, liveOk = false;
  function liveLabel() {
    var el = $('live');
    el.classList.toggle('is-on', liveOk);
    $('live-text').textContent = liveOk ? 'Live · ' + ago(lastCheck) : DATA.updated ? 'Updated ' + ago(Date.parse(DATA.updated.length === 10 ? DATA.updated + 'T12:00:00Z' : DATA.updated)) : 'Offline';
  }
  function poll() {
    if (location.protocol.indexOf('http') !== 0) { liveLabel(); return; }
    fetch('api/live', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      liveOk = true; lastCheck = Date.parse(j.checkedAt) || Date.now();
      var have = {}; TRADES.forEach(function (t) { have[t.accession || t.id] = 1; have[t.ticker + '|' + t.date + '|' + t.shares] = 1; });
      var added = (j.trades || []).filter(function (t) {
        return t && t.ticker && t.date && t.type !== 'sell' && !have[t.accession || t.id] && !have[t.ticker + '|' + t.date + '|' + t.shares];
      });
      if (added.length) {
        added.forEach(function (t) { TRADES.push(t); freshIds[t.id] = 1; });
        renderSummary(); renderFilters(); renderFeed(); renderTape();
        var good = added.filter(function (t) { return score(t).total >= 60 || WATCH.indexOf(t.ticker) >= 0; });
        toast(added.length === 1 ? 'New: ' + added[0].insider + ' bought ' + money(added[0].value) + ' of ' + added[0].ticker : added.length + ' new CEO buys');
        if (good.length) notify(good);
        if (document.hidden) document.title = '(' + added.length + ') CEO Insider View';
      }
      var l = $('live'); l.classList.remove('ping'); void l.offsetWidth; l.classList.add('ping');
      liveLabel();
    }).catch(function () { liveOk = false; liveLabel(); });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) document.title = 'CEO Insider View'; });

  var swReg = null;
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
  function notify(list) {
    if (!NOTIFY || !('Notification' in window) || Notification.permission !== 'granted') return;
    var title = list.length > 1 ? list.length + ' CEO buys scoring 60+' : list[0].ticker + ': CEO bought ' + money(list[0].value);
    var body = list.slice(0, 3).map(function (t) { return t.insider + ' · ' + t.ticker + ' · score ' + score(t).total; }).join('\n');
    try { if (swReg && swReg.showNotification) swReg.showNotification(title, { body: body, tag: 'cib' }); else new Notification(title, { body: body }); } catch (e) {}
  }
  function toggleBell() {
    if (NOTIFY) { NOTIFY = false; store.set('cib_notify', false); renderFilters(); toast('Alerts off'); return; }
    if (!('Notification' in window)) { toast('This browser can\'t show alerts. Use the ntfy app (see README).'); return; }
    Notification.requestPermission().then(function (p) {
      NOTIFY = p === 'granted'; store.set('cib_notify', NOTIFY); renderFilters();
      toast(NOTIFY ? 'Alerts on for score 60+ (experimental) and your watchlist, while this page is open' : 'Alerts are blocked in your browser settings');
    });
  }

  /* =================== chart sheet (drag to dismiss, springs) =================== */
  // Spring with Apple's two knobs: damping ratio (1 = no bounce) and response (seconds).
  function spring(from, to, v0, damping, response, onFrame, onDone) {
    var k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response, x = from, v = v0 || 0, last = performance.now(), id;
    (function step(now) {
      var dt = Math.max(0, Math.min(0.032, (now - last) / 1000)); last = now;
      for (var i = 0; i < 2; i++) { var a = -k * (x - to) - c * v; v += a * dt / 2; x += v * dt / 2; }
      if (Math.abs(x - to) < 1 && Math.abs(v) < 20) { onFrame(to); if (onDone) onDone(); return; }
      onFrame(x); id = requestAnimationFrame(step);
    })(last);
    return function () { cancelAnimationFrame(id); };
  }
  function rubberband(over, dim) { var c = 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }
  function project(v) { var d = 0.998; return (v / 1000) * d / (1 - d); }

  var sh = { y: 0, h: 600, stop: null, trade: null, range: '6M', lastFocus: null };
  function setY(y) {
    sh.y = y;
    $('sheet-panel').style.transform = 'translateY(' + Math.max(-40, y).toFixed(1) + 'px)';
    $('scrim').style.opacity = String(Math.max(0, Math.min(1, 1 - y / sh.h)));
  }
  function openSheet(t) {
    sh.trade = t; sh.lastFocus = document.activeElement;
    $('sheet').hidden = false; document.body.style.overflow = 'hidden';
    sh.h = $('sheet-panel').offsetHeight || 600;
    drawSheet();
    if (sh.stop) sh.stop();
    if (REDUCED) { setY(0); } else { setY(sh.h); sh.stop = spring(sh.h, 0, 0, 1, 0.42, setY); }
    $('sh-close').focus();
  }
  function closeSheet(v) {
    if (sh.stop) sh.stop();
    function done() { $('sheet').hidden = true; document.body.style.overflow = ''; if (sh.lastFocus && sh.lastFocus.focus) sh.lastFocus.focus(); }
    if (REDUCED) { done(); return; }
    sh.stop = spring(sh.y, sh.h, v || 0, 1, 0.28, setY, done);
  }
  (function dragSheet() {
    var grab = $('sheet-grab'), startY = 0, y0 = 0, hist = [], dragging = false, pid = null;
    grab.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#sh-close')) return;
      if (sh.stop) sh.stop(); // grab it mid-flight
      pid = e.pointerId; grab.setPointerCapture(pid); dragging = true;
      startY = e.clientY; y0 = sh.y; hist = [{ y: e.clientY, t: e.timeStamp }];
    });
    grab.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var ny = y0 + (e.clientY - startY);
      setY(ny < 0 ? rubberband(ny, sh.h) : ny);
      hist.push({ y: e.clientY, t: e.timeStamp }); if (hist.length > 6) hist.shift();
    });
    function end(e) {
      if (!dragging) return; dragging = false;
      var a = hist[0], b = hist[hist.length - 1], v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0;
      if (sh.y + project(v) > sh.h * 0.4) closeSheet(v);
      else sh.stop = spring(sh.y, 0, v, Math.abs(v) > 300 ? 0.8 : 1, 0.3, setY);
    }
    grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
  })();
  $('scrim').addEventListener('click', function () { closeSheet(0); });
  $('sh-close').addEventListener('click', function () { closeSheet(0); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(0); });

  var SERIES = {};
  function getSeries(tk) {
    if (SERIES[tk]) return Promise.resolve(SERIES[tk]);
    var name = tk.toUpperCase().replace(/[^A-Z0-9._-]/g, '_');
    return fetch('prices/' + encodeURIComponent(name) + '.json').then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (s) { return (SERIES[tk] = { d: s.d, c: s.c, full: true }); })
      .catch(function () {
        var s = SPARK[tk];
        return s ? (SERIES[tk] = { d: s.o.map(function (o) { return s.d0 + o; }), c: s.c, full: false }) : null;
      });
  }
  var RANGES = [['1M', 31], ['3M', 92], ['6M', 183], ['1Y', 366]];
  function drawSheet() {
    var t = sh.trade;
    $('sh-title').textContent = t.ticker + ' · ' + t.company;
    $('sh-sub').textContent = t.insider + ' bought ' + money(t.value) + (t.price ? ' at ' + p2(t.price) : '') + ' on ' + day(t.date, true);
    $('sh-ranges').innerHTML = RANGES.map(function (r) {
      return '<button type="button" class="chip' + (r[0] === sh.range ? ' is-on' : '') + '" data-r="' + r[0] + '" aria-pressed="' + (r[0] === sh.range) + '">' + r[0] + '</button>';
    }).join('');
    $('sh-chart').innerHTML = '';
    getSeries(t.ticker).then(function (s) {
      if (sh.trade !== t) return;
      if (!s) { $('sh-chart').innerHTML = '<div class="empty">No price history for ' + esc(t.ticker) + ' yet.</div>'; $('sh-readout').innerHTML = ''; $('sh-stats').innerHTML = ''; return; }
      $('sh-note').textContent = s.full ? '' : 'Showing the last 2 months. Full history loads once the site is online.';
      chart(t, s);
    });
  }
  function smooth(xs, ys) { // monotone cubic: smooth, never overshoots a real close
    var n = xs.length, i;
    if (n < 3) return xs.map(function (x, k) { return (k ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[k].toFixed(1); }).join('');
    var dx = [], m = [], tg = [];
    for (i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
    tg[0] = m[0]; tg[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { tg[i] = tg[i + 1] = 0; continue; }
      var a = tg[i] / m[i], b = tg[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { var q = 3 / Math.sqrt(h); tg[i] = q * a * m[i]; tg[i + 1] = q * b * m[i]; }
    }
    var d = 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var c = dx[i] / 3;
      d += 'C' + (xs[i] + c).toFixed(1) + ' ' + (ys[i] + c * tg[i]).toFixed(1) + ' ' + (xs[i + 1] - c).toFixed(1) + ' ' + (ys[i + 1] - c * tg[i + 1]).toFixed(1) + ' ' + xs[i + 1].toFixed(1) + ' ' + ys[i + 1].toFixed(1);
    }
    return d;
  }
  function ticks(lo, hi, n) {
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (f) { return f * mag; }).filter(function (s) { return s >= raw; })[0] || 10 * mag, out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  function chart(t, s) {
    var n0 = s.d.length, lastD = s.d[n0 - 1], days = RANGES.filter(function (r) { return r[0] === sh.range; })[0][1];
    var i0 = 0; while (i0 < n0 - 2 && s.d[i0] < lastD - days) i0++;
    var D = s.d.slice(i0), C = s.c.slice(i0), n = D.length;
    var buys = TRADES.filter(function (x) { return x.ticker === t.ticker && x.price && epoch(x.date) >= D[0]; });
    var W = Math.round(Math.max(320, Math.min(720, $('sh-chart').clientWidth || 640))), H = W < 500 ? 240 : 300, L = 8, R = 62, T = 18, B = 28; // 1 SVG unit = 1 px, so labels stay readable on phones
    var lo = Math.min.apply(null, C), hi = Math.max.apply(null, C), inR = t.price && epoch(t.date) >= D[0];
    if (inR) { lo = Math.min(lo, t.price); hi = Math.max(hi, t.price); }
    var pad = (hi - lo) * 0.1 || hi * 0.05; lo = Math.max(0, lo - pad); hi += pad;
    function PX(i) { return L + (n === 1 ? 0 : i / (n - 1)) * (W - L - R); }
    function PY(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
    function at(e) { var k = 0; for (var i = 0; i < n; i++) if (D[i] <= e) k = i; return k; }
    var xs = C.map(function (_, i) { return PX(i); }), ys = C.map(PY), line = smooth(xs, ys);
    var area = line + 'L' + xs[n - 1].toFixed(1) + ' ' + (H - B) + 'L' + xs[0].toFixed(1) + ' ' + (H - B) + 'Z', dir = C[n - 1] >= C[0] ? 'up' : 'dn';
    var paidY = inR ? PY(t.price) : null, g = '';
    ticks(lo, hi, 4).forEach(function (v) {
      var y = PY(v); if (y < T - 2 || y > H - B + 2) return;
      g += '<line class="pc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
      if (paidY == null || Math.abs(y - paidY) > 16) g += '<text class="pc-axis" x="' + (W - R + 8) + '" y="' + (y + 4).toFixed(1) + '">$' + (v >= 100 ? v.toFixed(0) : v.toFixed(v % 1 ? 2 : 0)) + '</text>';
    });
    [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1].forEach(function (k, j) {
      g += '<text class="pc-axis" x="' + xs[k].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (j === 0 ? 'start' : j === 3 ? 'end' : 'middle') + '">' + day(isoOf(D[k])) + '</text>';
    });
    var marks = '', sel = '';
    buys.forEach(function (b) {
      var k = at(epoch(b.date)), cx = xs[k], cy = ys[k];
      if (b !== t) { marks += '<circle class="pc-mk pc-in" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5"><title>' + esc(b.insider) + ' bought ' + money(b.value) + ' at ' + p2(b.price) + ' on ' + day(b.date, true) + '</title></circle>'; return; }
      var txt = 'Bought ' + money(b.value) + ' @ ' + p2(b.price), w = txt.length * 6.7 + 20, h = 26, tx = Math.max(L, Math.min(W - R - w - 4, cx - w / 2)), above = cy - 46 > T, ty = above ? cy - 46 : cy + 18;
      sel = '<g class="pc-in"><line class="pc-stem" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" y2="' + (above ? ty + h : ty).toFixed(1) + '"/>' +
        '<rect class="pc-tag" x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="8"/><text class="pc-tagtxt" x="' + (tx + w / 2).toFixed(1) + '" y="' + (ty + 17).toFixed(1) + '" text-anchor="middle">' + esc(txt) + '</text>' +
        '<circle class="pc-halo" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="12"/><circle class="pc-sel" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="6.5"/></g>';
    });
    var paid = paidY == null ? '' : '<g class="pc-in"><line class="pc-paid" x1="' + L + '" x2="' + (W - R) + '" y1="' + paidY.toFixed(1) + '" y2="' + paidY.toFixed(1) + '"/><rect class="pc-paidtag" x="' + (W - R + 3) + '" y="' + (paidY - 11).toFixed(1) + '" width="' + (R - 4) + '" height="22" rx="6"/><text class="pc-paidtxt" x="' + (W - R + 3 + (R - 4) / 2) + '" y="' + (paidY + 4).toFixed(1) + '" text-anchor="middle">' + p2(t.price) + '</text></g>';
    var box = $('sh-chart');
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' + esc(t.ticker) + ' price over ' + sh.range + ' with CEO buys marked. Use left and right arrow keys to read prices.">' +
      '<defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pc-s0 ' + dir + '"/><stop offset="1" class="pc-s1 ' + dir + '"/></linearGradient>' +
      '<clipPath id="pcc"><rect id="pcc-r" x="0" y="0" width="' + (REDUCED ? W : 0) + '" height="' + H + '"/></clipPath></defs>' + g +
      '<g clip-path="url(#pcc)"><path class="pc-area" d="' + area + '"/><path class="pc-line ' + dir + '" d="' + line + '"/></g>' + paid + marks + sel +
      '<g id="pc-cur" class="pc-cur" style="opacity:0"><line class="pc-cross" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '"/><circle class="pc-dot" cx="0" cy="0" r="5"/></g></svg>';
    var svg = box.querySelector('svg'), clip = $('pcc-r');
    if (!REDUCED) { var t0 = performance.now(); (function grow(now) { var k = Math.max(0, Math.min(1, (now - t0) / 700)), e = 1 - Math.pow(1 - k, 3); clip.setAttribute('width', (W * e).toFixed(1)); if (k < 1) requestAnimationFrame(grow); else svg.classList.add('is-drawn'); })(t0); }
    else svg.classList.add('is-drawn');
    $('sh-readout').innerHTML = '<span id="ro-d"></span><span class="readout__p" id="ro-p"></span><span id="ro-c"></span>';
    var cur = n - 1, curG = $('pc-cur'), dot = curG.querySelector('.pc-dot');
    function read(k, live) {
      var v = C[k], sb = t.price ? (v / t.price - 1) * 100 : null;
      $('ro-d').textContent = day(isoOf(D[k]), true) + (live ? '' : ' · latest');
      roll($('ro-p'), p2(v), live ? 200 : 600);
      if (sb != null) { $('ro-c').className = sb < 0 ? 'neg' : 'pos'; roll($('ro-c'), signPct(sb) + ' vs buy price', live ? 200 : 600); }
      curG.style.opacity = live ? 1 : 0; curG.style.transform = 'translateX(' + xs[k].toFixed(1) + 'px)'; dot.setAttribute('cy', ys[k].toFixed(1));
    }
    function idx(ev) { var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W; return Math.max(0, Math.min(n - 1, Math.round((x - L) / (W - L - R) * (n - 1)))); }
    svg.addEventListener('pointermove', function (e) { var k = idx(e); if (k !== cur) { cur = k; read(k, true); } });
    svg.addEventListener('pointerdown', function (e) { cur = idx(e); read(cur, true); });
    svg.addEventListener('pointerleave', function () { cur = n - 1; read(cur, false); });
    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') cur = Math.max(0, cur - 1); else if (e.key === 'ArrowRight') cur = Math.min(n - 1, cur + 1); else return;
      e.preventDefault(); read(cur, true);
    });
    read(n - 1, false);
    var q = quote(t.ticker), sb = q && t.price ? (q.last / t.price - 1) * 100 : null;
    $('sh-stats').innerHTML = [['Price paid', p2(t.price)], ['Latest close', q ? p2(q.last) : p2(C[n - 1])],
      ['Since buy', sb != null ? signPct(sb) : '—', sb != null ? (sb < 0 ? 'neg' : 'pos') : ''], ['Fell before buy', t.dip ? '−' + t.dip.pct + '%' : '—', t.dip ? 'neg' : '']]
      .map(function (x) { return '<div><span class="k">' + x[0] + '</span><div class="v ' + (x[2] || '') + '" data-roll="' + esc(x[1]) + '"></div></div>'; }).join('');
    Array.prototype.forEach.call($('sh-stats').querySelectorAll('[data-roll]'), function (el) { roll(el, el.getAttribute('data-roll'), 700); });
  }
  $('sh-ranges').addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return; sh.range = b.getAttribute('data-r'); drawSheet();
  });

  /* =================== Congress (loaded on first open) =================== */
  var POL = null, cst = { q: '', f: 'all', limit: 40, open: {} };
  var CF = [['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells'], ['House', 'House'], ['Senate', 'Senate'], ['D', 'Democrats'], ['R', 'Republicans']];
  function polRows() {
    return POL.trades.filter(function (t) {
      if (cst.f === 'buy' || cst.f === 'sell') { if (t.type !== cst.f) return false; }
      else if (cst.f === 'House' || cst.f === 'Senate') { if (t.role !== cst.f) return false; }
      else if (cst.f === 'D' || cst.f === 'R') { if (t.party !== cst.f) return false; }
      if (!cst.q) return true;
      return (t.name + ' ' + t.ticker + ' ' + (t.company || '')).toLowerCase().indexOf(cst.q.toLowerCase()) >= 0;
    }).sort(function (a, b) { return (b.filed || b.traded).localeCompare(a.filed || a.traded) || b.traded.localeCompare(a.traded); });
  }
  function polRow(t) {
    var lag = t.filed ? daysApart(t.traded, t.filed) : null, buy = t.type === 'buy', open = !!cst.open[t.id];
    return '<article class="row' + (open ? ' is-open' : '') + '" data-pid="' + esc(t.id) + '">' +
      '<button type="button" class="row__head" aria-expanded="' + open + '"><span class="cav cav--' + (t.party || 'I') + '">' + esc(initials(t.name)) + '</span>' +
      '<span class="row__main"><span class="row__l1"><span class="row__co">' + esc(t.name) + '</span><span class="tk">' + esc(t.ticker) + '</span></span>' +
      '<span class="row__l2"><span>' + esc((t.party || '?') + '-' + (t.state || '') + ' · ' + t.role) + '</span><span>Traded ' + day(t.traded) + (lag != null ? ', public ' + lag + ' days later' : '') + '</span></span></span>' +
      '<span class="row__right"><span class="pill pill--' + (buy ? 'buy' : 'sell') + '">' + (buy ? 'Bought' : 'Sold') + '</span><div class="row__stake" style="color:var(--text-2)" title="' + esc(t.amount) + '">' + esc(shortRange(t.amount)) + '</div></span></button>' +
      '<div class="row__body"><div class="row__inner">' + (open ? polBody(t) : '') + '</div></div></article>';
  }
  function shortRange(a) { // "$1,001 - $15,000" -> "$1K–$15K"
    var n = String(a || '').match(/[\d,]+/g);
    if (!n) return a || '';
    return n.slice(0, 2).map(function (x) { return money(Math.round(+x.replace(/,/g, '') / 1000) * 1000 || +x.replace(/,/g, '')); }).join('–') + (n.length === 1 && /over|\+/i.test(a) ? '+' : '');
  }
  function polBody(t) {
    var lag = t.filed ? daysApart(t.traded, t.filed) : null;
    return '<div class="row__pad"><dl class="kv">' +
      '<div><dt>Amount</dt><dd style="font-size:.875rem">' + esc(t.amount) + '</dd></div>' +
      '<div><dt>Asset</dt><dd style="font-size:.875rem">' + esc(t.company || t.ticker) + '</dd></div>' +
      '<div><dt>Owner</dt><dd>' + esc(t.owner || 'Self') + '</dd></div>' +
      '<div><dt>Traded</dt><dd>' + day(t.traded, true) + '</dd></div>' +
      '<div><dt>Made public</dt><dd>' + (t.filed ? day(t.filed, true) : '—') + (lag != null ? '<small>' + lag + ' days later' + (lag > 45 ? ', past the 45-day limit' : '') + '</small>' : '') + '</dd></div></dl>' +
      '<p class="fine">Amount is a range. Members only have to report the bracket, not the exact figure.</p>' +
      '<div>' + (t.url ? srcLink({ label: 'Official ' + (t.role === 'Senate' ? 'Senate' : 'House') + ' filing', url: t.url }) : '') + (t.sources || []).map(srcLink).join('') + '</div></div>';
  }
  function renderCongress() {
    var list = polRows();
    $('c-filters').innerHTML = CF.map(function (f) { return '<button type="button" class="chip' + (cst.f === f[0] ? ' is-on' : '') + '" data-cf="' + f[0] + '" aria-pressed="' + (cst.f === f[0]) + '">' + f[1] + '</button>'; }).join('');
    $('c-feed').innerHTML = list.slice(0, cst.limit).map(polRow).join('') || '<div class="empty">No trades match.</div>';
    $('c-more').hidden = list.length <= cst.limit;
  }
  function openCongress() {
    if (POL) return;
    $('c-feed').innerHTML = '<div class="empty">Loading Congress trades…</div>';
    loadScript('politics.js').then(function () {
      POL = window.POLITICS_DATA || { trades: [] };
      POL.trades = (POL.trades || []).filter(function (t) { return t && t.ticker && t.traded && t.type !== 'exchange'; });
      var buys = POL.trades.filter(function (t) { return t.type === 'buy'; }).length, people = {}, lags = [];
      POL.trades.forEach(function (t) { var p = people[t.name] = people[t.name] || { t: t, b: 0, s: 0 }; t.type === 'buy' ? p.b++ : p.s++; if (t.filed) lags.push(daysApart(t.traded, t.filed)); });
      lags.sort(function (a, b) { return a - b; });
      $('c-summary').innerHTML = '<b>' + POL.trades.length + '</b> trades · <b>' + buys + '</b> buys · <b>' + Object.keys(people).length + '</b> people · made public a median <b>' + (lags[Math.floor(lags.length / 2)] || 0) + ' days</b> after the trade';
      var top = Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) { return (b.b + b.s) - (a.b + a.s); }).slice(0, 8);
      $('c-people').innerHTML = '<h2>Most active</h2><div class="people">' + top.map(function (p) {
        return '<div class="hist__r"><span class="cav cav--' + (p.t.party || 'I') + '" style="width:32px;height:32px;font-size:.75rem">' + esc(initials(p.t.name)) + '</span><span><strong>' + esc(p.t.name) + '</strong> <span class="fine">' + esc((p.t.party || '?') + '-' + (p.t.state || '') + ' · ' + p.t.role) + '</span></span><span><span class="pos">' + p.b + ' buys</span> · <span class="neg">' + p.s + ' sells</span></span></div>';
      }).join('') + '</div>';
      $('c-figures').innerHTML = (POL.figures || []).map(function (f) {
        return '<h2>' + esc(f.name) + ' <span class="fine">' + esc(f.role) + '</span></h2><p class="fine">' + esc(f.summary) + '</p><ul style="margin:0;padding-left:18px;display:grid;gap:6px;font-size:.9375rem">' +
          (f.facts || []).map(function (x) { return '<li>' + esc(typeof x === 'string' ? x : x.text) + ' ' + (x.src ? srcLink(x.src) : '') + '</li>'; }).join('') + '</ul>' +
          (f.holdings ? '<p class="fine"><strong>Holdings:</strong> ' + esc(f.holdings) + '</p>' : '') + '<div>' + (f.links || []).map(srcLink).join('') + '</div>';
      }).join('') + (POL.holdingsLinks || []).map(srcLink).join('');
      renderCongress();
    }).catch(function () { $('c-feed').innerHTML = '<div class="empty">Couldn\'t load Congress trades.</div>'; });
  }

  /* =================== tabs, events, start =================== */
  function show(view) {
    view = view === 'congress' ? 'congress' : 'buys';
    ['buys', 'congress'].forEach(function (v) {
      var on = v === view, panel = $('view-' + v);
      if (on && panel.hidden) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
      panel.hidden = !on;
      $('tab-' + v).classList.toggle('is-on', on); $('tab-' + v).setAttribute('aria-selected', String(on));
    });
    document.querySelector('.seg').setAttribute('data-on', view);
    if (view === 'congress') openCongress();
  }
  document.querySelector('.seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]'); if (!b) return;
    history.replaceState(null, '', '#' + b.getAttribute('data-view')); show(b.getAttribute('data-view')); window.scrollTo(0, 0);
  });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });

  document.addEventListener('click', function (e) {
    var el;
    if ((el = e.target.closest('[data-chart]'))) { openSheet(byId(el.getAttribute('data-chart'))); return; }
    if ((el = e.target.closest('[data-watch]'))) {
      var tk = el.getAttribute('data-watch'), i = WATCH.indexOf(tk);
      if (i >= 0) WATCH.splice(i, 1); else WATCH.push(tk);
      store.set('cib_watch', WATCH);
      var on = WATCH.indexOf(tk) >= 0;
      Array.prototype.forEach.call(document.querySelectorAll('[data-watch="' + CSS.escape(tk) + '"]'), function (b) { b.textContent = on ? '★ Watching' : '☆ Watch'; b.setAttribute('aria-pressed', String(on)); });
      toast(on ? tk + ' added to your watchlist' : tk + ' removed from your watchlist');
      renderFilters(); return;
    }
    if ((el = e.target.closest('[data-jump]'))) { show('buys'); jumpTo(el.getAttribute('data-jump')); return; }
    if ((el = e.target.closest('#feed .row__head'))) { toggleRow(el.closest('.row').getAttribute('data-id')); return; }
    if ((el = e.target.closest('#c-feed .row__head'))) {
      var r = el.closest('.row'), id = r.getAttribute('data-pid'), t = POL.trades.filter(function (x) { return x.id === id; })[0], open = !r.classList.contains('is-open');
      cst.open[id] = open;
      if (open && !r.querySelector('.row__pad')) r.querySelector('.row__inner').innerHTML = polBody(t);
      requestAnimationFrame(function () { r.classList.toggle('is-open', open); el.setAttribute('aria-expanded', String(open)); });
      return;
    }
    if ((el = e.target.closest('#bell'))) { toggleBell(); return; }
    if ((el = e.target.closest('[data-f]'))) { st.f = el.getAttribute('data-f'); st.limit = 40; renderFilters(); renderFeed(); return; }
    if ((el = e.target.closest('[data-cf]'))) { cst.f = el.getAttribute('data-cf'); cst.limit = 40; renderCongress(); return; }
    if (e.target.closest('#live')) { toast(liveOk ? 'Checking the SEC every 30 seconds. Last check ' + ago(lastCheck) + '.' : 'Live feed off here. Data last updated ' + $('live-text').textContent.replace('Updated ', '') + '.'); }
  });
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d.matches || !d.matches('details.more-d') || !d.open) return;
    var t = byId(d.getAttribute('data-more')), body = $('m-' + d.getAttribute('data-more'));
    body.innerHTML = knowMoreHtml(t);
    ensureCompanies().then(function () { body.innerHTML = knowMoreHtml(t); renderTrack(); });
  }, true);
  var qt;
  $('q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { st.q = e.target.value.trim(); st.limit = 40; renderFeed(); }, 80); });
  $('cq').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { cst.q = e.target.value.trim(); cst.limit = 40; renderCongress(); }, 80); });
  $('sort').addEventListener('change', function (e) { st.sort = e.target.value; renderFeed(); });
  $('more').addEventListener('click', function () { st.limit += 40; renderFeed(); });
  $('c-more').addEventListener('click', function () { cst.limit += 40; renderCongress(); });

  renderSummary(); renderFilters(); renderFeed(); renderTape(); renderTrack(); liveLabel();
  show(location.hash.slice(1));
  poll(); setInterval(poll, 30000); setInterval(liveLabel, 10000);
  window.CIV = { trades: TRADES, score: score, open: openSheet }; // handy for debugging in the console
})();
