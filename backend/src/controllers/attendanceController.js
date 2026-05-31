const db = require('../config/db');

const registerAttendance = async (req, res) => {
    const { dni, observaciones, tipo } = req.body;

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

        // 2. Obtener regla de asistencia del trabajador o la predeterminada
        const ruleQuery = `
            SELECT * FROM reglas_asistencia 
            WHERE id = $1 OR es_predeterminado = TRUE 
            ORDER BY (id = $1) DESC LIMIT 1
        `;
        const ruleRes = await db.query(ruleQuery, [worker.regla_id]);
        const rule = ruleRes.rows[0];

        if (!rule) {
             return res.status(500).json({ message: 'No hay regla de asistencia configurada' });
        }

        // Buscar si ya tiene asistencia hoy
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );
        const existing = attendanceRes.rows[0];

        // Determinar qué acción realizar
        const action = tipo || (existing ? (existing.hora_entrada ? 'salida' : 'entrada') : 'entrada');

        let record;
        if (action === 'entrada') {
            if (existing && existing.hora_entrada) {
                return res.status(400).json({ message: 'Ya se registró la entrada de hoy' });
            }

            // Determinar estado (Puntual/Tardanza) basado en la hora actual
            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
            let estado = 'T'; // Por defecto T (Tarde)
            if (currentTime <= rule.hora_ingreso) {
                estado = 'P';
            }

            if (existing) {
                const updateRes = await db.query(
                    `UPDATE asistencias 
                     SET hora_entrada = CURRENT_TIMESTAMP, estado = $1, observaciones = COALESCE(observaciones, $2)
                     WHERE id = $3 RETURNING *`,
                    [estado, observaciones, existing.id]
                );
                record = updateRes.rows[0];
            } else {
                const insertRes = await db.query(
                    `INSERT INTO asistencias (principal_id, estado, hora_entrada, observaciones) 
                     VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING *`,
                    [worker.id, estado, observaciones]
                );
                record = insertRes.rows[0];
            }
        } else if (action === 'salida') {
            if (existing && existing.hora_salida) {
                return res.status(400).json({ message: 'Ya se registró la salida de hoy' });
            }

            if (existing) {
                const updateRes = await db.query(
                    `UPDATE asistencias 
                     SET hora_salida = CURRENT_TIMESTAMP, observaciones = COALESCE(observaciones, $1)
                     WHERE id = $2 RETURNING *`,
                    [observaciones, existing.id]
                );
                record = updateRes.rows[0];
            } else {
                // Registrar salida directa sin entrada registrada previamente
                const insertRes = await db.query(
                    `INSERT INTO asistencias (principal_id, estado, hora_salida, observaciones) 
                     VALUES ($1, 'P', CURRENT_TIMESTAMP, $2) RETURNING *`,
                    [worker.id, observaciones]
                );
                record = insertRes.rows[0];
            }
        } else {
            return res.status(400).json({ message: 'Acción no válida' });
        }

        res.status(201).json({
            message: `Registro de ${action} exitoso`,
            worker: {
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`
            },
            record
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

        // Ver si ya marcó hoy
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );

        const attendance = attendanceRes.rows[0];
        let status = 'none';
        if (attendance) {
            if (attendance.hora_entrada && attendance.hora_salida) {
                status = 'completed';
            } else if (attendance.hora_entrada) {
                status = 'entered';
            } else if (attendance.hora_salida) {
                status = 'only_exit';
            }
        }

        res.json({
            worker: {
                id: worker.id,
                dni: worker.doc_identidad,
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`
            },
            status,
            attendance: attendance || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const registerWorker = async (req, res) => {
    const { dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id } = req.body;

    try {
        const exists = await db.query('SELECT id FROM principal WHERE doc_identidad = $1', [dni]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ message: 'El DNI ya está registrado.' });
        }

        let finalTipoPostulante = parseInt(tipo_postulante_id);
        let mensajeAlerta = null;

        if (finalTipoPostulante === 1) {
            const metaRes = await db.query('SELECT limite_vacantes FROM metas_cargos WHERE cargo_id = $1', [cargo_id]);
            if (metaRes.rows.length > 0) {
                const limite = metaRes.rows[0].limite_vacantes;
                const actualesRes = await db.query(
                    'SELECT COUNT(*) FROM principal WHERE cargo_id = $1 AND tipo_postulante_id = 1',
                    [cargo_id]
                );
                const actuales = parseInt(actualesRes.rows[0].count);

                if (actuales >= limite) {
                    finalTipoPostulante = 2; // Reserva
                    mensajeAlerta = 'Meta Cubierta. Se guardó como Reserva.';
                }
            }
        }

        const insertQuery = `
            INSERT INTO principal 
            (doc_identidad, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `;
        
        const newWorker = await db.query(insertQuery, [
            dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula || 99, cargo_id, finalTipoPostulante
        ]);

        res.status(201).json({
            message: 'Trabajador registrado exitosamente.',
            worker: newWorker.rows[0],
            alert: mensajeAlerta
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar trabajador.' });
    }
};

const getAllWorkers = async (req, res) => {
    const { limit = 10, offset = 0, tipo } = req.query;
    try {
        let query = `
            SELECT p.id, p.doc_identidad as dni, p.ape_pat, p.ape_mat, p.nombres, p.local as area, 
                   p.sede_reg, p.sede_juris, p.aula,
                   c.nombre as cargo, tp.descripcion as tipo_postulante, 
                   COALESCE(r.nombre, (SELECT nombre FROM reglas_asistencia WHERE es_predeterminado = TRUE LIMIT 1)) as regla_nombre, 
                   p.regla_id, p.cargo_id
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            LEFT JOIN reglas_asistencia r ON p.regla_id = r.id
        `;
        let countQuery = 'SELECT COUNT(*) FROM principal p JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id';
        const params = [];
        
        if (tipo) {
            query += ` WHERE tp.descripcion = $1`;
            countQuery += ` WHERE tp.descripcion = $1`;
            params.push(tipo);
        }

        query += ` ORDER BY p.sede_reg, p.sede_juris, p.local, c.nombre, p.ape_pat LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        
        const result = await db.query(query, [...params, limit, offset]);
        const countRes = await db.query(countQuery, params);
        
        res.json({
            data: result.rows,
            total: parseInt(countRes.rows[0].count)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener personal.' });
    }
};

const updateWorker = async (req, res) => {
    const { id } = req.params;
    const { sede_reg, sede_juris, local, aula, cargo_id, regla_id } = req.body;
    try {
        const updateQuery = `
            UPDATE principal 
            SET sede_reg = COALESCE($1, sede_reg), 
                sede_juris = COALESCE($2, sede_juris), 
                local = COALESCE($3, local), 
                aula = COALESCE($4, aula), 
                cargo_id = COALESCE($5, cargo_id), 
                regla_id = $6
            WHERE id = $7 RETURNING *
        `;
        const result = await db.query(updateQuery, [sede_reg, sede_juris, local, aula, cargo_id, regla_id, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar trabajador.' });
    }
};

module.exports = {
    registerAttendance,
    verifyWorker,
    registerWorker,
    getAllWorkers,
    updateWorker
};
