function scoreDepositBehavior(profile = {}) {
  const features = [];
  let score = 0;
  const add = (name, value, weight, explanation) => { score += value * weight; if (value > 0) features.push({ name, contribution: Math.round(value * weight * 100) / 100, explanation }); };
  add('distinct_senders', Math.min((profile.distinctSenders || 0) / 20, 1), 0.25, 'Many unrelated senders are consistent with a deposit address.');
  add('inbound_outbound_ratio', Math.min((profile.inCount || 0) / Math.max(profile.outCount || 1, 1) / 10, 1), 0.2, 'Inbound-heavy activity supports deposit behaviour.');
  add('sweep_behaviour', profile.sweepBehaviour ? 1 : 0, 0.25, 'Funds are forwarded soon after receipt.');
  add('near_zero_balance', profile.nearZeroBalance ? 1 : 0, 0.15, 'Balance repeatedly returns near zero.');
  add('known_hot_wallet_rate', Math.min(profile.forwardToKnownVaspRate || 0, 1), 0.15, 'Funds frequently flow to a known VASP wallet.');
  return { p_deposit: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), features };
}

function riskScore({ mixer = false, bridgeCount = 0, peeling = false, rapidMovement = false, sanctioned = false } = {}) {
  return Math.min(100, (mixer ? 45 : 0) + bridgeCount * 12 + (peeling ? 15 : 0) + (rapidMovement ? 10 : 0) + (sanctioned ? 30 : 0));
}

module.exports = { scoreDepositBehavior, riskScore };
