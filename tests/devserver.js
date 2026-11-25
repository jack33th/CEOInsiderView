/* Local stand-in for Vercel: serves the site's files plus the two serverless functions.
   Usage:  SEC_USER_AGENT="Your Name you@example.com" node tests/devserver.js [port]
   Then open http://localhost:8770/ (or your port). /api/live checks the SEC for real,
   /api/prices fetches real daily closes. Node 22+: behind a proxy add NODE_USE_ENV_PROXY=1. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const live = require(path.join(ROOT, 'api/live.js')), prices = require(path.join(ROOT, 'api/prices.js'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const port = +process.argv[2] || 8770;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/live') return live(req, res);
  if (u.pathname === '/api/prices') return prices(req, res);
  const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end('forbidden'); }
  fs.readFile(file, (err, body) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  });
}).listen(port, () => console.log('Site running at http://localhost:' + port + '/'));
