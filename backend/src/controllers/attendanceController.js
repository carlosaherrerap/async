const db = require('../config/db');
const { hasFace } = require('../utils/faceDetector');
const { decodeBarcodeWithRotations } = require('../utils/barcodeDetector');
const Jimp = require('jimp');

// Helper: Devuelve la hora actual en minutos (zona Lima)
const getNowMinutesLima = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
    const [h, m] = formatter.format(now).split(':').map(Number);
    return h * 60 + m;
};

// Helper: Convierte "HH:MM" a minutos
const toMinutes = (timeStr) => {
    if (!timeStr || timeStr === '0') return 0;
    const parts = timeStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
};

// Helper: Genera timestamp en formato string para Lima
const getLimaTimestamp = () => {
    const now = new Date();
    const opts = { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const p = new Intl.DateTimeFormat('es-PE', opts).formatToParts(now);
    const get = (t) => p.find(x => x.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}.000000`;
};

// Helper: isUserAdmin
const isUserAdminOrSU = (rol) => {
    if (!rol) return false;
    const r = String(rol).trim().toLowerCase();
    return r === 'admin' || r === 'administrador' || r === 'su' || r === 'super' || r === 'superusuario';
};

const getOrResetTurno = async (principalId) => {
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
    
    let turnoRes = await db.query('SELECT * FROM turnos WHERE principal_id = $1', [principalId]);
    let turno;
    
    if (turnoRes.rows.length === 0) {
        const insertTurno = await db.query(
            `INSERT INTO turnos (principal_id, condicion, hora_ingreso_2, marcacion_2, estado, salida)
             VALUES ($1, 1, '0', '0', 'NA', NULL) RETURNING *`,
            [principalId]
        );
        turno = insertTurno.rows[0];
    } else {
        turno = turnoRes.rows[0];
        // Verificar si la marcacion_2 guardada pertenece al día de hoy
        const marcacionEsDeHoy = turno.marcacion_2 &&
            turno.marcacion_2 !== '0' &&
            turno.marcacion_2.substring(0, 10) === todayStr;

        // Si marcacion_2 es de un día anterior (o no es de hoy), resetear los campos del día manteniendo intacta la condicion
        if (!marcacionEsDeHoy && (turno.marcacion_2 !== '0' || turno.estado !== 'NA' || turno.salida !== null)) {
            const updateTurno = await db.query(
                `UPDATE turnos 
                 SET marcacion_2 = '0', estado = 'NA', salida = NULL 
                 WHERE principal_id = $1 RETURNING *`,
                [principalId]
            );
            turno = updateTurno.rows[0];
        }
    }
    return turno;
};

const registerAttendance = async (req, res) => {
    const { dni, observaciones, usuario_registro_id } = req.body;
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

    try {
        // 1. Buscar al postulante por doc_identidad
        const workerRes = await db.query(
            `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante,
                    sj.nombre as sede_juris, sr.nombre as sede_reg, sj.sede_regional_id
             FROM principal p 
             JOIN cargos c ON p.cargo_id = c.id 
             JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
             JOIN sede_juris sj ON p.sede_juris_id = sj.id
             JOIN sede_regional sr ON sj.sede_regional_id = sr.id
             WHERE p.doc_identidad = $1`,
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }

        const worker = workerRes.rows[0];

        const isJurisRole = userRole && String(userRole).includes('-');
        if (!isSU) {
            if (isJurisRole && worker.sede_juris_id !== userRole) {
                return res.status(403).json({ message: 'Este postulante no pertenece a su sede jurisdiccional' });
            } else if (!isJurisRole && worker.sede_regional_id !== userRole) {
                return res.status(403).json({ message: 'Este postulante no pertenece a la sede actual' });
            }
        }

        // Asegurar/Resetear turno antes de registrar ingreso
        const turno = await getOrResetTurno(worker.id);

        // 1.1 Si el postulante tiene 2 turnos (condicion = 2) y su primer turno es de mañana (05:00 - 10:00),
        // sólo puede registrar su 1er ingreso hasta las 11:00 AM.
        if (turno.condicion === 2) {
            const currentTotalMinutes = getNowMinutesLima();
            const ingreso1Min = toMinutes(worker.hora_ingreso);
            const esManana = ingreso1Min >= toMinutes('05:00') && ingreso1Min <= toMinutes('10:00');
            if (esManana && currentTotalMinutes > toMinutes('11:00')) {
                return res.status(400).json({ message: 'INGRESO 1 BLOQUEADO: El plazo para la primera marcación de la mañana finalizó a las 11:00 AM.' });
            }
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
            `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante,
                    sj.nombre as sede_juris, sr.nombre as sede_reg, sj.sede_regional_id
             FROM principal p 
             JOIN cargos c ON p.cargo_id = c.id 
             JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
             JOIN sede_juris sj ON p.sede_juris_id = sj.id
             JOIN sede_regional sr ON sj.sede_regional_id = sr.id
             WHERE p.doc_identidad = $1`,
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }

        const worker = workerRes.rows[0];

        const isJurisRole = userRole && String(userRole).includes('-');
        if (!isSU) {
            if (isJurisRole && worker.sede_juris_id !== userRole) {
                return res.status(400).json({ message: 'Este postulante no pertenece a su sede jurisdiccional' });
            } else if (!isJurisRole && worker.sede_regional_id !== userRole) {
                return res.status(400).json({ message: 'Este postulante no pertenece a la sede actual' });
            }
        }

        // Obtener/Resetear el estado del turno
        const turno = await getOrResetTurno(worker.id);

        // Ver si ya marco ingreso hoy en asistencias
        const attendanceRes = await db.query(
            'SELECT * FROM asistencias WHERE principal_id = $1 AND fecha_hora::date = CURRENT_DATE',
            [worker.id]
        );

        const attendance = attendanceRes.rows[0];

        // ── PRIORIDAD: Si condicion=2 y ya tiene marcacion_2 de HOY → completado (sin opción de salida) ──
        if (turno.condicion === 2) {
            const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
            const yaMarcoSegundo = turno.marcacion_2 && turno.marcacion_2 !== '0' &&
                turno.marcacion_2.substring(0, 10) === todayStr;

            if (yaMarcoSegundo) {
                return res.json({
                    worker: {
                        id: worker.id, dni: worker.doc_identidad,
                        nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                        puesto: worker.cargo,
                        area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                        sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                        tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                        hora_ingreso: turno.hora_ingreso_2
                    },
                    status: 'already_completed',
                    message: 'Usuario ya completó su asistencia. El día de mañana se habilitará nuevamente.',
                    attendance,
                    turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
                });
            }
        }

        // Si no ha marcado primer ingreso
        if (!attendance) {
            if (turno.condicion === 2) {
                const currentTotalMinutes = getNowMinutesLima();
                const ingreso1Min = toMinutes(worker.hora_ingreso);
                const ingreso2Min = toMinutes(turno.hora_ingreso_2 || '13:00');
                const esManana = ingreso1Min >= toMinutes('05:00') && ingreso1Min <= toMinutes('10:00');

                // Si es turno de mañana y ya pasaron las 11:00 AM (660 min), el 1er ingreso está vencido y se habilita el 2do ingreso directamente
                if (esManana && currentTotalMinutes > toMinutes('11:00')) {
                    return res.json({
                        worker: {
                            id: worker.id, dni: worker.doc_identidad,
                            nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                            puesto: worker.cargo,
                            area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                            sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                            tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                            hora_ingreso: turno.hora_ingreso_2
                        },
                        status: 'prompt_second_entrance',
                        message: '1er ingreso finalizado (venció a las 11:00 AM). ¿Deseas marcar su 2do ingreso?',
                        attendance: null,
                        turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
                    });
                }

                // Determinar si la hora actual está más cerca del 2do turno que del 1er turno
                const diff1 = Math.abs(currentTotalMinutes - ingreso1Min);
                const diff2 = Math.abs(currentTotalMinutes - ingreso2Min);
                const masCercaAlSegundo = diff2 <= diff1;

                if (masCercaAlSegundo) {
                    // Estamos en horario del 2do turno
                    const yaMarcoSegundo = turno.marcacion_2 && turno.marcacion_2 !== '0' &&
                        turno.marcacion_2.substring(0, 10) === new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

                    if (!yaMarcoSegundo) {
                        // No ha marcado 2do turno aún - verificar ventana de 30 min
                        const releaseTotalMinutes = ingreso2Min - 30;
                        if (currentTotalMinutes < releaseTotalMinutes) {
                            return res.json({
                                worker: {
                                    id: worker.id, dni: worker.doc_identidad,
                                    nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                                    puesto: worker.cargo,
                                    area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                                    sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                                    tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                                    hora_ingreso: turno.hora_ingreso_2
                                },
                                status: 'blocked_second',
                                message: `No se puede registrar el 2do ingreso aún. Se habilitará 30 min antes de las ${turno.hora_ingreso_2}.`,
                                attendance: null,
                                turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
                            });
                        }

                        // Habilitado - pedir confirmación para 2do ingreso
                        return res.json({
                            worker: {
                                id: worker.id, dni: worker.doc_identidad,
                                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                                puesto: worker.cargo,
                                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                                sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                                tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                                hora_ingreso: turno.hora_ingreso_2
                            },
                            status: 'prompt_second_entrance',
                            message: 'Postulante tiene 2 turnos. ¿Deseas marcar su 2do ingreso?',
                            attendance: null,
                            turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
                        });
                    } else {
                        return res.json({
                            worker: {
                                id: worker.id, dni: worker.doc_identidad,
                                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                                puesto: worker.cargo,
                                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                                sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                                tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                                hora_ingreso: turno.hora_ingreso_2
                            },
                            status: 'already_completed',
                            message: 'Usuario ya completó su asistencia. El día de mañana se habilitará nuevamente.',
                            attendance: null,
                            turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
                        });
                    }
                }
                // Está en horario del 1er turno → cae al flujo normal de primer ingreso
            }

            return res.json({
                worker: {
                    id: worker.id, dni: worker.doc_identidad,
                    nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                    puesto: worker.cargo,
                    area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                    sede_reg: worker.sede_reg, sede_juris: worker.sede_juris,
                    tipo_postulante: worker.tipo_postulante, turno: worker.turno,
                    hora_ingreso: worker.hora_ingreso
                },
                status: 'none',
                attendance: null,
                turno: { condicion: turno.condicion, hora_ingreso_2: turno.hora_ingreso_2, marcacion_2: turno.marcacion_2, estado: turno.estado, salida: turno.salida }
            });
        }

        // Ya marcó primer ingreso. Validar según condición de turno.
        if (turno.condicion === 1) {
            return res.json({
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
                status: 'already_completed',
                message: "Usuario ya registró su asistencia. El día de mañana se habilitará nuevamente",
                attendance,
                turno: {
                    condicion: turno.condicion,
                    hora_ingreso_2: turno.hora_ingreso_2,
                    marcacion_2: turno.marcacion_2,
                    estado: turno.estado,
                    salida: turno.salida
                }
            });
        } else if (turno.condicion === 2) {
            if (!turno.marcacion_2 || turno.marcacion_2 === '0') {
                // Verificar si se liberó (a partir de las 11:01 AM si es de mañana, o 30 min antes de hora_ingreso_2)
                const currentTotalMinutes = getNowMinutesLima();
                const ingreso1Min = toMinutes(worker.hora_ingreso);
                const ingreso2Min = toMinutes(turno.hora_ingreso_2 || '13:00');
                const esManana = ingreso1Min >= toMinutes('05:00') && ingreso1Min <= toMinutes('10:00');

                let debaHabilitar = false;
                if (esManana && currentTotalMinutes > toMinutes('11:00')) {
                    debaHabilitar = true;
                } else {
                    const releaseTotalMinutes = ingreso2Min - 30;
                    if (currentTotalMinutes >= releaseTotalMinutes) {
                        debaHabilitar = true;
                    }
                }

                if (!debaHabilitar) {
                    return res.json({
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
                        status: 'blocked_second',
                        message: `No se puede registrar el segundo ingreso aún. Se habilitará 30 minutos antes de las ${turno.hora_ingreso_2}.`,
                        attendance,
                        turno: {
                            condicion: turno.condicion,
                            hora_ingreso_2: turno.hora_ingreso_2,
                            marcacion_2: turno.marcacion_2,
                            estado: turno.estado,
                            salida: turno.salida
                        }
                    });
                }

                // Liberado -> solicitar confirmación para segundo ingreso
                return res.json({
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
                    status: 'prompt_second_entrance',
                    message: "El postulante tiene un segundo turno. ¿Deseas marcar su segundo ingreso?",
                    attendance,
                    turno: {
                        condicion: turno.condicion,
                        hora_ingreso_2: turno.hora_ingreso_2,
                        marcacion_2: turno.marcacion_2,
                        estado: turno.estado,
                        salida: turno.salida
                    }
                });
            } else {
                // Ya tiene segunda marcación -> Asistencia completada
                return res.json({
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
                    status: 'already_completed',
                    message: "Usuario ya registró su asistencia. El día de mañana se habilitará nuevamente",
                    attendance,
                    turno: {
                        condicion: turno.condicion,
                        hora_ingreso_2: turno.hora_ingreso_2,
                        marcacion_2: turno.marcacion_2,
                        estado: turno.estado,
                        salida: turno.salida
                    }
                });
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const registerWorker = async (req, res) => {
    const { dni, ape_pat, ape_mat, nombres, sede_juris_id, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso } = req.body;
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

    try {
        const jurisCheck = await db.query('SELECT * FROM sede_juris WHERE id = $1', [sede_juris_id]);
        if (jurisCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Sede jurisdiccional no válida' });
        }
        const sedeRegionalId = jurisCheck.rows[0].sede_regional_id;

        if (!isSU) {
            if (userRole && String(userRole).includes('-')) {
                if (sede_juris_id !== userRole) {
                    return res.status(400).json({ message: 'Solo se permite registrar postulantes para la sede jurisdiccional del usuario activo' });
                }
            } else if (sedeRegionalId !== userRole) {
                return res.status(400).json({ message: 'Solo se permite registrar postulantes para la sede del usuario activo' });
            }
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
            (doc_identidad, ape_pat, ape_mat, nombres, sede_juris_id, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
        `;

        const newWorker = await db.query(insertQuery, [
            dni, ape_pat, ape_mat, nombres, sede_juris_id, local, aula || 99, cargo_id, finalTipoPostulante,
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
                   sr.nombre as sede_reg, sj.nombre as sede_juris, p.aula, p.turno, p.hora_ingreso,
                   c.nombre as cargo, tp.descripcion as tipo_postulante, p.cargo_id, p.sede_juris_id
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
        `;
        let countQuery = `
            SELECT COUNT(*) 
            FROM principal p 
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
        `;
        const params = [];

        const conditions = [];
        if (tipo) {
            conditions.push(`tp.descripcion = $${conditions.length + 1}`);
            params.push(tipo);
        }
        if (!isSU) {
            if (userRole && String(userRole).includes('-')) {
                conditions.push(`p.sede_juris_id = $${conditions.length + 1}`);
            } else {
                conditions.push(`sj.sede_regional_id = $${conditions.length + 1}`);
            }
            params.push(userRole);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ` ORDER BY sr.nombre, sj.nombre, p.local, c.nombre, p.ape_pat LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

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
    const { sede_juris_id, local, aula, cargo_id, turno, hora_ingreso } = req.body;
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        if (!isSU) {
            const checkWorker = await db.query(`
                SELECT p.sede_juris_id, sj.sede_regional_id 
                FROM principal p 
                JOIN sede_juris sj ON p.sede_juris_id = sj.id 
                WHERE p.id = $1
            `, [id]);
            if (checkWorker.rows.length === 0) return res.status(404).json({ message: 'Postulante no encontrado' });
            
            if (userRole && String(userRole).includes('-')) {
                if (checkWorker.rows[0].sede_juris_id !== userRole) {
                    return res.status(403).json({ message: 'No tiene permisos para modificar este postulante' });
                }
                if (sede_juris_id && sede_juris_id !== userRole) {
                    return res.status(400).json({ message: 'No puede cambiar la sede jurisdiccional del postulante' });
                }
            } else {
                if (checkWorker.rows[0].sede_regional_id !== userRole) {
                    return res.status(403).json({ message: 'No tiene permisos para modificar este postulante' });
                }
                if (sede_juris_id) {
                    const newJurisCheck = await db.query('SELECT sede_regional_id FROM sede_juris WHERE id = $1', [sede_juris_id]);
                    if (newJurisCheck.rows.length === 0 || newJurisCheck.rows[0].sede_regional_id !== userRole) {
                        return res.status(400).json({ message: 'No puede cambiar la sede del postulante a otra diferente de la suya' });
                    }
                }
            }
        }
        const updateQuery = `
            UPDATE principal 
            SET sede_juris_id = COALESCE($1, sede_juris_id), 
                local = COALESCE($2, local), 
                aula = COALESCE($3, aula), 
                cargo_id = COALESCE($4, cargo_id), 
                turno = COALESCE($5, turno),
                hora_ingreso = COALESCE($6, hora_ingreso)
            WHERE id = $7 RETURNING *
        `;
        const result = await db.query(updateQuery, [sede_juris_id, local, aula, cargo_id, turno, hora_ingreso, id]);

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
        const regionalRes = await db.query('SELECT id, nombre, ubigeo FROM sede_regional ORDER BY nombre ASC');
        const jurisRes = await db.query('SELECT id, nombre, sede_regional_id, codigo_juris, ubigeo FROM sede_juris ORDER BY nombre ASC');

        let queryWorkers = `
            SELECT id, sede_juris_id, doc_identidad as dni, ape_pat, ape_mat, nombres, local as area, 
                   aula, tipo_postulante_id, cargo_id, turno, hora_ingreso 
            FROM principal
        `;
        let queryAsistencias = `
            SELECT a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones, a.usuario_registro_id 
            FROM asistencias a
            WHERE a.fecha_hora::date = CURRENT_DATE
        `;
        let queryTurnos = `
            SELECT id, principal_id, condicion, hora_ingreso_2, marcacion_2, estado, salida
            FROM turnos
        `;
        const params = [];
        if (!isSU) {
            if (userRole && String(userRole).includes('-')) {
                queryWorkers = `
                    SELECT p.id, p.sede_juris_id, p.doc_identidad as dni, p.ape_pat, p.ape_mat, p.nombres, p.local as area, 
                           p.aula, p.tipo_postulante_id, p.cargo_id, p.turno, p.hora_ingreso 
                    FROM principal p
                    WHERE p.sede_juris_id = $1
                `;
                queryAsistencias = `
                    SELECT a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones, a.usuario_registro_id 
                    FROM asistencias a
                    JOIN principal p ON a.principal_id = p.id
                    WHERE a.fecha_hora::date = CURRENT_DATE AND p.sede_juris_id = $1
                `;
                queryTurnos = `
                    SELECT t.id, t.principal_id, t.condicion, t.hora_ingreso_2, t.marcacion_2, t.estado, t.salida
                    FROM turnos t
                    JOIN principal p ON t.principal_id = p.id
                    WHERE p.sede_juris_id = $1
                `;
            } else {
                queryWorkers = `
                    SELECT p.id, p.sede_juris_id, p.doc_identidad as dni, p.ape_pat, p.ape_mat, p.nombres, p.local as area, 
                           p.aula, p.tipo_postulante_id, p.cargo_id, p.turno, p.hora_ingreso 
                    FROM principal p
                    JOIN sede_juris sj ON p.sede_juris_id = sj.id
                    WHERE sj.sede_regional_id = $1
                `;
                queryAsistencias = `
                    SELECT a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones, a.usuario_registro_id 
                    FROM asistencias a
                    JOIN principal p ON a.principal_id = p.id
                    JOIN sede_juris sj ON p.sede_juris_id = sj.id
                    WHERE a.fecha_hora::date = CURRENT_DATE AND sj.sede_regional_id = $1
                `;
                queryTurnos = `
                    SELECT t.id, t.principal_id, t.condicion, t.hora_ingreso_2, t.marcacion_2, t.estado, t.salida
                    FROM turnos t
                    JOIN principal p ON t.principal_id = p.id
                    JOIN sede_juris sj ON p.sede_juris_id = sj.id
                    WHERE sj.sede_regional_id = $1
                `;
            }
            params.push(userRole);
        }

        const workersRes = await db.query(queryWorkers, params);
        const asistenciasRes = await db.query(queryAsistencias, params);
        const turnosRes = await db.query(queryTurnos, params);

        res.json({
            cargos: cargosRes.rows,
            metas_cargos: metasCargosRes.rows,
            tipo_postulante: tipoPostulanteRes.rows,
            parametros_asistencia: parametrosAsistenciaRes.rows,
            sede_regional: regionalRes.rows,
            sede_juris: jurisRes.rows,
            workers: workersRes.rows,
            asistencias: asistenciasRes.rows,
            turnos: turnosRes.rows
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
            if (userRole && String(userRole).includes('-')) {
                queryWorkers = 'SELECT COUNT(*) FROM principal p WHERE p.sede_juris_id = $1';
                queryAsistencias = 'SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id WHERE a.fecha_hora::date = CURRENT_DATE AND p.sede_juris_id = $1';
            } else {
                queryWorkers = 'SELECT COUNT(*) FROM principal p JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE sj.sede_regional_id = $1';
                queryAsistencias = 'SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE a.fecha_hora::date = CURRENT_DATE AND sj.sede_regional_id = $1';
            }
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
                `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante,
                        sj.nombre as sede_juris, sr.nombre as sede_reg, sj.sede_regional_id
                 FROM principal p 
                 JOIN cargos c ON p.cargo_id = c.id 
                 JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
                 JOIN sede_juris sj ON p.sede_juris_id = sj.id
                 JOIN sede_regional sr ON sj.sede_regional_id = sr.id
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

            if (!isSU) {
                const isJuris = userRole && String(userRole).includes('-');
                if (isJuris && worker.sede_juris_id !== userRole) {
                    return res.json({
                        status: 'not_found',
                        dni,
                        message: `DNI ${dni} decodificado, pero no registrado en su sede jurisdiccional.`
                    });
                } else if (!isJuris && worker.sede_regional_id !== userRole) {
                    return res.json({
                        status: 'not_found',
                        dni,
                        message: `DNI ${dni} decodificado, pero no registrado en su sede regional.`
                    });
                }
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
        const workerCheck = await db.query(`
            SELECT p.*, sj.nombre as old_juris_nombre, sr.nombre as old_regional_nombre
            FROM principal p
            LEFT JOIN sede_juris sj ON p.sede_juris_id = sj.id
            LEFT JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            WHERE p.id = $1
        `, [workerId]);
        if (workerCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado.' });
        }

        const worker = workerCheck.rows[0];
        const oldSede = `${worker.old_regional_nombre || ''} - ${worker.old_juris_nombre || ''}`;

        // Obtener nombres de nueva sede
        const newSedeCheck = await db.query(`
            SELECT sj.nombre as new_juris_nombre, sr.nombre as new_regional_nombre
            FROM sede_juris sj
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            WHERE sj.id = $1
        `, [nuevaSede]);
        if (newSedeCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Nueva sede jurisdiccional no válida.' });
        }
        const newSedeName = `${newSedeCheck.rows[0].new_regional_nombre} - ${newSedeCheck.rows[0].new_juris_nombre}`;

        // Actualizar la sede
        await db.query('UPDATE principal SET sede_juris_id = $1 WHERE id = $2', [nuevaSede, workerId]);

        // Registrar en historial
        await db.query(
            'INSERT INTO historial_cambios_sede (principal_id, sede_origen, sede_destino, usuario_cambio) VALUES ($1, $2, $3, $4)',
            [workerId, oldSede, newSedeName, username]
        );

        res.json({
            message: 'Sede cambiada correctamente.',
            worker: {
                id: worker.id,
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                sede_origen: oldSede,
                sede_destino: newSedeName
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

const registrarSegundaAsistencia = async (req, res) => {
    const { dni, usuario_registro_id } = req.body;
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

    try {
        const workerRes = await db.query(
            `SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante,
                    sj.nombre as sede_juris, sr.nombre as sede_reg, sj.sede_regional_id
             FROM principal p 
             JOIN cargos c ON p.cargo_id = c.id 
             JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
             JOIN sede_juris sj ON p.sede_juris_id = sj.id
             JOIN sede_regional sr ON sj.sede_regional_id = sr.id
             WHERE p.doc_identidad = $1`,
            [dni]
        );

        if (workerRes.rows.length === 0) {
            return res.status(404).json({ message: 'Postulante no encontrado' });
        }

        const worker = workerRes.rows[0];

        if (!isSU) {
            const isJuris = userRole && String(userRole).includes('-');
            if (isJuris && worker.sede_juris_id !== userRole) {
                return res.status(403).json({ message: 'Este postulante no pertenece a la sede jurisdiccional actual' });
            } else if (!isJuris && worker.sede_regional_id !== userRole) {
                return res.status(403).json({ message: 'Este postulante no pertenece a la sede actual' });
            }
        }

        const turno = await getOrResetTurno(worker.id);

        if (turno.condicion !== 2) {
            return res.status(400).json({ message: 'El postulante no tiene condición de doble turno' });
        }

        // Verificar si ya marcó el 2do turno HOY
        const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
        const yaMarcoHoy = turno.marcacion_2 && turno.marcacion_2 !== '0' &&
            turno.marcacion_2.substring(0, 10) === todayStr;

        if (yaMarcoHoy) {
            return res.status(400).json({ message: 'Ya se registró la segunda marcación de ingreso de hoy.' });
        }

        // Determinar estado (P o T) comparando hora actual con hora_ingreso_2
        const currentTotalMinutes = getNowMinutesLima();
        const ingresoTotalMinutes = toMinutes(turno.hora_ingreso_2 || '13:00');
        const estado = currentTotalMinutes <= ingresoTotalMinutes ? 'P' : 'T';

        const timestampStr = getLimaTimestamp();

        await db.query(
            `UPDATE turnos 
             SET marcacion_2 = $1, estado = $2 
             WHERE principal_id = $3`,
            [timestampStr, estado, worker.id]
        );

        res.status(200).json({
            message: 'Segundo ingreso registrado exitosamente',
            worker: {
                nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
                puesto: worker.cargo,
                area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
                turno: worker.turno,
                hora_ingreso: turno.hora_ingreso_2
            },
            record: {
                principal_id: worker.id,
                marcacion_2: timestampStr,
                estado
            },
            estado_desc: estado === 'P' ? 'PUNTUAL / TEMPRANO' : 'TARDE'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const registrarSalida = async (req, res) => {
    return res.status(400).json({ message: 'La marcación de salida se encuentra deshabilitada.' });
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
    getSedeHistory,
    registrarSegundaAsistencia,
    registrarSalida
};