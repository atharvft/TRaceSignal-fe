require('./env');

const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const enabled = Boolean(baseUrl && secretKey && !baseUrl.includes('your-project'));

async function request(table, options = {}) {
  if (!enabled) return null;
  const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
    ...options,
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function select(table, query = '') { return request(`${table}${query}`); }
async function insert(table, rows) { return request(table, { method: 'POST', body: JSON.stringify(rows) }); }

module.exports = { enabled, select, insert };
