const CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', NONE: 'NONE' });

/** Pure decision engine. Identity sources are deduplicated by source_id. */
function decide({ pathFullyTraced, endpointFound, pathEndsAtMixer = false, weakPathLink = false, identityEvidence = [] }) {
  const sources = new Set(identityEvidence.map((item) => item.source_id || item.sourceId).filter(Boolean));
  const sourceCount = sources.size;

  if (!endpointFound || pathEndsAtMixer) {
    return { confidence: CONFIDENCE.NONE, label: 'No Reliable VASP Found', reason: pathEndsAtMixer ? 'path_ended_at_mixer' : 'no_endpoint', sourceCount };
  }
  if (pathFullyTraced && sourceCount >= 2 && !weakPathLink) {
    return { confidence: CONFIDENCE.HIGH, label: 'Candidate VASP', reason: 'fully_traced_two_independent_sources', sourceCount };
  }
  if ((pathFullyTraced && sourceCount >= 1) || (sourceCount >= 2 && weakPathLink)) {
    return { confidence: CONFIDENCE.MEDIUM, label: 'Candidate VASP', reason: 'medium_rule', sourceCount };
  }
  return { confidence: CONFIDENCE.LOW, label: 'Candidate VASP', reason: weakPathLink ? 'weak_link_or_single_source' : 'endpoint_without_sources', sourceCount };
}

module.exports = { CONFIDENCE, decide };
