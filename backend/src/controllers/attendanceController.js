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

        // 2. Verificar si ya marco ingreso hoy (bloquear segundo intento)
        const existingRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );

        if (existingRes.rows.length > 0) {
            return res.status(400).json({ message: 'Ya se registro el ingreso de hoy. No se puede marcar nuevamente.' });
        }

        // 3. Determinar estado (P o T) comparando hora actual con hora_ingreso del postulante
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTotalMinutes = currentHours * 60 + currentMinutes;

        const [ingH, ingM] = worker.hora_ingreso.split(':').map(Number);
        const ingresoTotalMinutes = ingH * 60 + ingM;

        const estado = currentTotalMinutes <= ingresoTotalMinutes ? 'P' : 'T';

        // 4. Registrar ingreso
        const insertRes = await db.query(
            `INSERT INTO asistencias (principal_id, estado, fecha_hora, observaciones) 
             VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING *`,
            [worker.id, estado, observaciones]
        );

        res.status(201).json({
            message: 'Ingreso registrado exitosamente',
            worker: {
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                turno: worker.turno,
                hora_ingreso: worker.hora_ingreso
            },
            record: insertRes.rows[0],
            estado_desc: estado === 'P' ? 'PUNTUAL' : 'TARDE'
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

        // Ver si ya marco ingreso hoy
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );

        const attendance = attendanceRes.rows[0];
        const status = attendance ? 'entered' : 'none';

        res.json({
            worker: {
                id: worker.id,
                dni: worker.doc_identidad,
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                turno: worker.turno,
                hora_ingreso: worker.hora_ingreso
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
    const { dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso } = req.body;

    try {
        const exists = await db.query('SELECT id FROM principal WHERE doc_identidad = $1', [dni]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ message: 'El DNI ya esta registrado.' });
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
                    finalTipoPostulante = 2;
                    mensajeAlerta = 'Meta Cubierta. Se guardo como Reserva.';
                }
            }
        }

        const insertQuery = `
            INSERT INTO principal 
            (doc_identidad, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
        `;

        const newWorker = await db.query(insertQuery, [
            dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula || 99, cargo_id, finalTipoPostulante,
            turno || 'DIA', hora_ingreso || '08:00:00'
        ]);

        res.status(201).json({
            message: 'Postulante registrado exitosamente.',
            worker: newWorker.rows[0],
            alert: mensajeAlerta
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar postulante.' });
    }
};

const getAllWorkers = async (req, res) => {
    const { limit = 10, offset = 0, tipo } = req.query;
    try {
        let query = `
            SELECT p.id, p.doc_identidad as dni, p.ape_pat, p.ape_mat, p.nombres, p.local as area, 
                   p.sede_reg, p.sede_juris, p.aula, p.turno, p.hora_ingreso,
                   c.nombre as cargo, tp.descripcion as tipo_postulante, p.cargo_id
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
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
    const { sede_reg, sede_juris, local, aula, cargo_id, turno, hora_ingreso } = req.body;
    try {
        const updateQuery = `
            UPDATE principal 
            SET sede_reg = COALESCE($1, sede_reg), 
                sede_juris = COALESCE($2, sede_juris), 
                local = COALESCE($3, local), 
                aula = COALESCE($4, aula), 
                cargo_id = COALESCE($5, cargo_id), 
                turno = COALESCE($6, turno),
                hora_ingreso = COALESCE($7, hora_ingreso)
            WHERE id = $8 RETURNING *
        `;
        const result = await db.query(updateQuery, [sede_reg, sede_juris, local, aula, cargo_id, turno, hora_ingreso, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar postulante.' });
    }
    const getSyncPull = async (req, res) => {
        try {
            const cargosRes = await db.query(`
            SELECT c.id, c.nombre, COALESCE(m.limite_vacantes, 0) as meta 
            FROM cargos c 
            LEFT JOIN metas_cargos m ON c.id = m.cargo_id
            ORDER BY c.id ASC
        `);

            const workersRes = await db.query(`
            SELECT id, sede_reg, sede_juris, doc_identidad as dni, ape_pat, ape_mat, nombres, local as area, 
                   aula, tipo_postulante_id, cargo_id, turno, hora_ingreso 
            FROM principal
        `);

            const asistenciasRes = await db.query(`
            SELECT id, principal_id, estado, fecha_hora, observaciones 
            FROM asistencias 
            WHERE fecha_hora::date = CURRENT_DATE
        `);

            res.json({
                cargos: cargosRes.rows,
                workers: workersRes.rows,
                asistencias: asistenciasRes.rows
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al obtener datos de sincronización.' });
        }
    };

    module.exports = {
        registerAttendance,
        verifyWorker,
        registerWorker,
        getAllWorkers,
        updateWorker,
        getSyncPull
    }
}