/* enhance.js: smooth Yahoo-style chart, rolling numbers, live stock price next to every ticker,
   and initials avatars for each CEO. Loaded after app.js and extras.js. */
(function () {
  'use strict';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PRICES = window.INSIDER_PRICES || {};

  /* ---------- rolling numbers ($11 -> $12 -> $20 instead of jumping) ---------- */
  function parseNum(text) {
    var m = String(text).match(/^([^\d\-−+]*)([\-−+]?)([\d,]*\.?\d+)(.*)$/);
    if (!m) return null;
    var dec = (m[3].split('.')[1] || '').length;
    var v = parseFloat(m[3].replace(/,/g, '')) * (m[2] === '-' || m[2] === '−' ? -1 : 1);
    return { pre: m[1], sign: m[2] === '+', v: v, dec: dec, suf: m[4], comma: m[3].indexOf(',') >= 0 };
  }
  function fmt(p, v) {
    var neg = v < 0, s = Math.abs(v).toFixed(p.dec);
    if (p.comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.pre + (neg ? '−' : (p.sign ? '+' : '')) + s + p.suf;
  }
  function roll(el, text, ms) {
    if (!el) return;
    var p = parseNum(text);
    if (!p || REDUCED) { el.textContent = text; el.dataset.v = p ? p.v : ''; return; }
    var from = el.dataset.v !== undefined && el.dataset.v !== '' ? parseFloat(el.dataset.v) : 0;
    var to = p.v, start = performance.now(), dur = ms || 650;
    el.dataset.v = to;
    cancelAnimationFrame(el._raf);
    (function step(now) {
      var k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? fmt(p, from + (to - from) * e) : text;
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(start);
  }
  window.rollNumber = roll;

  /* ---------- small helpers ---------- */
  function toDate(e) { return new Date(e * 864e5).toISOString().slice(0, 10); }
  function lastTwo(ticker) {
    var s = PRICES[ticker];
    if (!s || !s.c || s.c.length < 2) return null;
    var a = s.c[s.c.length - 2], b = s.c[s.c.length - 1];
    return { price: b, chg: (b / a - 1) * 100 };
  }
  function money2(v) { return '$' + (v >= 1 ? v.toFixed(2) : v.toFixed(3)); }

  // Smooth curve through the points that never overshoots a real closing price.
  function smoothPath(xs, ys) {
    var n = xs.length;
    if (n < 3) return xs.map(function (x, i) { return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[i].toFixed(1); }).join('');
    var dx = [], m = [], t = [], i;
    for (i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { var k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var d = 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var c = dx[i] / 3;
      d += 'C' + (xs[i] + c).toFixed(1) + ' ' + (ys[i] + c * t[i]).toFixed(1) + ' ' +
        (xs[i + 1] - c).toFixed(1) + ' ' + (ys[i + 1] - c * t[i + 1]).toFixed(1) + ' ' +
        xs[i + 1].toFixed(1) + ' ' + ys[i + 1].toFixed(1);
    }
    return d;
  }
  // Round axis labels ($13, $14, $15) instead of odd numbers like $16.74.
  function niceTicks(lo, hi, count) {
    var span = hi - lo, raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (f) { return f * mag; }).filter(function (s) { return s >= raw; })[0] || 10 * mag;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  /* ---------- the chart ---------- */
  function draw(t, s, X) {
    var n0 = s.d.length, lastD = s.d[n0 - 1];
    var days = X.ranges.filter(function (r) { return r[0] === X.range; })[0][1];
    var i0 = 0; while (i0 < n0 - 2 && s.d[i0] < lastD - days) i0++;
    var D = s.d.slice(i0), C = s.c.slice(i0), n = D.length;
    var buys = X.trades.filter(function (x) { return x.ticker === t.ticker && x.price != null && X.epoch(x.date) >= D[0]; });

    var W = 640, H = 300, L = 8, R = 62, T = 18, B = 28;
    var lo = Math.min.apply(null, C), hi = Math.max.apply(null, C);
    if (t.price && X.epoch(t.date) >= D[0]) { lo = Math.min(lo, t.price); hi = Math.max(hi, t.price); }
    var pad = (hi - lo) * 0.1 || hi * 0.05; lo = Math.max(0, lo - pad); hi += pad;
    function PX(i) { return L + (n === 1 ? 0 : i / (n - 1)) * (W - L - R); }
    function PY(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
    function idxOn(e) { var k = 0; for (var i = 0; i < n; i++) if (D[i] <= e) k = i; return k; }

    var xs = C.map(function (_, i) { return PX(i); }), ys = C.map(PY);
    var line = smoothPath(xs, ys);
    var area = line + 'L' + xs[n - 1].toFixed(1) + ' ' + (H - B) + 'L' + xs[0].toFixed(1) + ' ' + (H - B) + 'Z';
    var dir = C[n - 1] >= C[0] ? 'up' : 'down';

    var paidY = t.price && X.epoch(t.date) >= D[0] ? PY(t.price) : null;
    var grid = '';
    niceTicks(lo, hi, 4).forEach(function (v) {
      var y = PY(v);
      if (y < T - 2 || y > H - B + 2) return;
      grid += '<line class="pc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
      if (paidY == null || Math.abs(y - paidY) > 16) {
        grid += '<text class="pc-axis" x="' + (W - R + 8) + '" y="' + (y + 4).toFixed(1) + '">$' + (v >= 100 ? v.toFixed(0) : v.toFixed(v % 1 ? 2 : 0)) + '</text>';
      }
    });
    [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1].forEach(function (k, j) {
      grid += '<text class="pc-axis" x="' + xs[k].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' +
        (j === 0 ? 'start' : j === 3 ? 'end' : 'middle') + '">' + X.day(toDate(D[k])) + '</text>';
    });

    // Buy markers sit ON the line (that day's close). The dashed line shows the price paid.
    var marks = '', sel = '';
    buys.forEach(function (b) {
      var k = idxOn(X.epoch(b.date)), cx = xs[k], cy = ys[k];
      if (b.id !== t.id) {
        marks += '<g class="pc-in"><circle class="pc-mk" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5"><title>' +
          X.esc(b.insider) + ' bought ' + X.money(b.value) + ' at ' + X.p2(b.price) + ' on ' + X.day(b.date, true) + '</title></circle></g>';
        return;
      }
      var txt = 'Bought ' + X.money(b.value) + ' @ ' + X.p2(b.price), w = txt.length * 6.7 + 20, h = 26;
      var tx = Math.max(L, Math.min(W - R - w - 4, cx - w / 2));
      var above = cy - 46 > T, ty = above ? cy - 46 : cy + 18;
      sel = '<g class="pc-in pc-in--late"><line class="pc-stem" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) +
        '" y2="' + (above ? ty + h : ty).toFixed(1) + '"/>' +
        '<rect class="pc-tag" x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="8"/>' +
        '<text class="pc-tagtxt" x="' + (tx + w / 2).toFixed(1) + '" y="' + (ty + 17).toFixed(1) + '" text-anchor="middle">' + X.esc(txt) + '</text>' +
        '<circle class="pc-halo" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="12"/>' +
        '<circle class="pc-mk pc-mk--sel" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="6.5"/></g>';
    });
    var paid = paidY == null ? '' :
      '<g class="pc-in"><line class="pc-paid" x1="' + L + '" x2="' + (W - R) + '" y1="' + paidY.toFixed(1) + '" y2="' + paidY.toFixed(1) + '"/>' +
      '<rect class="pc-paidtag" x="' + (W - R + 3) + '" y="' + (paidY - 11).toFixed(1) + '" width="' + (R - 4) + '" height="22" rx="6"/>' +
      '<text class="pc-paidtxt" x="' + (W - R + 3 + (R - 4) / 2) + '" y="' + (paidY + 4).toFixed(1) + '" text-anchor="middle">' + X.p2(t.price) + '</text></g>';

    var box = document.getElementById('cm-chart');
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' + X.esc(t.ticker) +
      ' price over ' + X.range + ', with CEO buys marked. Use left and right arrows to read prices.">' +
      '<defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pc-s0 ' + dir + '"/><stop offset="1" class="pc-s1 ' + dir + '"/></linearGradient>' +
      '<clipPath id="pc-clip"><rect id="pc-clip-r" x="0" y="0" width="' + (REDUCED ? W : 0) + '" height="' + H + '"/></clipPath></defs>' +
      grid + '<g clip-path="url(#pc-clip)"><path class="pc-area" d="' + area + '"/><path class="pc-line ' + dir + '" d="' + line + '"/></g>' +
      paid + marks + sel +
      '<g id="pc-cur" class="pc-cur" style="opacity:0"><line class="pc-cross" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '"/>' +
      '<circle class="pc-dot" cx="0" cy="0" r="5"/></g></svg>';

    // Draw-in: the line sweeps left to right, then the markers fade in.
    var svg = box.querySelector('svg'), clip = document.getElementById('pc-clip-r');
    if (!REDUCED) {
      var t0 = performance.now();
      (function grow(now) {
        var k = Math.min(1, (now - t0) / 750), e = 1 - Math.pow(1 - k, 3);
        clip.setAttribute('width', (W * e).toFixed(1));
        if (k < 1) requestAnimationFrame(grow); else svg.classList.add('is-drawn');
      })(t0);
    } else svg.classList.add('is-drawn');

    // Readout with rolling numbers and a gliding crosshair.
    var ro = document.getElementById('cm-readout');
    ro.innerHTML = '<span class="readout__d" id="ro-d"></span><span class="readout__p" id="ro-p"></span>' +
      '<span id="ro-c"></span><span class="readout__hint" id="ro-h">Drag across the chart</span>';
    var cur = n - 1, curG = document.getElementById('pc-cur'), dot = curG.querySelector('.pc-dot');
    function read(k, live) {
      var v = C[k], since = t.price ? (v / t.price - 1) * 100 : null;
      document.getElementById('ro-d').textContent = X.day(toDate(D[k]), true);
      roll(document.getElementById('ro-p'), money2(v), live ? 220 : 650);
      var c = document.getElementById('ro-c');
      if (since != null) {
        c.className = since < 0 ? 'neg' : 'pos';
        roll(c, (since < 0 ? '−' : '+') + Math.abs(since).toFixed(1) + '% vs buy price', live ? 220 : 650);
      }
      document.getElementById('ro-h').style.display = live ? 'none' : '';
      curG.style.opacity = live ? 1 : 0;
      curG.style.transform = 'translateX(' + xs[k].toFixed(1) + 'px)';
      dot.setAttribute('cy', ys[k].toFixed(1));
    }
    function fromEvent(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      return Math.max(0, Math.min(n - 1, Math.round((x - L) / (W - L - R) * (n - 1))));
    }
    ['pointermove', 'pointerdown'].forEach(function (ev) {
      svg.addEventListener(ev, function (e) { var k = fromEvent(e); if (k !== cur || ev === 'pointerdown') { cur = k; read(cur, true); } });
    });
    svg.addEventListener('pointerleave', function () { cur = n - 1; read(cur, false); });
    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') cur = Math.max(0, cur - 1);
      else if (e.key === 'ArrowRight') cur = Math.min(n - 1, cur + 1);
      else return;
      e.preventDefault(); read(cur, true);
    });
    read(n - 1, false);

    // Stats under the chart, rolling into place.
    var td = X.epoch(t.date), seg = [];
    for (var i = 0; i < n0; i++) if (s.d[i] >= td - 90 && s.d[i] <= td) seg.push(s.c[i]);
    var peak = seg.length > 19 ? Math.max.apply(null, seg) : null;
    var dipPct = t.dip ? t.dip.pct : (peak && t.price ? Math.max(0, Math.round((peak - t.price) / peak * 100)) : null);
    var since = t.price ? (s.c[n0 - 1] / t.price - 1) * 100 : null;
    var stats = document.getElementById('cm-stats');
    stats.innerHTML = X.stats([
      ['Price paid', t.price != null ? (t.approxPrice ? '~' : '') + X.p2(t.price) : '—'],
      ['Latest close', X.p2(s.c[n0 - 1])],
      ['Since buy', since != null ? (since < 0 ? '−' : '+') + Math.abs(since).toFixed(1) + '%' : '—', since != null ? (since < 0 ? 'neg' : 'pos') : ''],
      ['Dip at buy', dipPct != null ? '−' + dipPct + '%' : '—', dipPct ? 'neg' : '']
    ]);
    Array.prototype.forEach.call(stats.querySelectorAll('.cm-stat__v'), function (el) {
      var txt = el.textContent; el.textContent = ''; roll(el, txt, 700);
    });
  }
  window.ChartPro = { draw: draw };

  /* ---------- live price next to tickers, initials avatars, rolling stats ---------- */
  var AV_COLORS = ['#3b6fb6', '#2f8f6b', '#9a5bc4', '#b7652c', '#2f8a9a', '#a84a6a', '#6f7d2f', '#5b63c4'];
  function avatarFor(name) {
    var parts = String(name).trim().split(/\s+/), h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var ini = (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    return '<span class="ceo-av" style="--av:' + AV_COLORS[h % AV_COLORS.length] + '" aria-hidden="true">' + ini + '</span>';
  }
  function enhance(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.tk:not([data-q])'), function (el) {
      el.setAttribute('data-q', '1');
      var q = lastTwo(el.textContent.trim());
      if (!q) return;
      var up = q.chg >= 0;
      el.insertAdjacentHTML('afterend', '<span class="quote ' + (up ? 'pos' : 'neg') + '" title="Latest daily close">' +
        money2(q.price) + ' <b>' + (up ? '▲' : '▼') + Math.abs(q.chg).toFixed(1) + '%</b></span>');
    });
    Array.prototype.forEach.call(root.querySelectorAll('.rowc__co:not([data-w])'), function (el) {
      el.setAttribute('data-w', '1');
      var first = el.firstChild;
      if (first && first.nodeType === 3) {
        var span = document.createElement('span'); span.className = 'nm';
        span.textContent = first.textContent.trim(); el.replaceChild(span, first);
      }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.headline:not([data-av])'), function (el) {
      el.setAttribute('data-av', '1');
      var nm = el.querySelector('strong');
      if (nm) el.insertAdjacentHTML('afterbegin', avatarFor(nm.textContent));
    });
  }
  function rollStats() {
    Array.prototype.forEach.call(document.querySelectorAll('.stat__value'), function (el) {
      if (el.dataset.rolled) return;
      var txt = el.textContent; el.dataset.rolled = '1'; roll(el, txt, 900);
    });
  }
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; enhance(document); rollStats(); });
  }).observe(document.body, { childList: true, subtree: true });
  enhance(document); rollStats();
})();
