/* Checks every chart on the site: the preview chart of every buy, and the full chart of every buy at
   every range (1M, 3M, 6M, 1Y), on a phone and a laptop width.
   Usage: start tests/devserver.js, then:  node tests/chart_check.js [baseUrl]
   Fails (exit 1) on: broken numbers (NaN/undefined), a chart that neither draws nor says why,
   oval or out-of-bounds dots, colliding axis labels, and a legend that doesn't match what's drawn. */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8770/';

// ---------- preview charts (inside each opened buy) ----------
function checkPreviews() {
  const out = [], R = (e) => e.getBoundingClientRect();
  document.querySelectorAll('#feed .row').forEach((row) => {
    const id = row.getAttribute('data-id'), pv = row.querySelector('.pv');
    const bad = (m) => out.push('preview ' + id + ': ' + m);
    if (!pv) return bad('no preview block');
    const txt = pv.innerText, html = pv.innerHTML;
    if (/NaN|undefined|Infinity/.test(html)) bad('broken number in markup');
    const svg = pv.querySelector('svg');
    if (!svg) { if (!/isn't available|Loading/.test(txt)) bad('no chart and no message'); return; }
    if (/Loading/.test(txt)) bad('still loading');
    const area = R(pv.querySelector('.pv__area'));
    const dots = [...pv.querySelectorAll('.pv__mk')];
    dots.forEach((d) => {
      const b = R(d);
      if (Math.abs(b.width - b.height) > 0.5) bad('oval dot');
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cx < area.left - 1 || cx > area.right + 1 || cy < area.top - 1 || cy > area.bottom + 1) bad('dot outside the chart');
    });
    const ys = [...pv.querySelectorAll('.pv__y')].map(R).sort((a, b) => a.top - b.top);
    for (let i = 1; i < ys.length; i++) if (ys[i].top < ys[i - 1].bottom) bad('price labels overlap');
    ys.forEach((y) => { if (y.top < R(pv.querySelector('.pv__plot')).top - 2 || y.bottom > R(pv.querySelector('.pv__plot')).bottom + 2) bad('price label outside the chart'); });
    const xs = [...pv.querySelectorAll('.pv__x')].map(R);
    for (let i = 1; i < xs.length; i++) if (xs[i].left < xs[i - 1].right) bad('date labels overlap');
    xs.forEach((x) => { if (x.left < R(pv).left - 1 || x.right > R(pv).right + 1) bad('date label outside the chart'); });
    const leg = pv.querySelector('.pv__legend').innerText;
    const thisDot = pv.querySelectorAll('.pv__mk--this').length, other = pv.querySelectorAll('.pv__mk--other').length;
    if ((thisDot > 0) !== /This buy/.test(leg)) bad('legend "This buy" does not match the dot');
    const m = leg.match(/\((\d+)\)/);
    if ((m ? +m[1] : 0) !== other) bad('legend says ' + (m ? m[1] : 0) + ' other buys, chart shows ' + other);
    const paid = !!svg.querySelector('.pv__paid');
    if (paid !== /Price paid/.test(leg)) bad('legend "Price paid" does not match the line');
    const note = !!pv.querySelector('p.fine');
    if (note && (paid || /since buy/.test(pv.querySelector('.pv__head').innerText))) bad('mismatch note shown but price still compared');
  });
  return out;
}

// ---------- full chart (sheet), every buy, every range ----------
async function checkFullCharts(page, label) {
  return page.evaluate(async (label) => {
    const out = [], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trades = window.CIV.trades.slice();
    for (const t of trades) {
      window.CIV.open(t);
      for (const rg of ['1M', '3M', '6M', '1Y']) {
        const btn = document.querySelector('#sh-ranges [data-r="' + rg + '"]');
        if (btn) btn.click();
        let ok = false;
        for (let i = 0; i < 100; i++) { const c = document.getElementById('sh-chart'); if (c.querySelector('svg, .empty')) { ok = true; break; } await sleep(30); }
        const bad = (m) => out.push(label + ' full ' + t.ticker + ' ' + t.date + ' ' + rg + ': ' + m);
        if (!ok) { bad('chart never drew'); continue; }
        const svg = document.querySelector('#sh-chart svg');
        if (!svg) { if (!/isn't available/.test(document.getElementById('sh-chart').innerText)) bad('no chart and no message'); continue; }
        const vb = svg.viewBox.baseVal, html = svg.outerHTML + document.getElementById('sh-readout').innerHTML + document.getElementById('sh-stats').innerHTML + document.getElementById('sh-legend').innerHTML;
        if (/NaN|undefined|Infinity/.test(html)) bad('broken number');
        const ax = [...svg.querySelectorAll('text.pc-axis')].map((e) => e.getBBox());
        ax.forEach((b) => { if (b.x < -1 || b.x + b.width > vb.width + 1 || b.y < -1 || b.y + b.height > vb.height + 1) bad('axis label outside the chart'); });
        for (let i = 0; i < ax.length; i++) for (let j = i + 1; j < ax.length; j++) {
          const a = ax[i], b = ax[j];
          if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) bad('axis labels overlap');
        }
        const tag = svg.querySelector('.pc-tag');
        if (tag) { const b = tag.getBBox(); if (b.x < -1 || b.x + b.width > vb.width + 1 || b.y < -1 || b.y + b.height > vb.height + 1) bad('"This buy" tag outside the chart'); }
        const leg = document.getElementById('sh-legend').innerText;
        const other = svg.querySelectorAll('.pc-mk').length, m = leg.match(/\((\d+)\)/);
        if ((m ? +m[1] : 0) !== other) bad('legend says ' + (m ? m[1] : 0) + ' other buys, chart shows ' + other);
        if (!!svg.querySelector('.pc-sel') !== /This buy/.test(leg)) bad('legend "This buy" does not match the marker');
        if (!!svg.querySelector('.pc-paid') !== /Price paid/.test(leg)) bad('legend "Price paid" does not match the line');
      }
      document.getElementById('sh-close').click();
      await sleep(5);
    }
    return { problems: out, renders: trades.length * 4 };
  }, label);
}

(async () => {
  const browser = await chromium.launch();
  const problems = [], errs = [];
  let previews = 0, renders = 0;
  for (const [label, w, h] of [['phone', 390, 844], ['laptop', 1280, 900]]) {
    // reduced motion: charts draw instantly, so the test doesn't wait on animations
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(label + ': ' + e.message));
    await page.goto(BASE + '#buys', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);                                   // let the live feed add today's buys
    while (await page.isVisible('#more')) { await page.click('#more'); await page.waitForTimeout(100); }
    await page.$$eval('#feed .row__head', (hs) => hs.forEach((b) => b.click()));
    for (let i = 0; i < 60; i++) {                                     // prices fetched on demand may take a moment
      if (!(await page.$$eval('#feed .pv', (ps) => ps.some((p) => /Loading/.test(p.innerText))))) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);
    previews += await page.$$eval('#feed .pv', (ps) => ps.length);
    (await page.evaluate(checkPreviews)).forEach((p) => problems.push(label + ' ' + p));
    const full = await checkFullCharts(page, label);
    renders += full.renders; full.problems.forEach((p) => problems.push(p));
    await ctx.close();
  }
  await browser.close();
  errs.forEach((e) => problems.push('page error ' + e));
  if (problems.length) {
    const uniq = [...new Set(problems)];
    console.log('FAIL: ' + uniq.length + ' problem(s)\n- ' + uniq.slice(0, 80).join('\n- ') + (uniq.length > 80 ? '\n- …' : ''));
    process.exit(1);
  }
  console.log('PASS: ' + previews + ' preview charts and ' + renders + ' full-chart renders (every buy x 4 ranges), phone and laptop');
})();
