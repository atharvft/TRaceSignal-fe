require('./env');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { enabled: supabaseEnabled } = require('./supabase');
const { cases, traces, requests, audit, validationRuns, createCase, runTrace, getTrace, rerunTrace, reviewCandidate, reportFor, createSahyogRequest, advanceSahyog, runValidation } = require('./store');
const { fixtures } = require('./fixtures/demo');

const port = Number(process.env.PORT || 4000);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
function send(res, status, body) { res.writeHead(status, headers); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve) => { let raw = ''; req.on('data', (chunk) => { raw += chunk; }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } }); }); }

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, demoMode: true, supabase: supabaseEnabled });
    if (req.method === 'GET' && url.pathname === '/api/demo/fixtures') return send(res, 200, Object.values(fixtures));
    if (req.method === 'GET' && url.pathname === '/api/cases') return send(res, 200, [...cases.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    const caseMatch = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (req.method === 'GET' && caseMatch) { const item = cases.get(caseMatch[1]); return item ? send(res, 200, item) : send(res, 404, { error: 'Case not found' }); }
    if (req.method === 'POST' && url.pathname === '/api/cases') return send(res, 201, await createCase(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/sahyog/intake') return send(res, 201, await createCase({ ...await readBody(req), source: 'SAHYOG_MOCK' }));
    const traceMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/trace$/);
    if (req.method === 'POST' && traceMatch) { const body = await readBody(req); return send(res, 202, await runTrace(traceMatch[1], body.fixture || 'high')); }
    const statusMatch = url.pathname.match(/^\/api\/traces\/([^/]+)(?:\/(graph|evidence|candidates))?$/);
    if (req.method === 'GET' && statusMatch) { const trace = traces.get(statusMatch[1]); if (!trace) return send(res, 404, { error: 'Trace not found' }); if (statusMatch[2] === 'graph') return send(res, 200, trace.graph); if (statusMatch[2] === 'evidence') return send(res, 200, trace.evidence); if (statusMatch[2] === 'candidates') return send(res, 200, trace.candidates); return send(res, 200, trace); }
    if (req.method === 'GET' && url.pathname === '/api/audit') return send(res, 200, audit);
    const rerunMatch = url.pathname.match(/^\/api\/traces\/([^/]+)\/rerun$/);
    if (req.method === 'POST' && rerunMatch) return send(res, 202, await rerunTrace(rerunMatch[1], (await readBody(req)).mode || 'snapshot'));
    const reviewMatch = url.pathname.match(/^\/api\/traces\/([^/]+)\/candidates\/([^/]+)\/review$/);
    if (req.method === 'POST' && reviewMatch) { const body = await readBody(req); return send(res, 200, await reviewCandidate(reviewMatch[1], reviewMatch[2], body.decision, body.note)); }
    const reportMatch = url.pathname.match(/^\/api\/traces\/([^/]+)\/report$/);
    if (req.method === 'GET' && reportMatch) { const report = reportFor(reportMatch[1]); if (url.searchParams.get('format') === 'pdf') return send(res, 501, { error: 'PDF export is not available in the dependency-free demo; use JSON export.' }); return send(res, 200, report); }
    const sahyogMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/sahyog-request$/);
    if (req.method === 'POST' && sahyogMatch) { const body = await readBody(req); return send(res, 201, await createSahyogRequest(sahyogMatch[1], body.trace_id, body.candidate_id)); }
    const simulateMatch = url.pathname.match(/^\/api\/sahyog\/requests\/([^/]+)\/simulate$/);
    if (req.method === 'POST' && simulateMatch) return send(res, 200, advanceSahyog(simulateMatch[1]));
    if (req.method === 'GET' && url.pathname === '/api/sahyog/requests') return send(res, 200, [...requests.values()]);
    if (req.method === 'POST' && url.pathname === '/api/admin/validation/run') return send(res, 200, runValidation());
    if (req.method === 'GET' && url.pathname === '/api/admin/validation/runs') return send(res, 200, validationRuns);
    if (req.method === 'GET') {
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.resolve(__dirname, '../../client', `.${requested}`);
      const clientRoot = path.resolve(__dirname, '../../client');
      if (file.startsWith(clientRoot) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
      }
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) { return send(res, 400, { error: error.message }); }
});
server.listen(port, () => console.log(`VASP attribution API listening on http://localhost:${port}`));
