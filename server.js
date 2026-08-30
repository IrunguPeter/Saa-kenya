require('dotenv').config();

const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL.');
  } catch (err) {
    console.error('\n[ERROR] Could not connect to PostgreSQL:', err.message);
    console.error('Check DATABASE_URL in .env and make sure the database is reachable.\n');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Saa Kenya running at http://localhost:${PORT}`);
    console.log(`Admin portal at http://localhost:${PORT}/admin.html`);
  });
}

start();
