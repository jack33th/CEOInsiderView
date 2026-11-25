/* Checks the site the way a visitor sees it, at six screen widths, on both tabs.
   Usage: start tests/devserver.js, then:  node tests/ui_check.js [baseUrl] [screenshotDir]
   Fails (exit 1) on: placeholder text ("—", "undefined", "NaN", "null", "nightly update", "next update"),
   page errors, rows whose parts overlap or spill out, and sideways scrolling.
   Needs Playwright (npm i playwright); uses Chromium only, so also check real Safari/Firefox by hand. */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8770/';
const OUT = process.argv[3] || '';
const WIDTHS = [[375, 812, true], [390, 844, true], [412, 915, true], [768, 1024, true], [1280, 900, false], [1920, 1080, false]];
const BANNED = [/—/, /\bundefined\b/, /\bNaN\b/, /\bnull\b/, /nightly update/i, /next update/i];

async function rowLayoutProblems(page, feed) {
  return page.evaluate((feed) => [...document.querySelectorAll(feed + ' .row')].slice(0, 40).map((r) => {
    const R = (e) => e && e.getBoundingClientRect(), row = R(r), main = R(r.querySelector('.row__main')), right = R(r.querySelector('.row__right'));
    const lead = R(r.querySelector('.row__head > :first-child:not(.row__main)'));
    const bad = [];
    if (right && main && right.left < main.right - 1) bad.push('right part overlaps the name');
    if (right && right.right > row.right + 1) bad.push('right part spills out');
    if (lead && main && lead.right > main.left + 1) bad.push('leading part overlaps the name');
    return bad.length ? (r.getAttribute('data-id') || r.getAttribute('data-pid')) + ': ' + bad.join(', ') : null;
  }).filter(Boolean), feed);
}

async function bannedText(page) {
  const text = await page.evaluate(() => document.body.innerText);
  return BANNED.filter((re) => re.test(text)).map((re) => {
    const m = text.match(re), i = m.index;
    return re + ' near "' + text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ') + '"';
  });
}

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  for (const [w, h, mobile] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile && w < 768, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    for (const tab of ['buys', 'congress']) {
      const feed = tab === 'buys' ? '#feed' : '#c-feed';
      await page.goto(BASE + '#' + tab, { waitUntil: 'networkidle' });
      await page.waitForSelector(feed + ' .row', { timeout: 30000 });
      await page.waitForTimeout(600);
      // open the first 12 rows, and "Know more" on the first 4 insider rows
      const heads = await page.$$(feed + ' .row__head');
      for (const el of heads.slice(0, 12)) await el.evaluate((b) => b.click());
      if (tab === 'buys') {
        const more = await page.$$(feed + ' .row.is-open details.more-d > summary');
        for (const s of more.slice(0, 4)) await s.evaluate((x) => x.click());
      }
      await page.waitForTimeout(1500);
      const where = w + 'px ' + tab;
      for (const b of await bannedText(page)) problems.push(where + ': placeholder text ' + b);
      for (const r of await rowLayoutProblems(page, feed)) problems.push(where + ': ' + r);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(where + ': page scrolls sideways');
      if (OUT) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${tab}-${w}.png` });
      }
    }
    errs.forEach((e) => problems.push(w + 'px: page error ' + e));
    await ctx.close();
  }
  await browser.close();
  if (problems.length) {
    console.log('FAIL: ' + problems.length + ' problem(s)\n- ' + [...new Set(problems)].join('\n- '));
    process.exit(1);
  }
  console.log('PASS: 6 widths x 2 tabs, no placeholders, no overlaps, no sideways scroll, no page errors');
})();
