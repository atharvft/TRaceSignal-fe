const now = '2026-09-30T10:00:00.000Z';
const addresses = {
  suspect: '0x1111111111111111111111111111111111111111',
  hop1: '0x2222222222222222222222222222222222222222',
  hop2: '0x3333333333333333333333333333333333333333',
  binance: '0x4444444444444444444444444444444444444444',
  mixer: '0x9999999999999999999999999999999999999999'
};

const fixtures = {
  high: { id: 'demo-high', name: 'HIGH · Ethereum to exchange', chain: 'Ethereum', wallet: addresses.suspect, path: [addresses.suspect, addresses.hop1, addresses.hop2, addresses.binance], endpoint: { name: 'Binance', address: addresses.binance }, risk: 18, weak: false, mixer: false, sources: ['KNOWN_VASP_DB', 'COMMERCIAL_LABEL'] },
  medium: { id: 'demo-medium', name: 'MEDIUM · Tron deposit endpoint', chain: 'Tron', wallet: 'TQDemoSuspectAddress', path: ['TQDemoSuspectAddress', 'TQDemoIntermediate', 'TQDemoVasp'], endpoint: { name: 'Demo Custodian', address: 'TQDemoVasp' }, risk: 31, weak: false, mixer: false, sources: ['KNOWN_VASP_DB'] },
  mixer: { id: 'demo-mixer', name: 'NONE · Mixer exposure', chain: 'Ethereum', wallet: addresses.suspect, path: [addresses.suspect, addresses.hop1, addresses.mixer], endpoint: null, risk: 76, weak: true, mixer: true, sources: [] }
};

function buildTrace(fixture) {
  const nodes = fixture.path.map((address, hop) => ({ id: `${fixture.id}-${hop}`, address, chain: fixture.chain, hop, node_type: hop === 0 ? 'SUSPECT' : address === fixture.mixer ? 'MIXER' : address === fixture.endpoint?.address ? 'VASP' : 'INTERMEDIATE' }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id, tx_hash: `${fixture.id}-tx-${i + 1}`, value: 1000 / (i + 1), share: Math.round((1 / (i + 1)) * 100) / 100, link_strength: fixture.weak && i === nodes.length - 2 ? 'WEAK' : 'STRONG', ts: now, flags: node.node_type === 'MIXER' ? ['MIXER'] : [] }));
  return { nodes, edges };
}

module.exports = { fixtures, buildTrace, addresses, now };
