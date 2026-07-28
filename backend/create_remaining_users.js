const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const remainingSedes = [
  { id: '15', nombre: 'LAMBAYEQUE' },
  { id: '16', nombre: 'LIMA METROPOLITANA' },
  { id: '17', nombre: 'LIMA PROVINCIAS' },
  { id: '18', nombre: 'LORETO' },
  { id: '19', nombre: 'MADRE DE DIOS' },
  { id: '20', nombre: 'MOQUEGUA' },
  { id: '21', nombre: 'PASCO' },
  { id: '22', nombre: 'PIURA' },
  { id: '23', nombre: 'PUNO' },
  { id: '24', nombre: 'SAN MARTIN-MOYOBAMBA' },
  { id: '25', nombre: 'SAN MARTIN-TARAPOTO' },
  { id: '26', nombre: 'TACNA' },
  { id: '27', nombre: 'TUMBES' },
  { id: '28', nombre: 'UCAYALI' }
];

async function main() {
  try {
    const existingUsersRes = await pool.query('SELECT username FROM usuarios;');
    const existingUsernames = new Set(existingUsersRes.rows.map(u => u.username.toUpperCase()));

    const duplicates = [];
    const inserted = [];

    for (const sede of remainingSedes) {
      const cleanBaseUpper = sede.nombre.replace(/[\s-]/g, '').toUpperCase();
      const cleanBaseLower = sede.nombre.replace(/[\s-]/g, '').toLowerCase();

      for (let num = 1; num <= 2; num++) {
        const username = `${cleanBaseUpper}${num}`;
        const nombre = `${sede.nombre} ${num}`;
        const passwordPlain = cleanBaseLower;
        const rol = sede.id;

        if (existingUsernames.has(username.toUpperCase())) {
          console.warn(`[OMITIDO] El usuario '${username}' ya existe.`);
          duplicates.push(username);
          continue;
        }

        const hashedPassword = await bcrypt.hash(passwordPlain, 10);

        await pool.query(
          `INSERT INTO usuarios (username, password, nombre, rol, activo) VALUES ($1, $2, $3, $4, TRUE)`,
          [username, hashedPassword, nombre, rol]
        );

        console.log(`[CREADO] Username: ${username} | Nombre: ${nombre} | Rol: ${rol}`);
        inserted.push({ username, nombre, rol });
      }
    }

    if (duplicates.length > 0) {
      console.log('--- AVISO DE DUPLICADOS OMITIDOS ---');
      console.log(duplicates);
    }

    const allUsersRes = await pool.query('SELECT id, username, nombre, rol, activo, fecha_creacion FROM usuarios ORDER BY id ASC;');
    const allUsers = allUsersRes.rows;

    const jsonPath = path.join(__dirname, 'usuarios_completos.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allUsers, null, 2), 'utf-8');
    console.log(`JSON guardado en: ${jsonPath}`);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(allUsers);
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    const excelPath = path.join(__dirname, 'usuarios_completos.xlsx');
    XLSX.writeFile(wb, excelPath);
    console.log(`Excel guardado en: ${excelPath}`);

  } catch (err) {
    console.error('Error durante la insercion y exportacion:', err);
  } finally {
    await pool.end();
  }
}

main();
