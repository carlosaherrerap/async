const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'asistencia_db',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
      };

const pool = new Pool(poolConfig);

pool.on('connect', (client) => {
    console.log('Conectado a la base de datos PostgreSQL');
    client.query("SET TIME ZONE 'America/Lima'")
        .catch(err => console.error('Error setting timezone on connection:', err));
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
