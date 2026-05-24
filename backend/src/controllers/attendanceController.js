const db = require('../config/db');

const registerAttendance = async (req, res) => {
    const { dni, observaciones } = req.body;

    try {
        // 1. Buscar al postulante por doc_identidad
        const workerRes = await db.query(
            `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante 
             FROM principal p 
             JOIN cargos c ON p.cargo_id = c.id 
             JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
             WHERE p.doc_identidad = $1`,
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }

        const worker = workerRes.rows[0];

        // 2. Obtener parámetros de horario de asistencia
        const paramsRes = await db.query('SELECT * FROM parametros_asistencia');
        const params = paramsRes.rows;

        // 3. Determinar estado (Puntual/Tardanza) basado en la hora actual
        const now = new Date();
        const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
        
        let estado = 'T'; // Por defecto T (Tarde)
        for (const p of params) {
            if (currentTime >= p.hora_min && currentTime <= p.hora_max) {
                estado = p.estado;
                break;
            }
        }
        // Si la hora es menor que el inicio de puntual, se considera puntual
        const puntualParam = params.find(p => p.estado === 'P');
        if (puntualParam && currentTime < puntualParam.hora_min) {
            estado = 'P';
        }

        // 4. Registrar asistencia
        const attendanceRes = await db.query(
            `INSERT INTO asistencias (principal_id, estado, fecha_hora, observaciones) 
             VALUES ($1, $2, CURRENT_TIMESTAMP, $3) 
             ON CONFLICT (principal_id, (fecha_hora::date)) 
             DO UPDATE SET observaciones = COALESCE(asistencias.observaciones, $3)
             RETURNING *`,
            [worker.id, estado, observaciones]
        );

        res.status(201).json({
            message: 'Asistencia registrada con éxito',
            worker: {
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`
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
            `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante 
             FROM principal p 
             JOIN cargos c ON p.cargo_id = c.id 
             JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
             WHERE p.doc_identidad = $1`,
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }

        const worker = workerRes.rows[0];

        // Ver si ya marcó entrada hoy
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );

        res.json({
            worker: {
                id: worker.id,
                dni: worker.doc_identidad,
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`
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
