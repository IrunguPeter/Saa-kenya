require('dotenv').config();

const { Pool, types } = require('pg');

const url = process.env.DATABASE_URL || process.env.DB_URL;

// Postgres type parsers that mirror mysql2's behaviour so the rest of the
// app can keep using familiar values.
// 1700 = NUMERIC / DECIMAL (return numbers, not strings).
types.setTypeParser(1700, (v) => (v == null ? v : parseFloat(v)));
// 20 = BIGINT (COUNT(*) ...).
types.setTypeParser(20, (v) => (v == null ? v : Number(v)));
// 1114 / 1184 = timestamps (format like mysql2's dateStrings).
const fmtTs = (v) => (v ? v.slice(0, 19).replace('T', ' ') : v);
types.setTypeParser(1114, fmtTs);
types.setTypeParser(1184, fmtTs);

// Convert MySQL '?' placeholders to Postgres '$n'. Array values are expanded
// so "IN (?)" with [1,2,3] becomes "IN ($1,$2,$3)".
function convert(sql, params) {
  let i = 0;
  let out = '';
  const values = [];
  for (let c = 0; c < sql.length; c += 1) {
    const ch = sql[c];
    if (ch === '?') {
      const val = params ? params[i] : undefined;
      i += 1;
      if (Array.isArray(val)) {
        out += val.map((_, j) => `$${values.length + j + 1}`).join(', ');
        values.push(...val);
      } else {
        out += `$${values.length + 1}`;
        values.push(val);
      }
    } else {
      out += ch;
    }
  }
  return { sql: out, values };
}

// Supabase requires TLS; allow the connection URL to opt out with ?ssl=false.
function sslFromUrl(u) {
  if (u.searchParams.get('ssl') === 'false') return false;
  return { rejectUnauthorized: false };
}

const config = url
  ? (() => {
      const u = new URL(url);
      return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 5432,
        user: decodeURIComponent(u.username || ''),
        password: decodeURIComponent(u.password || ''),
        database: decodeURIComponent(u.pathname.replace(/^\//, '')),
        ssl: sslFromUrl(u),
      };
    })()
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'watch_user',
      password: process.env.DB_PASSWORD || 'watch_pass',
      database: process.env.DB_NAME || 'watch_store',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

// Serverless-friendly: keep the pool small and shared across warm invocations.
const pool = new Pool({
  ...config,
  max: Number(process.env.DB_POOL_LIMIT) || 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// mysql2-style query(): resolves [rows, meta].
async function query(sql, params) {
  const { sql: s, values } = convert(sql, params);
  const result = await pool.query(s, values);
  return [result.rows, { affectedRows: result.rowCount }];
}

// mysql2-style connection: has query/beginTransaction/commit/rollback/release.
async function getConnection() {
  const client = await pool.connect();
  return {
    query: async (sql, params) => {
      const { sql: s, values } = convert(sql, params);
      const result = await client.query(s, values);
      return [result.rows, { affectedRows: result.rowCount }];
    },
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release(),
  };
}

module.exports = { query, getConnection };