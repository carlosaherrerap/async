const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir plataforma web de administración (en raíz /, /index.html, /login.html y /admin)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

app.get(['/', '/index.html', '/login.html', '/admin', '/admin/*'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Rutas
const attendanceRoutes = require('./routes/attendance');
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');

app.use('/api/asistencia', attendanceRoutes);
app.use('/api/autenticacion', authRoutes);
app.use('/api/configuracion', configRoutes);

app.get('/api/estado', (req, res) => {
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
            CREATE TABLE IF NOT EXISTS sede_regional (
                id VARCHAR(10) PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                ubigeo VARCHAR(10)
            )
        `);
        await db.query(`
            ALTER TABLE sede_regional ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10)
        `);
        logs.push('Table sede_regional created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS sede_juris (
                id VARCHAR(20) PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                sede_regional_id VARCHAR(10) REFERENCES sede_regional(id) ON UPDATE CASCADE ON DELETE CASCADE,
                codigo_juris VARCHAR(10) NOT NULL,
                ubigeo VARCHAR(10),
                UNIQUE (sede_regional_id, nombre)
            )
        `);
        await db.query(`
            ALTER TABLE sede_juris ADD COLUMN IF NOT EXISTS sede_regional_id VARCHAR(10) REFERENCES sede_regional(id) ON UPDATE CASCADE ON DELETE CASCADE
        `);
        await db.query(`
            ALTER TABLE sede_juris ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10)
        `);
        logs.push('Table sede_juris created or verified.');

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
                sede_juris_id VARCHAR(20) REFERENCES sede_juris(id),
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

        // ── Migración incondicional: asegurar sede_juris_id y eliminar columnas obsoletas ────
        // Agregar sede_juris_id si no existe
        await db.query(`
            ALTER TABLE principal ADD COLUMN IF NOT EXISTS sede_juris_id VARCHAR(20) REFERENCES sede_juris(id)
        `);
        logs.push('Column sede_juris_id ensured in principal.');

        // Migrar datos viejos de sede_reg/sede_juris a sede_juris_id si las columnas aún existen
        const oldRegCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'principal' AND column_name = 'sede_reg'
        `);
        if (oldRegCheck.rows.length > 0) {
            logs.push('Columnas antiguas sede_reg/sede_juris detectadas. Migrando datos...');
            await db.query(`
                UPDATE principal p
                SET sede_juris_id = sj.id
                FROM sede_juris sj
                JOIN sede_regional sr ON sj.sede_regional_id = sr.id
                WHERE p.sede_juris_id IS NULL
                  AND LOWER(p.sede_reg) = LOWER(sr.nombre)
                  AND LOWER(p.sede_juris) = LOWER(sj.nombre)
            `);
            await db.query(`ALTER TABLE principal DROP CONSTRAINT IF EXISTS fk_principal_sedes`);
            await db.query(`ALTER TABLE principal DROP COLUMN IF EXISTS sede_reg`);
            await db.query(`ALTER TABLE principal DROP COLUMN IF EXISTS sede_juris`);
            logs.push('Columnas sede_reg y sede_juris eliminadas de principal correctamente.');
        } else {
            logs.push('principal ya usa esquema normalizado (sin sede_reg/sede_juris).');
        }

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
                observaciones TEXT,
                usuario_registro_id INT REFERENCES usuarios(id) ON DELETE SET NULL
            )
        `);
        logs.push('Table asistencias created or verified.');

        // Agregar columna usuario_registro_id a asistencias si no existe
        const columnCheck = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'asistencias' AND column_name = 'usuario_registro_id'
        `);
        if (columnCheck.rows.length === 0) {
            try {
                await db.query(`
                    ALTER TABLE asistencias 
                    ADD COLUMN usuario_registro_id INT REFERENCES usuarios(id) ON DELETE SET NULL
                `);
                logs.push('Column usuario_registro_id added to asistencias table.');
            } catch (err) {
                logs.push('Could not add usuario_registro_id column: ' + err.message);
            }
        }

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
        await db.query(`
            CREATE TABLE IF NOT EXISTS turnos (
                id SERIAL PRIMARY KEY,
                principal_id INT NOT NULL UNIQUE REFERENCES principal(id) ON DELETE CASCADE,
                condicion INT NOT NULL DEFAULT 1,
                hora_ingreso_2 VARCHAR(10) DEFAULT '0',
                marcacion_2 VARCHAR(50) DEFAULT '0',
                estado VARCHAR(10) DEFAULT 'NA',
                salida VARCHAR(50)
            )
        `);
        logs.push('Table turnos created or verified.');

        await db.query(`CREATE INDEX IF NOT EXISTS idx_principal_doc ON principal(doc_identidad)`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date))`);
        logs.push('Indexes created or verified.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS control_actualizaciones (
                id SERIAL PRIMARY KEY,
                tabla_afectada VARCHAR(50) NOT NULL,
                accion VARCHAR(20) NOT NULL,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE OR REPLACE FUNCTION registrar_actualizacion()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO control_actualizaciones (tabla_afectada, accion)
                VALUES (TG_TABLE_NAME, TG_OP);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        const triggerTables = ['principal', 'asistencias', 'cargos', 'metas_cargos', 'sede_regional', 'sede_juris', 'turnos'];
        for (const table of triggerTables) {
            await db.query(`DROP TRIGGER IF EXISTS trg_actualizacion_${table} ON ${table}`);
            await db.query(`
                CREATE TRIGGER trg_actualizacion_${table}
                AFTER INSERT OR UPDATE OR DELETE ON ${table}
                FOR EACH ROW EXECUTE FUNCTION registrar_actualizacion()
            `);
        }
        logs.push('Table control_actualizaciones and triggers created or verified.');
        // Sembrar sedes
        const sedesCheck = await db.query('SELECT COUNT(*) FROM sede_regional');
        if (parseInt(sedesCheck.rows[0].count) === 0) {
            const fs = require('fs');
            const path = require('path');
            const sedesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sedes.json'), 'utf8'));

            for (const reg of sedesData.regionals) {
                await db.query(
                    'INSERT INTO sede_regional (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
                    [reg.id, reg.nombre]
                );
            }

            for (const j of sedesData.jurisdictions) {
                await db.query(
                    'INSERT INTO sede_juris (id, nombre, sede_regional_id, codigo_juris, ubigeo) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
                    [j.id, j.nombre, j.sede_regional_id, j.codigo_juris, null]
                );
            }
            logs.push('Sede regional and jurisdiction data seeded.');
        }

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

        // Aplicar anexo.sql si existe
        try {
            const anexoPath = path.join(__dirname, 'anexo.sql');
            if (fs.existsSync(anexoPath)) {
                const anexoSql = fs.readFileSync(anexoPath, 'utf8');
                await db.query(anexoSql);
                logs.push('anexo.sql applied successfully.');
            }
        } catch (anexoErr) {
            logs.push('Error applying anexo.sql: ' + anexoErr.message);
        }

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
                CREATE TABLE IF NOT EXISTS sede_regional (
                    id VARCHAR(10) PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL UNIQUE,
                    ubigeo VARCHAR(10)
                )
            `);
            await db.query(`
                ALTER TABLE sede_regional ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10)
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS sede_juris (
                    id VARCHAR(20) PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    sede_regional_id VARCHAR(10) REFERENCES sede_regional(id) ON UPDATE CASCADE ON DELETE CASCADE,
                    codigo_juris VARCHAR(10) NOT NULL,
                    ubigeo VARCHAR(10),
                    UNIQUE (sede_regional_id, nombre)
                )
            `);
            await db.query(`
                ALTER TABLE sede_juris ADD COLUMN IF NOT EXISTS sede_regional_id VARCHAR(10) REFERENCES sede_regional(id) ON UPDATE CASCADE ON DELETE CASCADE
            `);
            await db.query(`
                ALTER TABLE sede_juris ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10)
            `);

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
                    sede_juris_id VARCHAR(20) REFERENCES sede_juris(id),
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

            // ── Migración incondicional: asegurar sede_juris_id y eliminar columnas obsoletas ────
            // Agregar sede_juris_id si no existe
            await db.query(`
                ALTER TABLE principal ADD COLUMN IF NOT EXISTS sede_juris_id VARCHAR(20) REFERENCES sede_juris(id)
            `);

            // Migrar datos viejos de sede_reg/sede_juris a sede_juris_id si las columnas aún existen
            const oldRegCheck = await db.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'principal' AND column_name = 'sede_reg'
            `);
            if (oldRegCheck.rows.length > 0) {
                console.log('--- Migrando columnas antiguas sede_reg/sede_juris a sede_juris_id ---');
                await db.query(`
                    UPDATE principal p
                    SET sede_juris_id = sj.id
                    FROM sede_juris sj
                    JOIN sede_regional sr ON sj.sede_regional_id = sr.id
                    WHERE p.sede_juris_id IS NULL
                      AND LOWER(p.sede_reg) = LOWER(sr.nombre)
                      AND LOWER(p.sede_juris) = LOWER(sj.nombre)
                `);
                await db.query(`ALTER TABLE principal DROP CONSTRAINT IF EXISTS fk_principal_sedes`);
                await db.query(`ALTER TABLE principal DROP COLUMN IF EXISTS sede_reg`);
                await db.query(`ALTER TABLE principal DROP COLUMN IF EXISTS sede_juris`);
                console.log('--- Columnas sede_reg y sede_juris eliminadas de principal ---');
            }

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
                    observaciones TEXT,
                    usuario_registro_id INT REFERENCES usuarios(id) ON DELETE SET NULL
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

            await db.query(`
                CREATE TABLE IF NOT EXISTS turnos (
                    id SERIAL PRIMARY KEY,
                    principal_id INT NOT NULL UNIQUE REFERENCES principal(id) ON DELETE CASCADE,
                    condicion INT NOT NULL DEFAULT 1,
                    hora_ingreso_2 VARCHAR(10) DEFAULT '0',
                    marcacion_2 VARCHAR(50) DEFAULT '0',
                    estado VARCHAR(10) DEFAULT 'NA',
                    salida VARCHAR(50)
                )
            `);

            // Índices
            await db.query(`CREATE INDEX IF NOT EXISTS idx_principal_doc ON principal(doc_identidad)`);
            await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date))`);

            await db.query(`
                CREATE TABLE IF NOT EXISTS control_actualizaciones (
                    id SERIAL PRIMARY KEY,
                    tabla_afectada VARCHAR(50) NOT NULL,
                    accion VARCHAR(20) NOT NULL,
                    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.query(`
                CREATE OR REPLACE FUNCTION registrar_actualizacion()
                RETURNS TRIGGER AS $$
                BEGIN
                    INSERT INTO control_actualizaciones (tabla_afectada, accion)
                    VALUES (TG_TABLE_NAME, TG_OP);
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            `);
            const triggerTables = ['principal', 'asistencias', 'cargos', 'metas_cargos', 'sede_regional', 'sede_juris', 'turnos'];
            for (const table of triggerTables) {
                await db.query(`DROP TRIGGER IF EXISTS trg_actualizacion_${table} ON ${table}`);
                await db.query(`
                    CREATE TRIGGER trg_actualizacion_${table}
                    AFTER INSERT OR UPDATE OR DELETE ON ${table}
                    FOR EACH ROW EXECUTE FUNCTION registrar_actualizacion()
                `);
            }

            // Agregar columna usuario_registro_id a asistencias si no existe
            const columnCheckDb = await db.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'asistencias' AND column_name = 'usuario_registro_id'
            `);
            if (columnCheckDb.rows.length === 0) {
                try {
                    await db.query(`
                        ALTER TABLE asistencias 
                        ADD COLUMN usuario_registro_id INT REFERENCES usuarios(id) ON DELETE SET NULL
                    `);
                    console.log('--- Columna usuario_registro_id agregada a asistencias ---');
                } catch (err) {
                    console.log('No se pudo agregar columna usuario_registro_id:', err.message);
                }
            }

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

            // Sembrar sedes regional y juris
            const sedesCheck = await db.query('SELECT COUNT(*) FROM sede_regional');
            if (parseInt(sedesCheck.rows[0].count) === 0) {
                const fs = require('fs');
                const path = require('path');
                const sedesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sedes.json'), 'utf8'));

                for (const reg of sedesData.regionals) {
                    await db.query(
                        'INSERT INTO sede_regional (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
                        [reg.id, reg.nombre]
                    );
                }

                for (const j of sedesData.jurisdictions) {
                    await db.query(
                        'INSERT INTO sede_juris (id, nombre, sede_regional_id, codigo_juris, ubigeo) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
                        [j.id, j.nombre, j.sede_regional_id, j.codigo_juris, null]
                    );
                }
                console.log('--- Sedes regional y jurisdiccional sembradas ---');
            }

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

            // Aplicar anexo.sql si existe
            try {
                const fs = require('fs');
                const path = require('path');
                const anexoPath = path.join(__dirname, 'anexo.sql');
                if (fs.existsSync(anexoPath)) {
                    console.log('--- Aplicando anexo.sql ---');
                    const anexoSql = fs.readFileSync(anexoPath, 'utf8');
                    await db.query(anexoSql);
                    console.log('--- anexo.sql aplicado con éxito ---');
                }
            } catch (anexoErr) {
                console.error('Error al aplicar anexo.sql:', anexoErr);
            }
            break;
        } catch (err) {
            console.error('Error durante la inicialización de la base de datos:', err);
            console.log(`Esperando a la base de datos... (${retries} reintentos restantes)`);
            retries -= 1;
            if (retries === 0 || process.env.NODE_ENV === 'test') {
                console.log('Finalizando reintentos de base de datos debido a límite o entorno de test.');
                break;
            }
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
