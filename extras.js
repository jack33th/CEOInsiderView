/* Tabs, politicians panel, alerts panel. Uses helpers exposed by app.js as window.CEOAPP. */
(function () {
  'use strict';
  var A = window.CEOAPP;
  if (!A) return;
  var POL = window.POLITICS_DATA || { trades: [], figures: [], holdingsLinks: [] };
  var PTRADES = (POL.trades || []).filter(function (t) { return t && t.ticker && t.traded; });
  var esc = A.esc, money = A.money, dayLabel = A.dayLabel;
  var STORE_KEY = 'ceobuys_seen_v1';

  function $(id) { return document.getElementById(id); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      localStorage.setItem(STORE_KEY, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- tabs ---------- */
  var TABS = ['ceos', 'politics', 'alerts'];
  function show(tab) {
    if (TABS.indexOf(tab) < 0) tab = 'ceos';
    TABS.forEach(function (t) {
      var on = t === tab;
      $('panel-' + t).hidden = !on;
      var b = $('tab-' + t);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (tab === 'alerts') setTimeout(markAllRead, 2500); // seen once they have had a look
  }
  each(document.querySelectorAll('.tab'), function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
      show(t);
      window.scrollTo(0, 0);
    });
  });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });

  /* ---------- small pieces ---------- */
  function chips(rootId, options, cur, onPick) {
    var root = $(rootId);
    root.innerHTML = options.map(function (o) {
      return '<button type="button" class="chip' + (o[0] === cur ? ' is-on' : '') + '" data-v="' + o[0] +
        '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>';
    }).join('');
    each(root.querySelectorAll('.chip'), function (b) {
      b.addEventListener('click', function () {
        each(root.querySelectorAll('.chip'), function (x) {
          var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on));
        });
        onPick(b.getAttribute('data-v'));
      });
    });
  }
  function avatar(p) {
    var ini = p.name.split(/\s+/).filter(Boolean);
    ini = (ini[0][0] + (ini.length > 1 ? ini[ini.length - 1][0] : '')).toUpperCase();
    var cls = p.party === 'D' ? 'av--d' : p.party === 'R' ? 'av--r' : 'av--i';
    return '<div class="av ' + cls + '" aria-hidden="true">' + esc(ini) + '</div>';
  }
  function who(p) {
    return (p.party ? p.party + '-' : '') + (p.state || '') + (p.state ? ' · ' : '') + p.role;
  }
  function lagInfo(t) {
    if (!t.filed) return null;
    var d = daysBetween(t.traded, t.filed);
    return { days: d, late: !t.filedApprox && d > 45 };
  }
  function filingLink(t) {
    if (t.url) return t.url;
    var hl = POL.holdingsLinks || [];
    return t.role === 'Senate' ? (hl[1] || {}).url : (hl[0] || {}).url;
  }

  // Tiny price image: last ~90 days, with a dot on the trade date.
  function spark(ticker, dateIso, price) {
    var s = A.seriesFor({ ticker: ticker, date: dateIso, price: price, dip: null });
    if (!s || !s.d.length) return A.tile(ticker);
    var end = s.d.length - 1, start = end, td = A.toEpoch(dateIso);
    while (start > 0 && s.d[start - 1] >= s.d[end] - 92) start--;
    var D = s.d.slice(start), C = s.c.slice(start), n = D.length;
    if (n < 3) return A.tile(ticker);
    var lo = Math.min.apply(null, C), hi = Math.max.apply(null, C), W = 96, H = 44;
    if (price) { lo = Math.min(lo, price); hi = Math.max(hi, price); }
    function X(i) { return 2 + i / (n - 1) * (W - 4); }
    function Y(v) { return 3 + (1 - (v - lo) / ((hi - lo) || 1)) * (H - 6); }
    var path = C.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
    var k = 0; D.forEach(function (d, i) { if (d <= td) k = i; });
    var dot = td >= D[0] ? '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(price || C[k]).toFixed(1) + '" r="3.2" class="sp-dot"/>' : '';
    var up = C[n - 1] >= C[0];
    return '<svg class="spark' + (s.demo ? ' spark--demo' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(ticker) + ' price, last 3 months' + (s.demo ? ' (demo prices)' : '') + '"><path d="' + path + '" class="sp-line ' +
      (up ? 'up' : 'down') + '"/>' + dot + '</svg>';
  }

  /* ---------- politicians panel ---------- */
  var pf = { type: 'all', who: 'all' };
  function polStats() {
    var buys = PTRADES.filter(function (t) { return t.type === 'buy'; }).length;
    var people = {}; PTRADES.forEach(function (t) { people[t.name] = 1; });
    $('pol-stats').innerHTML = [
      ['Trades', PTRADES.length], ['Buys / sells', buys + ' / ' + (PTRADES.length - buys)], ['People', Object.keys(people).length]
    ].map(function (x) {
      return '<div class="stat"><div class="stat__label">' + x[0] + '</div><div class="stat__value">' + x[1] + '</div></div>';
    }).join('');
  }
  function polCard(t) {
    var lag = lagInfo(t), buy = t.type === 'buy';
    return '<article class="card">' +
      '<div class="card__head">' + avatar(t) +
      '<div class="card__id"><div class="card__ticker">' + esc(t.name) + ' ' + A.badge(t.source) + '</div>' +
      '<div class="card__co">' + esc(who(t)) + '</div></div>' +
      '<a class="card__link" href="' + esc(filingLink(t)) + '" target="_blank" rel="noopener noreferrer">Filing</a></div>' +
      '<div class="rows">' +
      '<div class="row"><div><div class="row__k">' + esc(t.ticker) + '</div><div class="row__sub">' + esc(t.company || '') + '</div></div>' +
      '<div class="tradetype ' + (buy ? 'tradetype--buy' : 'tradetype--sell') + '">' + (buy ? 'Bought' : 'Sold') + '</div></div>' +
      '<div class="row"><div><div class="row__k">Amount (range)</div><div class="row__sub">' + esc(t.amount) + '</div></div></div>' +
      '<div class="row row--split"><div><div class="row__k">Traded</div><div class="row__sub">' + dayLabel(t.traded, true) + '</div></div>' +
      '<div><div class="row__k">Made public</div><div class="row__sub">' + (t.filed ? (t.filedApprox ? '~' : '') + dayLabel(t.filed, true) : '—') +
      (lag ? '<span class="lagtag' + (lag.late ? ' lagtag--late' : '') + '">' + (t.filedApprox ? '~' : '') + lag.days + ' days later' + (lag.late ? ', late' : '') + '</span>' : '') +
      '</div></div></div></div>' +
      (t.owner ? '<p class="card__note">Owner: ' + esc(t.owner) + '</p>' : '') +
      (t.note ? '<p class="card__note">' + esc(t.note) + '</p>' : '') +
      '<div class="srcs"><span>Source:</span> ' + ((t.sources || []).map(A.srcLink).join('') ||
        (t.url ? A.srcLink({ label: 'Official filing', url: t.url }) : '<em>none</em>')) + '</div></article>';
  }
  function polFeed() {
    var list = PTRADES.filter(function (t) {
      if (pf.type !== 'all' && t.type !== pf.type) return false;
      if (pf.who === 'House' || pf.who === 'Senate') return t.role === pf.who;
      if (pf.who === 'D' || pf.who === 'R') return t.party === pf.who;
      return true;
    }).sort(function (a, b) {
      var ka = a.filed || a.traded, kb = b.filed || b.traded;
      return ka < kb ? 1 : ka > kb ? -1 : (a.traded < b.traded ? 1 : -1);
    });
    $('pol-feed').innerHTML = list.length ? list.map(polCard).join('') : '<div class="empty">No trades match.</div>';
  }
  function polPeople() {
    var g = {};
    PTRADES.forEach(function (t) {
      var p = g[t.name] = g[t.name] || { name: t.name, party: t.party, state: t.state, role: t.role, buys: [], sells: [], last: '' };
      (t.type === 'buy' ? p.buys : p.sells).push(t.ticker);
      var k = t.filed || t.traded; if (k > p.last) p.last = k;
    });
    var people = Object.keys(g).map(function (k) { return g[k]; })
      .sort(function (a, b) { return (b.buys.length + b.sells.length) - (a.buys.length + a.sells.length) || (a.last < b.last ? 1 : -1); });
    function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    $('pol-people').innerHTML = people.map(function (p) {
      return '<article class="card"><div class="card__head">' + avatar(p) + '<div class="card__id"><div class="card__ticker">' + esc(p.name) +
        '</div><div class="card__co">' + esc(who(p)) + '</div></div></div>' +
        '<div class="rows"><div class="row"><div><div class="row__k">Bought</div><div class="row__sub">' + (uniq(p.buys).map(esc).join(', ') || 'None') +
        '</div></div><div class="row__v row__v--sm pos">' + p.buys.length + '</div></div>' +
        '<div class="row"><div><div class="row__k">Sold</div><div class="row__sub">' + (uniq(p.sells).map(esc).join(', ') || 'None') +
        '</div></div><div class="row__v row__v--sm neg">' + p.sells.length + '</div></div></div></article>';
    }).join('');
  }
  function polFigures() {
    $('pol-figures').innerHTML = (POL.figures || []).map(function (f) {
      return '<article class="card card--wide"><div class="card__head">' + avatar(f) + '<div class="card__id"><div class="card__ticker">' +
        esc(f.name) + '</div><div class="card__co">' + esc(f.role) + '</div></div></div>' +
        '<p class="card__note">' + esc(f.summary) + '</p>' +
        '<ul class="facts">' + (f.facts || []).map(function (x) {
          return typeof x === 'string' ? '<li>' + esc(x) + '</li>' : '<li>' + esc(x.text) + ' ' + A.srcLink(x.src) + '</li>';
        }).join('') + '</ul>' +
        (f.holdings ? '<p class="card__filed"><strong>Holdings:</strong> ' + esc(f.holdings) + '</p>' : '') +
        '<div class="links">' + (f.links || []).map(function (l) {
          return '<a class="linkbtn" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>';
        }).join('') + '</div></article>';
    }).join('');
    $('pol-links').innerHTML = (POL.holdingsLinks || []).map(function (l) {
      return '<a class="linkbtn" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>';
    }).join('');
  }

  /* ---------- alerts ---------- */
  function feedItems() {
    var ceo = A.all().map(function (t) {
      return { kind: 'ceo', id: 'c:' + t.id, key: (t.filedAt || t.date + 'T21:00:00Z'), t: t };
    });
    var pol = PTRADES.map(function (t) {
      return { kind: 'pol', id: 'p:' + t.id, key: (t.filed || t.traded) + 'T12:00:00Z', t: t };
    });
    return ceo.concat(pol).sort(function (a, b) { return a.key < b.key ? 1 : a.key > b.key ? -1 : 0; }).slice(0, 60);
  }
  var items = feedItems(), seen = store(true), alf = 'all';
  if (!seen) { // first visit: anything from the last 3 days counts as new
    var cut = new Date(Date.now() - 3 * 864e5).toISOString();
    seen = items.filter(function (i) { return i.key < cut; }).map(function (i) { return i.id; });
    store(false, seen);
  }
  function isNew(i) { return seen.indexOf(i.id) < 0; }
  function badgeCount() {
    var n = items.filter(isNew).length, el = $('unread');
    el.hidden = !n; el.textContent = n > 9 ? '9+' : String(n);
  }
  function markAllRead() {
    seen = items.map(function (i) { return i.id; });
    store(false, seen); badgeCount();
    each(document.querySelectorAll('.alert.is-new'), function (e) { e.classList.remove('is-new'); });
  }
  function ago(iso) {
    var h = Math.round((Date.now() - Date.parse(iso)) / 36e5);
    if (h < 1) return 'just now';
    if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function alertHtml(i) {
    var t = i.t, body;
    if (i.kind === 'ceo') {
      var since = t.sinceBought != null ? '<span class="' + (t.sinceBought < 0 ? 'neg' : 'pos') + '">' +
        (t.sinceBought < 0 ? '−' : '+') + Math.abs(t.sinceBought).toFixed(1) + '% since</span>' : '';
      body = '<div class="alert__title"><strong>' + esc(t.insider) + '</strong> (' + esc(A.roleOf(t)) + ') bought <strong>' +
        money(t.value) + '</strong> of <strong>' + esc(t.ticker) + '</strong></div>' +
        '<div class="alert__meta">' + esc(t.company) + ' · traded ' + dayLabel(t.date) +
        (t.price != null ? ' @ ' + (t.approxPrice ? '~' : '') + A.p2(t.price) : '') + ' ' + since + '</div>' +
        '<div class="why"><div class="why__h">Possible reasons and how we know</div>' + A.reasonsHtml(t) +
        (t.note ? '<p class="why__ctx"><strong>Context:</strong> ' + esc(t.note) + '</p>' : '') + '</div>' +
        '<div class="alert__acts"><button type="button" class="card__btn" data-chart="' + esc(t.id) + '">Chart</button>' + A.badge(t.source) + '</div>';
    } else {
      var lag = lagInfo(t), buy = t.type === 'buy';
      body = '<div class="alert__title"><strong>' + esc(t.name) + '</strong> (' + esc(who(t)) + ') ' +
        '<span class="' + (buy ? 'pos' : 'neg') + '">' + (buy ? 'bought' : 'sold') + '</span> <strong>' + esc(t.ticker) + '</strong></div>' +
        '<div class="alert__meta">' + esc(t.amount) + ' · traded ' + dayLabel(t.traded) +
        (lag ? ' · made public ' + (t.filedApprox ? '~' : '') + lag.days + ' days later' + (lag.late ? ' (late)' : '') : '') + '</div>' +
        '<div class="alert__acts">' + A.badge(t.source) + '</div>';
    }
    var img = spark(i.t.ticker, i.kind === 'ceo' ? t.date : t.traded, i.kind === 'ceo' ? t.price : null);
    return '<article class="alert' + (isNew(i) ? ' is-new' : '') + '"><div class="alert__img">' + img + '</div>' +
      '<div class="alert__body"><div class="alert__top"><span class="kind kind--' + i.kind + '">' + (i.kind === 'ceo' ? 'CEO buy' : 'Politician') +
      '</span><span class="alert__when">' + (isNew(i) ? '<span class="dot" aria-label="new"></span>' : '') + 'Filed ' + ago(i.key) + '</span></div>' +
      body + '</div></article>';
  }
  function renderAlerts() {
    var list = items.filter(function (i) { return alf === 'all' || i.kind === alf; });
    $('alerts').innerHTML = list.length ? list.map(alertHtml).join('') : '<div class="empty">Nothing yet.</div>';
    each($('alerts').querySelectorAll('[data-chart]'), function (b) {
      b.addEventListener('click', function () { A.openChart(b.getAttribute('data-chart')); });
    });
  }
  $('al-read').addEventListener('click', markAllRead);
  var toastReload = false;
  $('toast-btn').addEventListener('click', function () {
    if (toastReload) { location.reload(); return; }
    $('toast').hidden = true; location.hash = 'alerts';
  });
  $('toast-x').addEventListener('click', function () { $('toast').hidden = true; });

  /* browser notifications (only while the page is open) */
  var swReg = null;
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
  }
  function pushState() {
    var btn = $('push-btn'), txt = $('push-text');
    if (!('Notification' in window)) {
      btn.hidden = true;
      txt.textContent = 'This browser cannot show alerts. For phone alerts even when the site is closed, use the free ntfy app (see README).';
    } else if (Notification.permission === 'granted') {
      btn.hidden = true;
      txt.textContent = 'Alerts are on while this page is open. For alerts when it is closed, use the free ntfy app (see README).';
    } else if (Notification.permission === 'denied') {
      btn.hidden = true;
      txt.textContent = 'Alerts are blocked in your browser settings for this site.';
    }
  }
  $('push-btn').addEventListener('click', function () {
    Notification.requestPermission().then(pushState);
  });
  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, { body: body, tag: 'ceobuys' });
      else new Notification(title, { body: body });
    } catch (e) { /* some phones only allow alerts via a service worker */ }
  }

  /* check for new data every 5 minutes (works on a hosted site, not when opened as a file) */
  function readJs(url) {
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (s) { try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch (e) { return null; } });
  }
  function poll() {
    if (location.protocol.indexOf('http') !== 0) return;
    Promise.all([readJs('data.js'), readJs('politics.js')]).then(function (r) {
      var have = {}; items.forEach(function (i) { have[i.id] = 1; });
      var fresh = [];
      ((r[0] && r[0].trades) || []).forEach(function (t) { if (!have['c:' + t.id]) fresh.push(t.insider + ' bought ' + money(t.value) + ' of ' + t.ticker); });
      ((r[1] && r[1].trades) || []).forEach(function (t) { if (!have['p:' + t.id]) fresh.push(t.name + ' ' + (t.type === 'buy' ? 'bought' : 'sold') + ' ' + t.ticker); });
      if (!fresh.length) return;
      toastReload = true;
      $('toast-text').textContent = fresh.length + ' new trade' + (fresh.length > 1 ? 's' : '') + ' found. Reload to see them.';
      $('toast').hidden = false;
      notify(fresh.length > 1 ? fresh.length + ' new insider trades' : 'New insider trade', fresh.slice(0, 3).join('\n'));
    }).catch(function () {});
  }
  setInterval(poll, 5 * 60 * 1000);

  /* ---------- live feed: /api/live reads the SEC's real-time list (only when hosted on Vercel) ---------- */
  var lastCheck = null, liveOn = false, firstLive = true;
  function liveLabel() {
    if (!liveOn || !lastCheck) return;
    var s = Math.max(0, Math.round((Date.now() - lastCheck) / 1000));
    A.setStatus('<span class="live-dot" aria-hidden="true"></span>Live · checked ' + (s < 60 ? s + 's' : Math.round(s / 60) + 'm') + ' ago');
  }
  function live() {
    if (location.protocol.indexOf('http') !== 0) return;
    fetch('api/live', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('no live feed');
      return r.json();
    }).then(function (j) {
      liveOn = true;
      lastCheck = Date.parse(j.checkedAt) || Date.now();
      var added = A.addTrades((j.trades || []).map(function (t) { t.seenAt = j.checkedAt; return t; }));
      if (added.length) {
        items = feedItems(); renderAlerts(); badgeCount();
        if (!firstLive) {
          var lines = added.map(function (t) { return t.insider + ' (CEO) bought ' + money(t.value) + ' of ' + t.ticker; });
          $('toast-text').textContent = lines[0] + (lines.length > 1 ? ' and ' + (lines.length - 1) + ' more' : '');
          $('toast').hidden = false;
          notify(added.length > 1 ? added.length + ' new CEO buys' : 'New CEO buy', lines.slice(0, 3).join('\n'));
        }
      }
      firstLive = false;
      liveLabel();
    }).catch(function () { liveOn = false; });
  }
  live();
  setInterval(live, 60 * 1000);
  setInterval(liveLabel, 15 * 1000);

  /* ---------- go ---------- */
  polStats();
  chips('pol-type', [['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells']], pf.type, function (v) { pf.type = v; polFeed(); });
  chips('pol-who', [['all', 'Everyone'], ['House', 'House'], ['Senate', 'Senate'], ['D', 'Democrats'], ['R', 'Republicans']], pf.who,
    function (v) { pf.who = v; polFeed(); });
  polFeed(); polPeople(); polFigures();
  chips('al-filter', [['all', 'All'], ['ceo', 'CEOs'], ['pol', 'Politicians']], alf, function (v) { alf = v; renderAlerts(); });
  renderAlerts(); badgeCount(); pushState();
  show(location.hash.slice(1));
})();
