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

pool.on('connect', () => {
    console.log('Conectado a la base de datos PostgreSQL');
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
