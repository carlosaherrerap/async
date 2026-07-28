const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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
    // 1. Rename ANCASH-HUARAZ1 -> AHUARAZ1 and ANCASH-HUARAZ2 -> AHUARAZ2
    const renameList = [
      { oldUser: 'ANCASH-HUARAZ1', newUser: 'AHUARAZ1' },
      { oldUser: 'ANCASH-HUARAZ2', newUser: 'AHUARAZ2' }
    ];

    for (const r of renameList) {
      const res = await pool.query(
        'UPDATE usuarios SET username = $1 WHERE username = $2 RETURNING id, username;',
        [r.newUser, r.oldUser]
      );
      if (res.rowCount > 0) {
        console.log(`[RENOMBRADO] ${r.oldUser} -> ${r.newUser}`);
      } else {
        console.log(`[AVISO] No se encontro ${r.oldUser} para renombrar (posiblemente ya fue renombrado).`);
      }
    }

    // 2. Update AMAZONAS2 details (nombre: 'AMAZONAS 2', rol: '01')
    await pool.query(
      "UPDATE usuarios SET nombre = 'AMAZONAS 2', rol = '01' WHERE username = 'AMAZONAS2';"
    );
    console.log("[ACTUALIZADO] AMAZONAS2 -> nombre: 'AMAZONAS 2', rol: '01'");

    // 3. Fetch all users from DB
    const usersRes = await pool.query('SELECT id, username, rol FROM usuarios;');
    const excludedRoles = new Set(['admin', 'ADMIN', 'su', 'SU']);

    const updatedPasswords = [];

    for (const user of usersRes.rows) {
      if (excludedRoles.has(user.rol)) {
        console.log(`[OMITIDO CLAVE] User ID ${user.id} (${user.username}) tiene rol '${user.rol}'`);
        continue;
      }

      // Check if rol is numeric (or numeric string)
      const isNumericRole = /^\d+$/.test(user.rol);
      if (!isNumericRole) {
        console.log(`[OMITIDO CLAVE] User ID ${user.id} (${user.username}) tiene rol no numerico '${user.rol}'`);
        continue;
      }

      // Compute plain password: username without trailing digit 1 or 2, lowercased
      // e.g. AHUARAZ1 -> ahuaraz, LMETRO1 -> lmetro, SMARTINM1 -> smartinm
      const plainPassword = user.username.replace(/[12]$/, '').toLowerCase();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      await pool.query(
        'UPDATE usuarios SET password = $1 WHERE id = $2;',
        [hashedPassword, user.id]
      );

      console.log(`[CLAVE ACTUALIZADA] ID: ${user.id} | Username: ${user.username} | Rol: ${user.rol} | Clave: '${plainPassword}'`);
      updatedPasswords.push({ id: user.id, username: user.username, rol: user.rol, plainPassword });
    }

    console.log(`\nTOTAL DE USUARIOS CON CLAVE ACTUALIZADA: ${updatedPasswords.length}`);

  } catch (err) {
    console.error('Error durante la actualizacion de claves:', err);
  } finally {
    await pool.end();
  }
}

main();
