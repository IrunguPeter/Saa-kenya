require('dotenv').config();

const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    console.log('Connected to MariaDB.');
  } catch (err) {
    console.error('\n[ERROR] Could not connect to MariaDB:', err.message);
    console.error('Check DB settings in .env and make sure MariaDB is running.\n');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Saa Kenya running at http://localhost:${PORT}`);
    console.log(`Admin portal at http://localhost:${PORT}/admin.html`);
  });
}

start();
