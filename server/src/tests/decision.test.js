const test = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('../engine/decision');
const { sanitize } = require('../engine/privacy');

const ev = (...ids) => ids.map((source_id) => ({ source_id }));
test('decision engine covers the core confidence rules', () => {
  assert.equal(decide({ pathFullyTraced: true, endpointFound: true, identityEvidence: ev('a', 'b') }).confidence, 'HIGH');
  assert.equal(decide({ pathFullyTraced: true, endpointFound: true, identityEvidence: ev('a') }).confidence, 'MEDIUM');
  assert.equal(decide({ pathFullyTraced: false, endpointFound: true, weakPathLink: true, identityEvidence: ev('a') }).confidence, 'LOW');
  assert.equal(decide({ pathFullyTraced: true, endpointFound: true, weakPathLink: true, identityEvidence: ev('a', 'b') }).confidence, 'MEDIUM');
  assert.equal(decide({ pathFullyTraced: true, endpointFound: false, identityEvidence: ev('a', 'b') }).confidence, 'NONE');
  assert.equal(decide({ pathFullyTraced: true, endpointFound: true, pathEndsAtMixer: true, identityEvidence: ev('a', 'b') }).label, 'No Reliable VASP Found');
});
test('identity sources are independent by source_id', () => {
  assert.equal(decide({ pathFullyTraced: true, endpointFound: true, identityEvidence: ev('same', 'same') }).confidence, 'MEDIUM');
});
test('privacy sanitizer excludes case data', () => {
  assert.deepEqual(sanitize({ address: '0xabc', chain: 'Ethereum', notes: 'secret', caseRef: 'SAHYOG-1', txHash: '0x123' }), { address: '0xabc', chain: 'Ethereum', txHash: '0x123' });
});
