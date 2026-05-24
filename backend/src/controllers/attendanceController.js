const db = require('../config/db');

const registerAttendance = async (req, res) => {
    const { dni, observaciones } = req.body;

    try {
        // 1. Buscar al trabajador por DNI
        const workerRes = await db.query(
            'SELECT t.*, p.nombre as puesto, a.nombre as area FROM trabajadores t JOIN puestos p ON t.puesto_id = p.id JOIN areas a ON p.area_id = a.id WHERE t.dni = $1 AND t.activo = TRUE',
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado o inactivo' });
        }

        const worker = workerRes.rows[0];

        // 2. Obtener configuración de horario
        const configRes = await db.query('SELECT * FROM configuracion LIMIT 1');
        const config = configRes.rows[0];

        // 3. Determinar estado (Puntual/Tardanza)
        const now = new Date();
        const currentTime = now.toTimeString().split(' ')[0];
        
        let estado = 'puntual';
        if (config) {
            const [hEntrada, mEntrada] = config.hora_entrada.split(':');
            const entradaLimit = new Date();
            entradaLimit.setHours(hEntrada, parseInt(mEntrada) + config.tolerancia_minutos, 0);

            if (now > entradaLimit) {
                estado = 'tardanza';
            }
        }

        // 4. Registrar asistencia
        const attendanceRes = await db.query(
            `INSERT INTO asistencias (trabajador_id, fecha, hora_entrada, estado, observaciones) 
             VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, $3) 
             ON CONFLICT (trabajador_id, fecha) 
             DO UPDATE SET hora_salida = CURRENT_TIME, observaciones = COALESCE(asistencias.observaciones, $3)
             RETURNING *`,
            [worker.id, estado, observaciones]
        );

        res.status(201).json({
            message: 'Asistencia registrada con éxito',
            worker: {
                nombre: `${worker.nombres} ${worker.apellidos}`,
                puesto: worker.puesto,
                area: worker.area
            },
            record: attendanceRes.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const verifyWorker = async (req, res) => {
    const { dni } = req.query;

    try {
        const workerRes = await db.query(
            'SELECT t.*, p.nombre as puesto, a.nombre as area FROM trabajadores t JOIN puestos p ON t.puesto_id = p.id JOIN areas a ON p.area_id = a.id WHERE t.dni = $1 AND t.activo = TRUE',
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado o inactivo' });
        }

        const worker = workerRes.rows[0];

        // Ver si ya marcó entrada hoy
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE trabajador_id = $1 AND fecha = CURRENT_DATE',
            [worker.id]
        );

        res.json({
            worker: {
                id: worker.id,
                dni: worker.dni,
                nombre: `${worker.nombres} ${worker.apellidos}`,
                puesto: worker.puesto,
                area: worker.area
            },
            status: attendanceRes.rows.length > 0 ? 'entered' : 'none',
            attendance: attendanceRes.rows[0] || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = {
    registerAttendance,
    verifyWorker
};
