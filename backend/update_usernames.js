const { Pool } = require('pg');
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

async function main() {
  try {
    // Fetch all users
    const allUsersRes = await pool.query('SELECT id, username, nombre, rol, activo, fecha_creacion FROM usuarios ORDER BY id ASC;');
    const allUsers = allUsersRes.rows;

    // Fetch all sedes
    const allSedesRes = await pool.query('SELECT id, nombre, ubigeo FROM sede_regional ORDER BY id ASC;');
    const allSedes = allSedesRes.rows;

    // Update JSON file
    const jsonPath = path.join(__dirname, 'usuarios_completos.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allUsers, null, 2), 'utf-8');
    console.log(`JSON actualizado en: ${jsonPath}`);

    // Update Excel
    const wb = XLSX.utils.book_new();
    const wsUsers = XLSX.utils.json_to_sheet(allUsers);
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Usuarios');

    const wsSedes = XLSX.utils.json_to_sheet(allSedes);
    XLSX.utils.book_append_sheet(wb, wsSedes, 'Sedes Regionales');

    const excelPath = path.join(__dirname, 'usuarios_completos.xlsx');
    try {
      XLSX.writeFile(wb, excelPath);
      console.log(`Excel actualizado exitosamente en: ${excelPath}`);
    } catch (errExcel) {
      if (errExcel.code === 'EBUSY') {
        console.warn(`ADVERTENCIA: El archivo Excel '${excelPath}' esta abierto en otro programa. Por favor cierralo para actualizarlo.`);
      } else {
        throw errExcel;
      }
    }

  } catch (err) {
    console.error('Error durante la sincronizacion:', err);
  } finally {
    await pool.end();
  }
}

main();
