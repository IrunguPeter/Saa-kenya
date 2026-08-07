require('dotenv').config();

const mysql = require('mysql2/promise');

// Accept a mysql:// connection URL (e.g. from Vercel env vars) or individual variables.
const url = process.env.DATABASE_URL || process.env.DB_URL;

function configFromUrl(connectionUrl) {
  const u = new URL(connectionUrl);
  const config = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  if (u.searchParams.get('ssl') === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

const config = url
  ? configFromUrl(url)
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'watch_user',
      password: process.env.DB_PASSWORD || 'watch_pass',
      database: process.env.DB_NAME || 'watch_store',
    };

if (process.env.DB_SSL === 'true' && !config.ssl) {
  config.ssl = { rejectUnauthorized: false };
}

// Serverless-friendly: keep the pool small and shared across warm invocations.
const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 2,
  queueLimit: 0,
  connectTimeout: 10000,
  dateStrings: true,
});

module.exports = pool;
