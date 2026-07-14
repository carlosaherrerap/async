const db = require('../config/db');
const { hasFace } = require('../utils/faceDetector');
const { decodeBarcodeWithRotations } = require('../utils/barcodeDetector');
const Jimp = require('jimp');

const registerAttendance = async (req, res) => {
    const { dni, observaciones, usuario_registro_id } = req.body;
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

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

        if (!isSU && worker.sede_reg?.toLowerCase() !== userRole?.toLowerCase()) {
            return res.status(403).json({ message: 'Este postulante no pertenece a la sede actual' });
        }

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
        const options = { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false };
        const formatter = new Intl.DateTimeFormat('es-PE', options);
        const [currentHoursStr, currentMinutesStr] = formatter.format(now).split(':');
        const currentHours = parseInt(currentHoursStr, 10);
        const currentMinutes = parseInt(currentMinutesStr, 10);
        const currentTotalMinutes = currentHours * 60 + currentMinutes;

        const [ingH, ingM] = worker.hora_ingreso.split(':').map(Number);
        const ingresoTotalMinutes = ingH * 60 + ingM;

        const estado = currentTotalMinutes <= ingresoTotalMinutes ? 'P' : 'T';
        const operatorId = usuario_registro_id || req.user?.id || null;

        // 4. Registrar ingreso
        const insertRes = await db.query(
            `INSERT INTO asistencias (principal_id, estado, fecha_hora, observaciones, usuario_registro_id) 
             VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4) RETURNING *`,
            [worker.id, estado, observaciones, operatorId]
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
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

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

        if (!isSU && worker.sede_reg?.toLowerCase() !== userRole?.toLowerCase()) {
            return res.status(400).json({ message: 'Este postulante no pertenece a la sede actual' });
        }

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
                sede_reg: worker.sede_reg,
                sede_juris: worker.sede_juris,
                tipo_postulante: worker.tipo_postulante,
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
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

    try {
        if (!isSU && sede_reg?.toLowerCase() !== userRole?.toLowerCase()) {
            return res.status(400).json({ message: 'Solo se permite registrar postulantes para la sede del usuario activo' });
        }
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
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
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

        const conditions = [];
        if (tipo) {
            conditions.push(`tp.descripcion = $${conditions.length + 1}`);
            params.push(tipo);
        }
        if (!isSU) {
            conditions.push(`p.sede_reg = $${conditions.length + 1}`);
            params.push(userRole);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
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
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        if (!isSU) {
            const checkWorker = await db.query('SELECT sede_reg FROM principal WHERE id = $1', [id]);
            if (checkWorker.rows.length === 0) return res.status(404).json({ message: 'Postulante no encontrado' });
            if (checkWorker.rows[0].sede_reg !== userRole) {
                return res.status(403).json({ message: 'No tiene permisos para modificar este postulante' });
            }
            if (sede_reg && sede_reg !== userRole) {
                return res.status(400).json({ message: 'No puede cambiar la sede del postulante a otra diferente de la suya' });
            }
        }
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
};

const getSyncPull = async (req, res) => {
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        const cargosRes = await db.query('SELECT id, nombre FROM cargos ORDER BY id ASC');
        const metasCargosRes = await db.query('SELECT cargo_id, limite_vacantes FROM metas_cargos');
        const tipoPostulanteRes = await db.query('SELECT id, descripcion FROM tipo_postulante');
        const parametrosAsistenciaRes = await db.query('SELECT estado, descripcion FROM parametros_asistencia');
        const regionalRes = await db.query('SELECT id, nombre FROM sede_regional ORDER BY nombre ASC');
        const jurisRes = await db.query('SELECT id, sede_regional_nombre, codigo_juris, nombre FROM sede_juris ORDER BY nombre ASC');

        let queryWorkers = `
            SELECT id, sede_reg, sede_juris, doc_identidad as dni, ape_pat, ape_mat, nombres, local as area, 
                   aula, tipo_postulante_id, cargo_id, turno, hora_ingreso 
            FROM principal
        `;
        let queryAsistencias = `
            SELECT a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones, a.usuario_registro_id 
            FROM asistencias a
            WHERE a.fecha_hora::date = CURRENT_DATE
        `;
        const params = [];
        if (!isSU) {
            queryWorkers += ` WHERE LOWER(sede_reg) = LOWER($1)`;
            queryAsistencias = `
                SELECT a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones, a.usuario_registro_id 
                FROM asistencias a
                JOIN principal p ON a.principal_id = p.id
                WHERE a.fecha_hora::date = CURRENT_DATE AND LOWER(p.sede_reg) = LOWER($1)
            `;
            params.push(userRole);
        }

        const workersRes = await db.query(queryWorkers, params);
        const asistenciasRes = await db.query(queryAsistencias, params);

        res.json({
            cargos: cargosRes.rows,
            metas_cargos: metasCargosRes.rows,
            tipo_postulante: tipoPostulanteRes.rows,
            parametros_asistencia: parametrosAsistenciaRes.rows,
            sede_regional: regionalRes.rows,
            sede_juris: jurisRes.rows,
            workers: workersRes.rows,
            asistencias: asistenciasRes.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener datos de sincronización.' });
    }
};

const getSyncCheck = async (req, res) => {
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        const cargosCount = await db.query('SELECT COUNT(*) FROM cargos');
        const metasCount = await db.query('SELECT COUNT(*) FROM metas_cargos');
        const tipoCount = await db.query('SELECT COUNT(*) FROM tipo_postulante');
        const paramsCount = await db.query('SELECT COUNT(*) FROM parametros_asistencia');
        const regionalCount = await db.query('SELECT COUNT(*) FROM sede_regional');
        const jurisCount = await db.query('SELECT COUNT(*) FROM sede_juris');

        let queryWorkers = 'SELECT COUNT(*) FROM principal';
        let queryAsistencias = 'SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE';
        const params = [];

        if (!isSU) {
            queryWorkers += ' WHERE LOWER(sede_reg) = LOWER($1)';
            queryAsistencias = 'SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id WHERE a.fecha_hora::date = CURRENT_DATE AND LOWER(p.sede_reg) = LOWER($1)';
            params.push(userRole);
        }

        const workersCount = await db.query(queryWorkers, params);
        const asistenciasCount = await db.query(queryAsistencias, params);

        res.json({
            cargos: parseInt(cargosCount.rows[0].count),
            metas_cargos: parseInt(metasCount.rows[0].count),
            tipo_postulante: parseInt(tipoCount.rows[0].count),
            parametros_asistencia: parseInt(paramsCount.rows[0].count),
            sede_regional: parseInt(regionalCount.rows[0].count),
            sede_juris: parseInt(jurisCount.rows[0].count),
            workers: parseInt(workersCount.rows[0].count),
            asistencias: parseInt(asistenciasCount.rows[0].count)
        });
    } catch (error) {
        console.error('Error in getSyncCheck:', error);
        res.status(500).json({ message: 'Error al verificar sincronización.' });
    }
};

const scanDniImage = async (req, res) => {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ message: 'No se recibio ninguna imagen base64' });
    }

    try {
        // Eliminar el encabezado de datos base64 si está presente
        const cleanedBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(cleanedBase64, 'base64');
        console.log(`[SCAN] Image buffer size: ${imageBuffer.length} bytes`);

        // Cargar imagen con Jimp
        const jimpImage = await Jimp.read(imageBuffer);
        console.log(`[SCAN] Image dimensions: ${jimpImage.bitmap.width}x${jimpImage.bitmap.height}`);

        // 1. Verificar si hay rostro (indica el anverso del DNI)
        console.log('[SCAN] Running face detection...');
        const faceDetected = await hasFace(jimpImage);
        console.log(`[SCAN] Face detected: ${faceDetected}`);
        if (faceDetected) {
            return res.json({
                status: 'face_detected',
                message: 'Por favor voltea el DNI'
            });
        }

        // 2. Verificar si hay código de barras (indica el reverso del DNI)
        console.log('[SCAN] Running barcode detection...');
        const barcodeResult = await decodeBarcodeWithRotations(jimpImage);
        console.log(`[SCAN] Barcode result:`, barcodeResult);

        if (barcodeResult && barcodeResult.dni) {
            const dni = barcodeResult.dni;
            console.log(`[SCAN] DNI found: ${dni}`);

            // Buscar postulante en la base de datos
            const workerRes = await db.query(
                `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante 
                 FROM principal p 
                 JOIN cargos c ON p.cargo_id = c.id 
                 JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
                 WHERE p.doc_identidad = $1`,
                [dni]
            );

            if (workerRes.rows.length === 0) {
                return res.json({
                    status: 'not_found',
                    dni,
                    message: `DNI ${dni} decodificado, pero no registrado en el sistema.`
                });
            }

            const worker = workerRes.rows[0];
            const userRole = req.user.rol;
            const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

            if (!isSU && worker.sede_reg?.toLowerCase() !== userRole?.toLowerCase()) {
                return res.json({
                    status: 'not_found',
                    dni,
                    message: `DNI ${dni} decodificado, pero no registrado en su sede regional.`
                });
            }

            // Verificar si ya se registró hoy
            const attendanceRes = await db.query(
                'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
                [worker.id]
            );

            const attendance = attendanceRes.rows[0];
            const status = attendance ? 'entered' : 'none';

            return res.json({
                status: 'success',
                dni,
                message: 'DNI escaneado exitosamente.',
                worker: {
                    id: worker.id,
                    dni: worker.doc_identidad,
                    nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                    puesto: worker.cargo,
                    area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                    sede_reg: worker.sede_reg,
                    sede_juris: worker.sede_juris,
                    tipo_postulante: worker.tipo_postulante,
                    turno: worker.turno,
                    hora_ingreso: worker.hora_ingreso
                },
                attendanceStatus: status,
                attendance: attendance || null
            });
        }

        // Si no se detecta ni rostro ni código de barras
        console.log('[SCAN] No DNI barcode found — returning unrecognized');
        return res.json({
            status: 'unrecognized',
            message: 'No se detecto codigo de barras. Asegurese de enfocar el reverso del DNI.'
        });

    } catch (error) {
        console.error('[SCAN] Error in scanDniImage:', error);
        return res.status(500).json({ message: 'Error al procesar la imagen del DNI.', detail: error.message });
    }
};

const changeSede = async (req, res) => {
    const { workerId, nuevaSede } = req.body;
    const username = req.user.username;

    if (!workerId || !nuevaSede) {
        return res.status(400).json({ message: 'workerId y nuevaSede son requeridos.' });
    }

    try {
        const workerCheck = await db.query('SELECT * FROM principal WHERE id = $1', [workerId]);
        if (workerCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado.' });
        }

        const worker = workerCheck.rows[0];
        const oldSede = worker.sede_reg;

        // Actualizar la sede
        await db.query('UPDATE principal SET sede_reg = $1 WHERE id = $2', [nuevaSede, workerId]);

        // Registrar en historial
        await db.query(
            'INSERT INTO historial_cambios_sede (principal_id, sede_origen, sede_destino, usuario_cambio) VALUES ($1, $2, $3, $4)',
            [workerId, oldSede, nuevaSede, username]
        );

        res.json({
            message: 'Sede cambiada correctamente.',
            worker: {
                id: worker.id,
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                sede_origen: oldSede,
                sede_destino: nuevaSede
            }
        });
    } catch (error) {
        console.error('Error in changeSede:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

const getSedeHistory = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT h.id, h.principal_id, h.sede_origen, h.sede_destino, h.fecha_hora, h.usuario_cambio,
                   p.doc_identidad as dni, (p.ape_pat || ' ' || p.ape_mat || ', ' || p.nombres) as nombre_completo
            FROM historial_cambios_sede h
            JOIN principal p ON h.principal_id = p.id
            ORDER BY h.fecha_hora DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in getSedeHistory:', error);
        res.status(500).json({ message: 'Error al obtener el historial de cambios.' });
    }
};

module.exports = {
    registerAttendance,
    verifyWorker,
    registerWorker,
    getAllWorkers,
    updateWorker,
    getSyncPull,
    getSyncCheck,
    scanDniImage,
    changeSede,
    getSedeHistory
};