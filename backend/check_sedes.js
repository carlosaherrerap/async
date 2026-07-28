const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const sedesRes = await pool.query('SELECT * FROM sede_regional ORDER BY id ASC;');
    console.log('--- SEDES REGIONALES ---');
    console.table(sedesRes.rows);

    const usersRes = await pool.query('SELECT id, username, nombre, rol FROM usuarios ORDER BY id ASC;');
    console.log('--- USUARIOS ACTUALES ---');
    console.table(usersRes.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
