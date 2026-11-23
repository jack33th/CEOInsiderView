(function () {
  'use strict';

  var DATA = window.INSIDER_DATA || { trades: [] };
  var TRADES = (DATA.trades || []).filter(function (t) { return t && t.date && t.ticker; });
  // Once real SEC rows exist, show only those so every number is exact.
  var HAS_SEC = TRADES.some(function (t) { return t.source === 'sec'; });
  if (HAS_SEC) TRADES = TRADES.filter(function (t) { return t.source === 'sec'; });
  // Unverified rows stay out of every summary (stats, clusters, dips, charts); they only appear in the full feed.
  function VER() { return TRADES.filter(function (t) { return t.source !== 'screenshot'; }); }
  var DIP_MIN = 25; // percent below peak that counts as "bought the dip"

  var SOURCE = {
    sec:        { label: 'SEC filing',     cls: 'badge--sec',       rank: 3 },
    official:   { label: 'Official',       cls: 'badge--sec',       rank: 3 },
    confirmed:  { label: 'Confirmed',      cls: 'badge--confirmed', rank: 2 },
    reported:   { label: 'Reported',       cls: 'badge--reported',  rank: 1 },
    screenshot: { label: 'Unverified',     cls: 'badge--shot',      rank: 0 }
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 999500) return '$' + Number((v / 1e6).toFixed(1)) + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function price(t) {
    if (t.price == null) return '—';
    var p = t.price >= 1 ? t.price.toFixed(2) : t.price.toFixed(3);
    return (t.approxPrice ? '~' : '') + '$' + p.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function stamp(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function num(n) { return n == null ? null : n.toLocaleString('en-US'); }
  function parseDay(iso) { return new Date(iso + 'T00:00:00Z'); }
  function dayLabel(iso, withYear) {
    var o = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (withYear) o.year = 'numeric';
    return parseDay(iso).toLocaleDateString('en-US', o);
  }
  function isWeekend(iso) { var d = parseDay(iso).getUTCDay(); return d === 0 || d === 6; }
  function edgarUrl(ticker) {
    return 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + encodeURIComponent(ticker) +
      '&type=4&dateb=&owner=include&count=40';
  }
  function sum(list, fn) { return list.reduce(function (a, t) { return a + (fn(t) || 0); }, 0); }
  function badge(src) {
    var s = SOURCE[src] || SOURCE.reported;
    return '<span class="badge ' + s.cls + '">' + s.label + '</span>';
  }
  function tile(ticker) { return '<div class="tile" aria-hidden="true">' + esc(ticker.slice(0, 4)) + '</div>'; }

  /* ---------- research the reasons lean on (each one linked) ---------- */
  var RESEARCH = {
    contrarian: { text: 'Research summary: insiders tend to buy after their stock has fallen, and act as contrarians with better information.',
                  label: 'Interactive Brokers: academic evidence on insider buying',
                  url: 'https://www.interactivebrokers.com/campus/traders-insight/securities/stocks/what-corporate-insider-buying-can-tell-investors-evidence-from-academic-research/' },
    cluster:    { text: 'One study found purchases by several insiders at once earned about twice the 21-day abnormal return of single purchases (3.8% vs 2%).',
                  label: 'Study on cluster insider trades (PDF)', url: 'https://journal.tinkoff.ru/media/insider-pdf-002.pdf' }
  };

  function fmtPrice(v) { return v == null ? '—' : '$' + (v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function srcOf(t) { return (t.sources && t.sources[0]) || (t.url ? { label: 'SEC Form 4 filing', url: t.url } : null); }
  function daysApart(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

  /* Possible reasons. Each has: text (the idea), how (the numbers behind it), src (where they came from),
     and optionally research (a published finding that supports reading it this way). */
  function reasons(t) {
    var out = [];
    if (/return|new\b|interim|appointed|incoming/i.test(t.title || '')) {
      out.push({ text: 'Possibly to show commitment as a new or returning CEO.',
                 how: 'Their title in our data is "' + esc(t.title) + '".', src: srcOf(t) });
    }
    if (t.dip && t.dip.pct >= 20) {
      var how = t.dip.how ? esc(t.dip.how) : '', s = window.INSIDER_PRICES && window.INSIDER_PRICES[t.ticker], dsrc = t.dip.src;
      if (!how && s && t.price) { // work it out from daily closes
        var td = Math.round(parseDay(t.date).getTime() / 864e5), pk = -1, pd = null;
        for (var i = 0; i < s.d.length; i++) if (s.d[i] >= td - 90 && s.d[i] <= td && s.c[i] > pk) { pk = s.c[i]; pd = s.d[i]; }
        if (pk > 0) {
          how = 'Paid ' + fmtPrice(t.price) + '. Highest close in the 90 days before was ' + fmtPrice(pk) + ' on ' +
            dayLabel(new Date(pd * 864e5).toISOString().slice(0, 10), true) + '.';
          dsrc = { label: 'Daily closes: ' + (s.s || 'price feed'), url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(t.ticker) + '/history' };
        }
      }
      out.push({ text: 'Bought after a big drop: ' + t.dip.pct + '% below the ' + esc(t.dip.base || 'recent peak') + '. The CEO may think the stock is now too cheap.',
                 how: how, src: dsrc, research: RESEARCH.contrarian });
    }
    var mine = TRADES.filter(function (x) { return x.ticker === t.ticker && x.insider === t.insider && x.date < t.date; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (mine.length) {
      var prev = mine[0], lower = prev.price && t.price && t.price < prev.price;
      out.push({ text: 'Came back for more, ' + daysApart(prev.date, t.date) + ' days after the last buy' +
                 (lower ? ', at a lower price. That can mean conviction, or averaging down on a losing position.' : '.'),
                 how: 'Earlier buy: ' + dayLabel(prev.date, true) + ', ' + money(prev.value) + ' at ' + fmtPrice(prev.price) + '.', src: srcOf(prev) });
    }
    var others = TRADES.filter(function (x) { return x.ticker === t.ticker && x.insider !== t.insider; })
      .map(function (x) { return esc(x.insider) + ' on ' + dayLabel(x.date); }).concat((t.also || []).map(esc));
    if (others.length) {
      out.push({ text: 'Other insiders bought the same stock around the same time.',
                 how: 'Also buying: ' + others.join('; ') + '.', src: srcOf(t), research: RESEARCH.cluster });
    }
    if (t.value >= 25e4) {
      out.push({ text: (t.value >= 1e6 ? 'A large' : 'A meaningful') + ' personal bet of ' + money(t.value) + '.',
                 how: t.shares && t.price ? num(t.shares) + ' shares × ' + fmtPrice(t.price) + ' = ' + money(t.shares * t.price) + '.'
                                         : 'Dollar value as reported by the source.', src: srcOf(t) });
    }
    if (!out.length) {
      out.push({ text: 'No clear trigger in the data.',
                 how: 'None of our checks matched: no drop of 20% or more, no repeat buy, no other insiders buying, and under $250K.', src: null });
    }
    return out;
  }
  function srcLink(s) {
    return s && s.url ? '<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' : '';
  }
  function reasonsHtml(t) {
    var warn = t.source === 'screenshot' ? '<p class="warn">These reasons use unverified numbers from a screenshot.</p>' : '';
    return warn + '<ol class="reasons">' + reasons(t).map(function (r) {
      return '<li><div class="reason__t">' + r.text + '</div>' +
        (r.how ? '<div class="reason__how"><span>How we know:</span> ' + r.how + '</div>' : '') +
        (r.src ? '<div class="reason__src"><span>Source:</span> ' + srcLink(r.src) + '</div>' : '') +
        (r.research ? '<div class="reason__res">' + esc(r.research.text) + ' ' + srcLink(r.research) + '</div>' : '') +
        '</li>';
    }).join('') + '</ol>';
  }

  /* ---------- card ---------- */
  function filedText(t) {
    if (t.filedAt) {
      return new Date(t.filedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    }
    return t.filedOn ? dayLabel(t.filedOn, true) : 'Not known';
  }
  function card(t) {
    var dip = t.dip && t.dip.pct != null ? t.dip : null;
    var filedIso = t.filedAt ? t.filedAt.slice(0, 10) : t.filedOn;
    var lag = filedIso ? daysApart(t.date, filedIso) : null;
    var head = '<p class="headline"><strong>' + esc(t.insider) + '</strong>, ' + esc(roleOf(t)) + ' of ' + esc(t.company) +
      ', bought <strong>' + money(t.value) + '</strong> of stock' + (t.price != null ? ' at ' + price(t) + ' a share' : '') + '.</p>';
    var facts = [
      ['Bought on', dayLabel(t.date, true)],
      ['Filed with SEC', filedText(t) + (lag != null ? '<small>' + (lag === 0 ? 'same day' : lag + (lag === 1 ? ' day' : ' days') + ' later') + '</small>' : '')],
      ['Shares', t.shares ? num(t.shares) : 'Not reported'],
      ['Price paid', price(t) + (t.approxPrice ? '<small>worked out from value ÷ shares</small>' : '')]
    ];
    if (dip) facts.push(['Fallen from high', '<span class="neg">&minus;' + dip.pct + '%</span><small>vs ' + esc(dip.base || 'peak') + '</small>']);
    if (t.sinceBought != null) facts.push(['Stock since then', '<span class="' + (t.sinceBought < 0 ? 'neg' : 'pos') + '">' +
      (t.sinceBought < 0 ? '&minus;' : '+') + Math.abs(t.sinceBought).toFixed(1) + '%</span>']);
    var grid = '<dl class="facts-grid">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>';

    var extra = '';
    if (t.also && t.also.length) extra += '<p class="card__also">Also: ' + t.also.map(esc).join('; ') + '</p>';
    if (t.note) extra += '<p class="card__note">' + esc(t.note) + '</p>';
    var n = reasons(t).length;
    extra += '<details class="why-d"><summary>Possible reasons (' + n + ') and how we know</summary>' + reasonsHtml(t) + '</details>';
    var srcs = (t.sources || []).map(srcLink).join('');
    extra += '<div class="srcs"><span>Sources:</span> ' + (srcs || '<em>none, unverified</em>') + '</div>';

    return '<article class="card">' +
      '<div class="card__head">' + tile(t.ticker) +
      '<div class="card__id"><div class="card__ticker">' + esc(t.company) + ' <span class="tk">' + esc(t.ticker) + '</span></div>' +
      '<div class="card__co">' + badge(t.source) + (t.exchange ? ' · ' + esc(t.exchange) : '') + '</div></div>' +
      '<button type="button" class="card__btn" data-id="' + esc(t.id) + '" aria-label="Price chart for ' + esc(t.ticker) + '">Chart</button></div>' +
      head + grid + extra + '</article>';
  }
  function roleOf(t) {
    var s = (t.title || '').toLowerCase();
    return /chief executive|ceo/.test(s) ? 'CEO' : (t.title || 'Exec');
  }

  /* ---------- sections ---------- */
  function renderStats() {
    var total = sum(VER(), function (t) { return t.value; });
    var cos = {}; VER().forEach(function (t) { cos[t.ticker] = 1; });
    $('stats').innerHTML =
      stat('CEO buys', String(VER().length)) +
      stat('Total bought', money(total), true) +
      stat('Companies', String(Object.keys(cos).length));
    if (!liveText) $('updated').textContent = !DATA.updated ? '' :
      DATA.updated.length === 10 ? 'Updated ' + dayLabel(DATA.updated, true) : 'Updated ' + stamp(DATA.updated);
    $('coverage').textContent = DATA.coverage || '';
  }
  function stat(k, v, green) {
    return '<div class="stat"><div class="stat__label">' + k + '</div><div class="stat__value' +
      (green ? ' stat__value--green' : '') + '">' + v + '</div></div>';
  }

  function groups() {
    var g = {};
    VER().forEach(function (t) { (g[t.ticker] = g[t.ticker] || []).push(t); });
    return Object.keys(g).map(function (k) {
      var list = g[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var also = sum(list, function (t) { return t.also ? t.also.length : 0; });
      var people = {}; list.forEach(function (t) { people[t.insider] = 1; });
      return { ticker: k, list: list, buys: list.length, insiders: Object.keys(people).length + also,
               total: sum(list, function (t) { return t.value; }) };
    });
  }

  function renderClusters() {
    var cl = groups().filter(function (g) { return g.buys >= 2 || g.insiders >= 2; })
      .sort(function (a, b) { return b.total - a.total; });
    if (!cl.length) { $('clusters').innerHTML = '<div class="empty">No repeat or cluster buys in this window.</div>'; return; }
    $('clusters').innerHTML = cl.map(function (g) {
      var first = g.list[0].date, last = g.list[g.list.length - 1].date;
      var head = g.insiders > 1 ? g.insiders + ' insiders' : g.buys + ' buys';
      var span = first === last ? dayLabel(first) : dayLabel(first) + ' – ' + dayLabel(last);
      return '<div class="cluster"><div class="cluster__top">' + tile(g.ticker) +
        '<div class="cluster__ticker">' + esc(g.ticker) + '</div></div>' +
        '<div class="cluster__n">' + head + '</div>' +
        '<div class="cluster__v">' + money(g.total) + '</div>' +
        '<div class="cluster__s">' + span + '</div></div>';
    }).join('');
  }

  function renderDips() {
    var d = VER().filter(function (t) { return t.dip && t.dip.pct >= DIP_MIN; })
      .sort(function (a, b) { return b.dip.pct - a.dip.pct; });
    $('dips').innerHTML = d.length ? d.map(function (t) { return card(t); }).join('')
      : '<div class="empty">No dip buys found yet.</div>';
  }

  /* when chart */
  var measure = 'value', selDay = null;
  function dayRange() {
    if (!VER().length) return [];
    var ds = VER().map(function (t) { return t.date; }).sort();
    var out = [], d = parseDay(ds[0]), end = parseDay(ds[ds.length - 1]);
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); }
    return out;
  }
  function renderChart() {
    var days = dayRange();
    if (!days.length) { $('chart').innerHTML = ''; return; }
    var by = {};
    VER().forEach(function (t) {
      var b = by[t.date] = by[t.date] || { value: 0, count: 0, list: [] };
      b.value += t.value || 0; b.count += 1; b.list.push(t);
    });
    var max = Math.max.apply(null, days.map(function (d) { return by[d] ? by[d][measure] : 0; })) || 1;
    if (!selDay || !by[selDay]) {
      selDay = days.reduce(function (best, d) {
        return (by[d] && (!best || by[d][measure] > by[best][measure])) ? d : best;
      }, null);
    }
    $('chart').innerHTML = days.map(function (d, i) {
      var b = by[d], v = b ? b[measure] : 0;
      var h = v ? Math.max(6, Math.round(Math.sqrt(v / max) * 100)) : 0;
      var lbl = (i === 0 || d.slice(8) === '01') ? dayLabel(d) : String(parseInt(d.slice(8), 10));
      var cls = 'col' + (b ? '' : ' col--empty') + (isWeekend(d) ? ' col--weekend' : '') + (d === selDay ? ' is-sel' : '');
      return '<button type="button" class="' + cls + '" data-d="' + d + '" aria-label="' + dayLabel(d) + ': ' +
        (b ? b.count + ' buys, ' + money(b.value) : 'no buys') + '">' +
        '<span class="col__bar" style="height:' + (h * 0.78) + '%"></span><span class="col__lbl">' + lbl + '</span></button>';
    }).join('');
    detail(by);
    Array.prototype.forEach.call($('chart').querySelectorAll('.col'), function (el) {
      el.addEventListener('click', function () { selDay = el.getAttribute('data-d'); renderChart(); });
    });
  }
  function detail(by) {
    var b = by[selDay], el = $('chart-detail');
    if (!b) { el.textContent = 'Tap a bar to see who bought that day.'; return; }
    var names = b.list.map(function (t) { return esc(t.ticker) + ' (' + money(t.value) + ')'; }).join(', ');
    var wd = parseDay(selDay).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    el.innerHTML = '<strong>' + wd + ', ' + dayLabel(selDay) + '</strong> · ' + b.count +
      (b.count === 1 ? ' buy' : ' buys') + ', ' + money(b.value) + ': ' + names;
  }

  function renderWhere() {
    var g = groups().sort(function (a, b) { return b.total - a.total; }).slice(0, 8);
    if (!g.length) { $('where').innerHTML = '<div class="empty">Nothing to show yet.</div>'; return; }
    var max = g[0].total || 1;
    $('where').innerHTML = g.map(function (x) {
      var t = x.list[0];
      return '<div class="wrow"><div class="wrow__top"><div class="wrow__name">' + esc(x.ticker) +
        ' <small>' + esc(t.company) + (t.exchange ? ' · ' + esc(t.exchange) : '') + '</small></div>' +
        '<div class="wrow__v">' + money(x.total) + '</div></div>' +
        '<div class="track"><span style="width:' + Math.max(3, Math.round(x.total / max * 100)) + '%"></span></div></div>';
    }).join('');
  }

  /* feed + filters */
  var state = { sort: 'recent', size: 0, conf: 'all' };

  function renderFeed() {
    var list = TRADES.filter(function (t) { return (t.value || 0) >= state.size; });
    if (state.conf === 'verified') {
      list = list.filter(function (t) { return t.source === 'sec' || t.source === 'confirmed'; });
    }
    list.sort(function (a, b) {
      if (state.sort === 'largest') return (b.value || 0) - (a.value || 0);
      if (state.sort === 'dip') return ((b.dip && b.dip.pct) || -1) - ((a.dip && a.dip.pct) || -1);
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.value || 0) - (a.value || 0);
    });
    $('feed').innerHTML = list.length ? list.map(function (t) { return card(t); }).join('')
      : '<div class="empty">No buys match these filters.</div>';
  }

  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  var CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';

  function dropdown(id, label, options, key, parse) {
    var root = $(id), cur = state[key];
    function text() { return options.filter(function (o) { return o.v === cur; })[0].t; }
    root.innerHTML = '<button type="button" class="dd__btn" aria-haspopup="listbox" aria-expanded="false" aria-label="' + label + '">' +
      '<span class="dd__txt">' + text() + '</span>' + CHEV + '</button>' +
      '<div class="dd__menu" role="listbox" aria-label="' + label + '">' +
      options.map(function (o) {
        return '<button type="button" class="dd__opt" role="option" data-v="' + o.v + '" aria-selected="' + (o.v === cur) + '">' +
          '<span class="dd__radio">' + CHECK + '</span>' + o.t + '</button>';
      }).join('') + '</div>';
    var btn = root.querySelector('.dd__btn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !root.classList.contains('is-open');
      closeAll();
      if (open) { root.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.dd__opt'), function (b) {
      b.addEventListener('click', function () {
        var raw = b.getAttribute('data-v');
        cur = state[key] = parse ? parse(raw) : raw;
        Array.prototype.forEach.call(root.querySelectorAll('.dd__opt'), function (x) {
          x.setAttribute('aria-selected', String(x === b));
        });
        root.querySelector('.dd__txt').textContent = text();
        closeAll(); renderFeed();
      });
    });
  }
  function closeAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.dd'), function (d) {
      d.classList.remove('is-open');
      var b = d.querySelector('.dd__btn'); if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  function initFilters() {
    dropdown('dd-sort', 'Sort', [
      { v: 'recent', t: 'Latest' }, { v: 'largest', t: 'Largest' }, { v: 'dip', t: 'Steepest dip' }
    ], 'sort');
    dropdown('dd-size', 'Minimum size', [
      { v: 0, t: 'Any size' }, { v: 50000, t: '$50K+' }, { v: 250000, t: '$250K+' }, { v: 1000000, t: '$1M+' }
    ], 'size', function (r) { return Number(r); });
    if (HAS_SEC) {
      $('dd-conf').hidden = true;
      $('filters').classList.add('two');
    } else {
      dropdown('dd-conf', 'Data quality', [
        { v: 'all', t: 'All data' }, { v: 'verified', t: 'Confirmed only' }
      ], 'conf');
    }
  }

  function initToggle() {
    var wrap = $('when-toggle');
    Array.prototype.forEach.call(wrap.querySelectorAll('.seg__btn'), function (b) {
      b.addEventListener('click', function () {
        measure = b.getAttribute('data-m');
        selDay = null; // re-pick the busiest day for the new measure
        Array.prototype.forEach.call(wrap.querySelectorAll('.seg__btn'), function (x) {
          var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on));
        });
        renderChart();
      });
    });
  }

  /* ---------- price chart (Yahoo-style) ---------- */
  var PRICES = window.INSIDER_PRICES || {};
  var DEMO = /[?&]demo(=|&|$)/.test(location.search);
  var RANGES = [['1M', 31], ['3M', 92], ['6M', 183], ['1Y', 366]];
  var cs = { id: null, range: '6M' }, lastFocus = null, demoCache = {};

  function toDate(e) { return new Date(e * 864e5).toISOString().slice(0, 10); }
  function toEpoch(iso) { return Math.round(parseDay(iso).getTime() / 864e5); }
  function p2(v) { return '$' + (v >= 1 ? v.toFixed(2) : v.toFixed(3)); }
  function pctTxt(v) { return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '%'; }
  function tradeById(id) { return TRADES.filter(function (x) { return x.id === id; })[0]; }
  function realSeries(t) { var s = PRICES[t.ticker]; return s && s.d && s.d.length > 5 ? s : null; }

  // Made-up prices for previewing the chart (only with ?demo in the address).
  function demoSeries(t) {
    if (demoCache[t.ticker]) return demoCache[t.ticker];
    var seed = 7, i;
    for (i = 0; i < t.ticker.length; i++) seed = (seed * 31 + t.ticker.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var latest = TRADES.map(function (x) { return x.date; }).sort().pop();
    var last = toEpoch(latest), td = toEpoch(t.date), days = [], e, ti = 0;
    for (e = last - 380; e <= last; e++) {
      var wd = new Date(e * 864e5).getUTCDay();
      if (wd !== 0 && wd !== 6) days.push(e);
    }
    days.forEach(function (d, k) { if (d <= td) ti = k; });
    var c = new Array(days.length); c[ti] = t.price || 10;
    var drift = Math.log(1 / (1 - Math.min(t.dip ? t.dip.pct : 8, 90) / 100)) / 60;
    for (i = ti - 1; i >= 0; i--) {
      c[i] = Math.max(0.01, c[i + 1] * Math.exp((rnd() - 0.5) * 0.05 + (ti - i <= 60 ? drift : -0.0004)));
    }
    for (i = ti + 1; i < days.length; i++) c[i] = Math.max(0.01, c[i - 1] * Math.exp((rnd() - 0.5) * 0.05));
    return (demoCache[t.ticker] = { d: days, c: c.map(function (v) { return Math.round(v * 1000) / 1000; }) });
  }
  function seriesFor(t) {
    var r = realSeries(t);
    if (r) return { d: r.d, c: r.c, demo: false };
    if (DEMO) { var s = demoSeries(t); return { d: s.d, c: s.c, demo: true }; }
    return null;
  }

  // Real price history makes "since bought" live instead of a frozen number.
  TRADES.forEach(function (t) {
    var s = realSeries(t);
    if (s && t.price) t.sinceBought = Math.round((s.c[s.c.length - 1] / t.price - 1) * 1000) / 10;
  });

  function openChart(id) {
    var t = tradeById(id); if (!t) return;
    lastFocus = document.activeElement; cs.id = id;
    var s = seriesFor(t);
    if (s) {
      var need = s.d[s.d.length - 1] - toEpoch(t.date) + 14;
      cs.range = (RANGES.filter(function (r) { return r[1] >= need; })[0] || RANGES[RANGES.length - 1])[0];
    }
    $('chart-modal').hidden = false;
    document.body.classList.add('modal-open');
    drawSheet();
    $('cm-close').focus();
  }
  function closeChart() {
    $('chart-modal').hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function drawSheet() {
    var t = tradeById(cs.id), s = seriesFor(t);
    $('cm-title').textContent = t.ticker + ' · ' + t.company;
    $('cm-sub').textContent = t.insider + ' (' + roleOf(t) + ') bought ' + money(t.value) +
      (t.price != null ? ' at ' + (t.approxPrice ? '~' : '') + p2(t.price) : '') + ' on ' + dayLabel(t.date, true);
    $('cm-demo').hidden = !(s && s.demo);

    $('cm-ranges').innerHTML = RANGES.map(function (r) {
      return '<button type="button" class="seg__btn' + (r[0] === cs.range ? ' is-on' : '') + '" data-r="' + r[0] +
        '" aria-pressed="' + (r[0] === cs.range) + '">' + r[0] + '</button>';
    }).join('');
    Array.prototype.forEach.call($('cm-ranges').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { cs.range = b.getAttribute('data-r'); drawSheet(); });
    });

    if (!s) {
      $('cm-chart').innerHTML = '<div class="empty">Price history is not loaded yet. It appears after the updater has run. ' +
        'Add ?demo to the address to preview with made-up prices.</div>';
      $('cm-readout').innerHTML = '';
      $('cm-stats').innerHTML = statsHtml([['Price paid', t.price != null ? p2(t.price) : '—'], ['Value', money(t.value)]]);
    } else {
      drawChart(t, s);
    }
    histHtml(t);
  }

  function statsHtml(items) {
    return items.map(function (x) {
      return '<div class="cm-stat"><div class="row__k">' + x[0] + '</div><div class="cm-stat__v' + (x[2] ? ' ' + x[2] : '') + '">' + x[1] + '</div></div>';
    }).join('');
  }

  function histHtml(t) {
    var list = TRADES.filter(function (x) { return x.ticker === t.ticker; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    $('cm-hist').innerHTML = '<h3>CEO buys in ' + esc(t.ticker) + '</h3>' + list.map(function (x) {
      return '<button type="button" class="hist__row' + (x.id === t.id ? ' is-cur' : '') + '" data-id="' + esc(x.id) + '">' +
        '<span><strong>' + dayLabel(x.date, true) + '</strong> · ' + esc(x.insider) + '</span>' +
        '<span>' + money(x.value) + (x.price != null ? ' @ ' + (x.approxPrice ? '~' : '') + p2(x.price) : '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('cm-hist').querySelectorAll('.hist__row'), function (b) {
      b.addEventListener('click', function () { cs.id = b.getAttribute('data-id'); drawSheet(); });
    });
  }

  function drawChart(t, s) {
    var n0 = s.d.length, lastD = s.d[n0 - 1];
    var days = RANGES.filter(function (r) { return r[0] === cs.range; })[0][1];
    var i0 = 0; while (i0 < n0 - 2 && s.d[i0] < lastD - days) i0++;
    var D = s.d.slice(i0), C = s.c.slice(i0), n = D.length;
    var buys = TRADES.filter(function (x) { return x.ticker === t.ticker && x.price != null && toEpoch(x.date) >= D[0]; });

    var W = 640, H = 290, L = 8, R = 58, T = 16, B = 26;
    var lo = Math.min.apply(null, C), hi = Math.max.apply(null, C);
    buys.forEach(function (b) { lo = Math.min(lo, b.price); hi = Math.max(hi, b.price); });
    var pad = (hi - lo) * 0.08 || hi * 0.05; lo = Math.max(0, lo - pad); hi += pad;
    function X(i) { return L + (n === 1 ? 0 : i / (n - 1)) * (W - L - R); }
    function Y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
    function idxOn(e) { var k = 0; for (var i = 0; i < n; i++) if (D[i] <= e) k = i; return k; }

    var line = '', i;
    for (i = 0; i < n; i++) line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(C[i]).toFixed(1);
    var area = line + 'L' + X(n - 1).toFixed(1) + ' ' + (H - B) + 'L' + X(0).toFixed(1) + ' ' + (H - B) + 'Z';
    var up = C[n - 1] >= C[0], dir = up ? 'up' : 'down';

    var grid = '';
    for (i = 0; i < 4; i++) {
      var v = lo + (hi - lo) * i / 3, y = Y(v).toFixed(1);
      grid += '<line class="pc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="pc-axis" x="' + (W - R + 6) + '" y="' + (Number(y) + 4) + '">' + p2(v) + '</text>';
    }
    var xt = [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1];
    xt.forEach(function (k, j) {
      grid += '<text class="pc-axis" x="' + X(k).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' +
        (j === 0 ? 'start' : j === 3 ? 'end' : 'middle') + '">' + dayLabel(toDate(D[k])) + '</text>';
    });

    var marks = '', sel = '', selY = null;
    buys.forEach(function (b) {
      var cx = X(idxOn(toEpoch(b.date))), cy = Y(b.price), isSel = b.id === t.id;
      if (!isSel) {
        marks += '<circle class="pc-mk" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5"><title>' +
          esc(b.insider) + ' bought ' + money(b.value) + ' at ' + p2(b.price) + ' on ' + dayLabel(b.date, true) + '</title></circle>';
        return;
      }
      selY = cy;
      var txt = 'Bought ' + money(b.value) + ' @ ' + p2(b.price), w = txt.length * 6.6 + 18, h = 24;
      var tx = Math.max(L, Math.min(W - R - w, cx - w / 2));
      var ty = cy - 40 > T ? cy - 40 : cy + 16;
      sel = '<line class="pc-stem" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) +
        '" y2="' + (ty < cy ? ty + h : ty).toFixed(1) + '"/>' +
        '<rect class="pc-tag" x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="7"/>' +
        '<text class="pc-tagtxt" x="' + (tx + w / 2).toFixed(1) + '" y="' + (ty + 16).toFixed(1) + '" text-anchor="middle">' + esc(txt) + '</text>' +
        '<circle class="pc-mk pc-mk--sel" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="7"/>';
    });
    var paid = '';
    if (selY != null) {
      paid = '<line class="pc-paid" x1="' + L + '" x2="' + (W - R) + '" y1="' + selY.toFixed(1) + '" y2="' + selY.toFixed(1) + '"/>' +
        '<rect class="pc-paidtag" x="' + (W - R + 2) + '" y="' + (selY - 10).toFixed(1) + '" width="54" height="20" rx="5"/>' +
        '<text class="pc-paidtxt" x="' + (W - R + 29) + '" y="' + (selY + 4).toFixed(1) + '" text-anchor="middle">' + p2(t.price) + '</text>';
    }

    $('cm-chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' +
      esc(t.ticker) + ' price over ' + cs.range + ' with CEO buys marked. Use left and right arrows to read prices.">' +
      '<defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pc-s0 ' + dir + '"/><stop offset="1" class="pc-s1 ' + dir + '"/></linearGradient></defs>' +
      grid + '<path class="pc-area" d="' + area + '"/><path class="pc-line ' + dir + '" d="' + line + '"/>' + paid + marks + sel +
      '<line class="pc-cross" id="pc-x" y1="' + T + '" y2="' + (H - B) + '" visibility="hidden"/>' +
      '<circle class="pc-dot" id="pc-d" r="4.5" visibility="hidden"/>' +
      '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" id="pc-ov"/></svg>';

    var svg = $('cm-chart').querySelector('svg'), cross = $('pc-x'), dot = $('pc-d'), cur = n - 1;
    function read(k, live) {
      var vv = C[k], since = t.price ? (vv / t.price - 1) * 100 : null;
      $('cm-readout').innerHTML = '<span class="readout__d">' + dayLabel(toDate(D[k]), true) + '</span>' +
        '<span class="readout__p">' + p2(vv) + '</span>' +
        (since != null ? '<span class="' + (since < 0 ? 'neg' : 'pos') + '">' + pctTxt(since) + ' vs buy price</span>' : '');
      var on = live ? 'visible' : 'hidden';
      cross.setAttribute('visibility', on); dot.setAttribute('visibility', on);
      if (live) {
        cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k));
        dot.setAttribute('cx', X(k)); dot.setAttribute('cy', Y(vv));
      }
    }
    function fromEvent(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      return Math.max(0, Math.min(n - 1, Math.round((x - L) / (W - L - R) * (n - 1))));
    }
    ['pointermove', 'pointerdown'].forEach(function (ev) {
      svg.addEventListener(ev, function (e) { cur = fromEvent(e); read(cur, true); });
    });
    svg.addEventListener('pointerleave', function () { cur = n - 1; read(cur, false); });
    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') cur = Math.max(0, cur - 1);
      else if (e.key === 'ArrowRight') cur = Math.min(n - 1, cur + 1);
      else return;
      e.preventDefault(); read(cur, true);
    });
    read(n - 1, false);

    // 90-day peak before the buy, for the "dip at buy" stat
    var td = toEpoch(t.date), seg = [];
    for (i = 0; i < n0; i++) if (s.d[i] >= td - 90 && s.d[i] <= td) seg.push(s.c[i]);
    var dipPct = t.dip ? t.dip.pct : (seg.length > 19 && t.price ? Math.max(0, Math.round((Math.max.apply(null, seg) - t.price) / Math.max.apply(null, seg) * 100)) : null);
    var since = t.price ? (C[n - 1] / t.price - 1) * 100 : null;
    $('cm-stats').innerHTML = statsHtml([
      ['Price paid', t.price != null ? (t.approxPrice ? '~' : '') + p2(t.price) : '—'],
      ['Latest close', p2(s.c[n0 - 1])],
      ['Since buy', since != null ? pctTxt(since) : '—', since != null ? (since < 0 ? 'neg' : 'pos') : ''],
      ['Dip at buy', dipPct != null ? '−' + dipPct + '%' : '—', dipPct ? 'neg' : '']
    ]);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.card__btn');
    if (b) { openChart(b.getAttribute('data-id')); return; }
    if (e.target.closest && e.target.closest('[data-close]')) closeChart();
  });
  document.addEventListener('keydown', function (e) {
    var m = $('chart-modal');
    if (m.hidden) return;
    if (e.key === 'Escape') { closeChart(); return; }
    if (e.key === 'Tab') { // keep focus inside the sheet
      var f = m.querySelectorAll('button, [tabindex="0"]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function tradeKey(t) { return t.accession || [t.ticker, t.date, t.insider, t.shares || t.value].join('|'); }
  // Add trades found by the live feed and redraw every CEO section.
  function addTrades(list) {
    var have = {}, added = [];
    TRADES.forEach(function (t) { have[tradeKey(t)] = 1; have[[t.ticker, t.date, t.shares].join('|')] = 1; });
    (list || []).forEach(function (t) {
      if (!t || !t.ticker || !t.date) return;
      if (have[tradeKey(t)] || have[[t.ticker, t.date, t.shares].join('|')]) return;
      have[tradeKey(t)] = 1; TRADES.push(t); added.push(t);
    });
    if (added.length) { renderStats(); renderClusters(); renderDips(); renderChart(); renderWhere(); renderFeed(); }
    return added;
  }
  var liveText = '';
  function setStatus(text) { liveText = text; $('updated').innerHTML = text; }

  window.CEOAPP = {
    all: function () { return TRADES; }, addTrades: addTrades, setStatus: setStatus, reasonsHtml: reasonsHtml, srcLink: srcLink,
    money: money, esc: esc, dayLabel: dayLabel, stamp: stamp, badge: badge,
    tile: tile, roleOf: roleOf, seriesFor: seriesFor, openChart: openChart, toEpoch: toEpoch, p2: p2
  };

  renderStats();
  renderClusters();
  renderDips();
  initToggle();
  renderChart();
  renderWhere();
  initFilters();
  renderFeed();
})();
