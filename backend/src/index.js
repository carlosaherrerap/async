const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const attendanceRoutes = require('./routes/attendance');
const authRoutes = require('./routes/auth');
const rulesRoutes = require('./routes/rules');
const configRoutes = require('./routes/config');

app.use('/api/attendance', attendanceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/config', configRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'API de Asistencia activa' });
});

app.get('/health', async (req, res) => {
    const db = require('./config/db');
    try {
        await db.query('SELECT 1');
        res.json({ status: 'OK', database: 'Connected' });
    } catch (err) {
        res.status(500).json({ status: 'Error', database: err.message });
    }
});

// Inicialización de la Base de Datos con Reintentos
const initDb = async (retries = 5) => {
    const db = require('./config/db');
    const bcrypt = require('bcryptjs');

    while (retries) {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS usuarios (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    nombre VARCHAR(100),
                    rol VARCHAR(20) DEFAULT 'operador',
                    activo BOOLEAN DEFAULT TRUE,
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Forzamos la contraseña de admin a 'admin123' para asegurar el acceso
            const hashedPw = await bcrypt.hash('admin123', 10);
            const res = await db.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);

            if (res.rows.length === 0) {
                await db.query(
                    'INSERT INTO usuarios (username, password, nombre, rol) VALUES ($1, $2, $3, $4)',
                    ['admin', hashedPw, 'Administrador', 'admin']
                );
                console.log('--- Usuario admin creado (admin/admin123) ---');
            } else {
                // Actualizamos la contraseña por si acaso era diferente
                await db.query('UPDATE usuarios SET password = $1 WHERE username = $2', [hashedPw, 'admin']);
                console.log('--- Password de admin reseteado a admin123 ---');
            }
            break;
        } catch (err) {
            console.log(`Esperando a la base de datos... (${retries} reintentos restantes)`);
            retries -= 1;
            if (retries === 0) break;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
};
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ Servidor corriendo en puerto ${PORT}`);
        console.log(`🚀 Sistema listo para login`);
    });
}).catch(err => {
    console.error('❌ Error crítico al iniciar:', err);
});
