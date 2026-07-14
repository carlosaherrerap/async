const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rutas
const attendanceRoutes = require('./routes/attendance');
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');

app.use('/api/attendance', attendanceRoutes);
app.use('/api/auth', authRoutes);
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

app.get('/api/init-db-debug', async (req, res) => {
    const db = require('./config/db');
    const bcrypt = require('bcryptjs');
    const logs = [];

    try {
        logs.push('Starting manual DB initialization...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS parametros_asistencia (
                estado CHAR(1) PRIMARY KEY,
                descripcion VARCHAR(20) NOT NULL
            )
        `);
        logs.push('Table parametros_asistencia created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS cargos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE
            )
        `);
        logs.push('Table cargos created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS metas_cargos (
                cargo_id INT PRIMARY KEY REFERENCES cargos(id),
                limite_vacantes INT NOT NULL DEFAULT 0
            )
        `);
        logs.push('Table metas_cargos created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS tipo_postulante (
                id SERIAL PRIMARY KEY,
                descripcion VARCHAR(50) NOT NULL UNIQUE
            )
        `);
        logs.push('Table tipo_postulante created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS principal (
                id SERIAL PRIMARY KEY,
                sede_reg VARCHAR(100) NOT NULL,
                sede_juris VARCHAR(100) NOT NULL,
                doc_identidad VARCHAR(12) NOT NULL UNIQUE,
                ape_pat VARCHAR(35) NOT NULL,
                ape_mat VARCHAR(35) NOT NULL,
                nombres VARCHAR(100) NOT NULL,
                local VARCHAR(150) NOT NULL,
                aula INT NOT NULL,
                tipo_postulante_id INT NOT NULL REFERENCES tipo_postulante(id),
                cargo_id INT NOT NULL REFERENCES cargos(id),
                turno VARCHAR(10) NOT NULL DEFAULT 'DIA',
                hora_ingreso TIME NOT NULL DEFAULT '08:00:00'
            )
        `);
        logs.push('Table principal created or verified.');

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
        logs.push('Table usuarios created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS asistencias (
                id SERIAL PRIMARY KEY,
                principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
                estado CHAR(1) NOT NULL REFERENCES parametros_asistencia(estado),
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                observaciones TEXT
            )
        `);
        logs.push('Table asistencias created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS historial_cambios_sede (
                id SERIAL PRIMARY KEY,
                principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
                sede_origen VARCHAR(100) NOT NULL,
                sede_destino VARCHAR(100) NOT NULL,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_cambio VARCHAR(50) NOT NULL
            )
        `);
        logs.push('Table historial_cambios_sede created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS intentos_login (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                exitoso BOOLEAN NOT NULL
            )
        `);
        logs.push('Table intentos_login created or verified.');

        await db.query(`CREATE INDEX IF NOT EXISTS idx_principal_doc ON principal(doc_identidad)`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date))`);
        logs.push('Indexes created or verified.');

        await db.query(`
            INSERT INTO parametros_asistencia (estado, descripcion) VALUES
            ('P','Puntual'),
            ('T','Tarde')
            ON CONFLICT (estado) DO NOTHING
        `);
        logs.push('Default parameters inserted.');

        await db.query(`
            INSERT INTO tipo_postulante (id, descripcion) VALUES
            (1, 'Titular'),
            (2, 'Reserva')
            ON CONFLICT (id) DO NOTHING
        `);
        logs.push('Default type options inserted.');

        const cargosCheck = await db.query('SELECT COUNT(*) FROM cargos');
        if (parseInt(cargosCheck.rows[0].count) === 0) {
            await db.query(`
                INSERT INTO cargos (id, nombre) VALUES
                (1, 'Monitor Nacional'),
                (2, 'Supervisor Nacional'),
                (3, 'Coordinador Regional'),
                (4, 'Coordinador Administrativo Regional'),
                (5, 'Tecnico Administrativo Provincial')
                ON CONFLICT DO NOTHING
            `);
            await db.query(`SELECT setval('cargos_id_seq', (SELECT MAX(id) FROM cargos))`);

            await db.query(`
                INSERT INTO metas_cargos (cargo_id, limite_vacantes) VALUES
                (1, 10), (2, 5), (3, 2), (4, 2), (5, 15)
                ON CONFLICT DO NOTHING
            `);
            logs.push('Default cargos and metas inserted.');
        }

        const hashedPw = await bcrypt.hash('admin123', 10);
        const resUser = await db.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);
        if (resUser.rows.length === 0) {
            await db.query(
                'INSERT INTO usuarios (username, password, nombre, rol) VALUES ($1, $2, $3, $4)',
                ['admin', hashedPw, 'Administrador', 'admin']
            );
        } else {
            await db.query('UPDATE usuarios SET password = $1 WHERE username = $2', [hashedPw, 'admin']);
        }
        logs.push('Admin user created or verified.');

        const tablesToSync = ['cargos', 'tipo_postulante', 'principal', 'usuarios', 'asistencias', 'historial_cambios_sede', 'intentos_login'];
        for (const table of tablesToSync) {
            await db.query(`
                SELECT setval(
                    COALESCE(pg_get_serial_sequence('${table}', 'id'), '${table}_id_seq'),
                    COALESCE((SELECT MAX(id) FROM ${table}), 1),
                    (SELECT MAX(id) IS NOT NULL FROM ${table})
                )
            `);
        }
        logs.push('Sequences synchronized.');

        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message, stack: error.stack, logs });
    }
});

// Inicialización de la Base de Datos con Reintentos
const initDb = async (retries = 5) => {
    const db = require('./config/db');
    const bcrypt = require('bcryptjs');

    while (retries) {
        try {
            // 1. Tabla de parámetros de asistencia (estados)
            await db.query(`
                CREATE TABLE IF NOT EXISTS parametros_asistencia (
                    estado CHAR(1) PRIMARY KEY,
                    descripcion VARCHAR(20) NOT NULL
                )
            `);

            // 2. Tablas de referencia
            await db.query(`
                CREATE TABLE IF NOT EXISTS cargos (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL UNIQUE
                )
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS metas_cargos (
                    cargo_id INT PRIMARY KEY REFERENCES cargos(id),
                    limite_vacantes INT NOT NULL DEFAULT 0
                )
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS tipo_postulante (
                    id SERIAL PRIMARY KEY,
                    descripcion VARCHAR(50) NOT NULL UNIQUE
                )
            `);

            // 3. Tabla principal
            await db.query(`
                CREATE TABLE IF NOT EXISTS principal (
                    id SERIAL PRIMARY KEY,
                    sede_reg VARCHAR(100) NOT NULL,
                    sede_juris VARCHAR(100) NOT NULL,
                    doc_identidad VARCHAR(12) NOT NULL UNIQUE,
                    ape_pat VARCHAR(35) NOT NULL,
                    ape_mat VARCHAR(35) NOT NULL,
                    nombres VARCHAR(100) NOT NULL,
                    local VARCHAR(150) NOT NULL,
                    aula INT NOT NULL,
                    tipo_postulante_id INT NOT NULL REFERENCES tipo_postulante(id),
                    cargo_id INT NOT NULL REFERENCES cargos(id),
                    turno VARCHAR(10) NOT NULL DEFAULT 'DIA',
                    hora_ingreso TIME NOT NULL DEFAULT '08:00:00'
                )
            `);

            // 4. Tabla de usuarios
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

            // 5. Tabla de asistencias
            await db.query(`
                CREATE TABLE IF NOT EXISTS asistencias (
                    id SERIAL PRIMARY KEY,
                    principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
                    estado CHAR(1) NOT NULL REFERENCES parametros_asistencia(estado),
                    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    observaciones TEXT
                )
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS historial_cambios_sede (
                    id SERIAL PRIMARY KEY,
                    principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
                    sede_origen VARCHAR(100) NOT NULL,
                    sede_destino VARCHAR(100) NOT NULL,
                    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    usuario_cambio VARCHAR(50) NOT NULL
                )
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS intentos_login (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    ip_address VARCHAR(45) NOT NULL,
                    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    exitoso BOOLEAN NOT NULL
                )
            `);

            // Índices
            await db.query(`CREATE INDEX IF NOT EXISTS idx_principal_doc ON principal(doc_identidad)`);
            await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date))`);

            // Datos base requeridos (parámetros y tipos)
            await db.query(`
                INSERT INTO parametros_asistencia (estado, descripcion) VALUES
                ('P','Puntual'),
                ('T','Tarde')
                ON CONFLICT (estado) DO NOTHING
            `);

            await db.query(`
                INSERT INTO tipo_postulante (id, descripcion) VALUES
                (1, 'Titular'),
                (2, 'Reserva')
                ON CONFLICT (id) DO NOTHING
            `);

            // Opcional: Insertar cargos iniciales si la tabla de cargos está vacía
            const cargosCheck = await db.query('SELECT COUNT(*) FROM cargos');
            if (parseInt(cargosCheck.rows[0].count) === 0) {
                await db.query(`
                    INSERT INTO cargos (id, nombre) VALUES
                    (1, 'Monitor Nacional'),
                    (2, 'Supervisor Nacional'),
                    (3, 'Coordinador Regional'),
                    (4, 'Coordinador Administrativo Regional'),
                    (5, 'Tecnico Administrativo Provincial')
                    ON CONFLICT DO NOTHING
                `);
                // Ajustar secuencia de ID de cargos
                await db.query(`SELECT setval('cargos_id_seq', (SELECT MAX(id) FROM cargos))`);

                await db.query(`
                    INSERT INTO metas_cargos (cargo_id, limite_vacantes) VALUES
                    (1, 10), (2, 5), (3, 2), (4, 2), (5, 15)
                    ON CONFLICT DO NOTHING
                `);
            }

            // Administrador base
            const hashedPw = await bcrypt.hash('admin123', 10);
            const res = await db.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);

            if (res.rows.length === 0) {
                await db.query(
                    'INSERT INTO usuarios (username, password, nombre, rol) VALUES ($1, $2, $3, $4)',
                    ['admin', hashedPw, 'Administrador', 'admin']
                );
                console.log('--- Usuario admin creado--> (admin/admin123) ---');
            } else {
                await db.query('UPDATE usuarios SET password = $1 WHERE username = $2', [hashedPw, 'admin']);
                console.log('--- contraseña de admin cambiado a admin123 ---');
            }

            // Sincronizar secuencias para todas las tablas SERIAL para prevenir Unique Key Violations
            const tablesToSync = ['cargos', 'tipo_postulante', 'principal', 'usuarios', 'asistencias', 'historial_cambios_sede', 'intentos_login'];
            for (const table of tablesToSync) {
                try {
                    await db.query(`
                        SELECT setval(
                            COALESCE(pg_get_serial_sequence('${table}', 'id'), '${table}_id_seq'),
                            COALESCE((SELECT MAX(id) FROM ${table}), 1),
                            (SELECT MAX(id) IS NOT NULL FROM ${table})
                        )
                    `);
                } catch (e) {
                    console.log(`No se pudo sincronizar secuencia de ${table}:`, e.message);
                }
            }
            break;
        } catch (err) {
            console.error('Error durante la inicialización de la base de datos:', err);
            console.log(`Esperando a la base de datos... (${retries} reintentos restantes)`);
            retries -= 1;
            if (retries === 0) break;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
};
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
        console.log(`Sistema listo para login`);
    });
}).catch(err => {
    console.error('Error al inciiar:', err);
});
