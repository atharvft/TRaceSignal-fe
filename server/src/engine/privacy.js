const ALLOWED_KEYS = new Set(['address', 'txHash', 'hash', 'chain', 'fromTime', 'toTime', 'limit']);

function sanitize(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (ALLOWED_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')) output[key] = value;
  }
  return output;
}

module.exports = { sanitize };
