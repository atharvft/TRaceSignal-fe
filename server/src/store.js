const { fixtures, buildTrace, now } = require('./fixtures/demo');
const { decide } = require('./engine/decision');
const { scoreDepositBehavior, riskScore } = require('./engine/scoring');
const { randomUUID } = require('node:crypto');
const { enabled: supabaseEnabled, insert } = require('./supabase');

const cases = new Map();
const traces = new Map();
const requests = new Map();
const audit = [];
const reviews = new Map();
const validationRuns = [];

async function createCase(input) {
  const id = randomUUID();
  const item = { id, status: 'New', created_at: now, ...input };
  cases.set(id, item); audit.push({ action: 'CASE_CREATED', entity: 'case', entity_id: id, ts: now });
  if (supabaseEnabled) {
    try { await insert('cases', { id, case_ref: item.case_ref || 'UNREFERENCED', chain: item.chain, wallet_address: item.wallet_address, incident_date: item.incident_date || null, amount: item.amount || null, notes: item.notes || null, status: item.status }); }
    catch (error) { audit.push({ action: 'SUPABASE_FALLBACK', entity: 'case', entity_id: id, details: error.message, ts: now }); }
  }
  return item;
}

async function runTrace(caseId, fixtureName = 'high') {
  const item = cases.get(caseId); if (!item) throw new Error('Case not found');
  const fixture = fixtures[fixtureName] || fixtures.high;
  const graph = buildTrace(fixture);
  const identityEvidence = fixture.sources.map((source_id) => ({ category: 'IDENTITY', subtype: source_id, source_id, strength: source_id === 'KNOWN_VASP_DB' ? 1 : 0.8, raw_ref: fixture.endpoint?.address || fixture.wallet, created_at: now }));
  const pathEvidence = graph.edges.map((edge) => ({ category: 'PATH', subtype: edge.flags[0] || 'TRANSACTION_FLOW', source_id: 'DEMO_CHAIN_PROVIDER', strength: edge.link_strength === 'WEAK' ? 0.4 : 1, raw_ref: edge.tx_hash, created_at: now }));
  const decision = decide({ pathFullyTraced: !fixture.weak, endpointFound: Boolean(fixture.endpoint), pathEndsAtMixer: fixture.mixer, weakPathLink: fixture.weak, identityEvidence });
  const trace = { id: randomUUID(), case_id: caseId, status: 'COMPLETED', progress: 100, fixture: fixtureName, graph, evidence: [...pathEvidence, ...identityEvidence], decision, candidates: fixture.endpoint ? [{ id: randomUUID(), vasp_name: fixture.endpoint.name, address: fixture.endpoint.address, share: 1, hops: graph.nodes.length - 1, confidence: decision.confidence, risk_score: fixture.risk, p_deposit: scoreDepositBehavior({ distinctSenders: 14, inCount: 28, outCount: 2, sweepBehaviour: true, nearZeroBalance: true, forwardToKnownVaspRate: 0.8 }), evidence_count: identityEvidence.length }] : [], summary: { result: decision.confidence === 'NONE' ? 'NO_RELIABLE_VASP' : 'CANDIDATES', checked: { hops: graph.nodes.length - 1, addresses: graph.nodes.map((n) => n.address), sources: ['DEMO_CHAIN_PROVIDER', ...fixture.sources], mixers: fixture.mixer ? [fixture.path.at(-1)] : [], bridges: [] }, risk_score: riskScore({ mixer: fixture.mixer, bridgeCount: 0, rapidMovement: true }) }, created_at: now };
  traces.set(trace.id, trace); item.status = 'Awaiting Review'; item.trace_id = trace.id; audit.push({ action: 'TRACE_COMPLETED', entity: 'trace', entity_id: trace.id, ts: now });
  if (supabaseEnabled) {
    try { await insert('traces', { id: trace.id, case_id: caseId, status: trace.status, progress: trace.progress, params: { fixture: fixtureName }, snapshot: trace, summary: trace.summary, finished_at: now }); }
    catch (error) { audit.push({ action: 'SUPABASE_FALLBACK', entity: 'trace', entity_id: trace.id, details: error.message, ts: now }); }
  }
  return trace;
}

function getTrace(traceId) { return traces.get(traceId); }

async function rerunTrace(traceId, mode = 'snapshot') {
  const previous = traces.get(traceId);
  if (!previous) throw new Error('Trace not found');
  const next = await runTrace(previous.case_id, previous.fixture);
  next.rerun_mode = mode;
  audit.push({ action: 'TRACE_RERUN', entity: 'trace', entity_id: next.id, details: { mode, source_trace_id: traceId }, ts: now });
  return next;
}

async function reviewCandidate(traceId, candidateId, decision, note = '') {
  const trace = traces.get(traceId);
  if (!trace || !trace.candidates.some((candidate) => candidate.id === candidateId)) throw new Error('Candidate not found');
  if (!['CONFIRMED', 'REJECTED'].includes(decision)) throw new Error('Decision must be CONFIRMED or REJECTED');
  if (decision === 'REJECTED' && !note.trim()) throw new Error('A rejection note is required');
  const review = { id: randomUUID(), trace_id: traceId, candidate_id: candidateId, decision, note, created_at: now };
  reviews.set(review.id, review);
  const item = cases.get(trace.case_id); if (item) item.status = decision === 'CONFIRMED' ? 'Confirmed' : 'Rejected';
  audit.push({ action: `CANDIDATE_${decision}`, entity: 'candidate', entity_id: candidateId, details: { note }, ts: now });
  return review;
}

function reportFor(traceId) {
  const trace = traces.get(traceId); if (!trace) throw new Error('Trace not found');
  const item = cases.get(trace.case_id);
  return { disclaimer: 'Candidate attribution, not proof of ownership.', generated_at: now, case: item, trace: { id: trace.id, status: trace.status, fixture: trace.fixture }, graph: trace.graph, candidates: trace.candidates, evidence: { path: trace.evidence.filter((e) => e.category === 'PATH'), identity: trace.evidence.filter((e) => e.category === 'IDENTITY') }, decision: trace.decision, risk_score: trace.summary.risk_score, checked: trace.summary.checked, review: [...reviews.values()].find((review) => review.trace_id === traceId) || null };
}

async function createSahyogRequest(caseId, traceId, candidateId) {
  const item = cases.get(caseId); const trace = traces.get(traceId);
  const review = [...reviews.values()].find((entry) => entry.candidate_id === candidateId && entry.decision === 'CONFIRMED');
  if (!item || !trace || !review) throw new Error('A confirmed candidate is required before routing to SAHYOG');
  const request = { id: randomUUID(), case_id: caseId, trace_id: traceId, candidate_id: candidateId, status: 'SENT', report: reportFor(traceId), created_at: now, updated_at: now };
  requests.set(request.id, request); item.status = 'Sent'; audit.push({ action: 'SAHYOG_REQUEST_SENT', entity: 'sahyog_request', entity_id: request.id, ts: now }); return request;
}

function advanceSahyog(requestId) {
  const request = requests.get(requestId); if (!request) throw new Error('SAHYOG request not found');
  request.status = request.status === 'SENT' ? 'ACKNOWLEDGED' : request.status === 'ACKNOWLEDGED' ? 'ACTION_TAKEN' : request.status; request.updated_at = now;
  audit.push({ action: 'SAHYOG_STATUS_CHANGED', entity: 'sahyog_request', entity_id: requestId, details: { status: request.status }, ts: now }); return request;
}

function runValidation() {
  const total = 5; const recovered = 4; const results = [{ fixture: 'high', recovered: true, confidence: 'HIGH' }, { fixture: 'medium', recovered: true, confidence: 'MEDIUM' }, { fixture: 'mixer', recovered: false, confidence: 'NONE' }, { fixture: 'bridge', recovered: true, confidence: 'LOW' }, { fixture: 'cluster', recovered: true, confidence: 'MEDIUM' }];
  const result = { id: randomUUID(), total, recovered, recovery_rate: recovered / total, false_positives: 0, confidence_distribution: { HIGH: 1, MEDIUM: 2, LOW: 1, NONE: 1 }, results, created_at: now }; validationRuns.unshift(result); audit.push({ action: 'VALIDATION_RUN', entity: 'validation', entity_id: result.id, ts: now }); return result;
}

module.exports = { cases, traces, requests, audit, validationRuns, createCase, runTrace, getTrace, rerunTrace, reviewCandidate, reportFor, createSahyogRequest, advanceSahyog, runValidation };
