const db = require('../config/db');
const XLSX = require('xlsx');

const exportAttendanceToExcel = async (req, res) => {
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        let query = `
            SELECT 
                asist.id as "Id",
                'DNI' as "tipo_doc",
                p.doc_identidad as "numero_doc",
                p.ape_pat as "apellido_paterno",
                p.ape_mat as "apellido_materno",
                p.nombres as "nombres",
                sr.nombre as "sede_regional",
                sj.nombre as "sede_provincial_id",
                p.local as "local_id",
                p.aula as "num_aula",
                tp.descripcion as "tipo_postulante_id",
                c.nombre as "CARGO",
                p.turno as "TURNO",
                p.hora_ingreso::text as "HORA_PROGRAMADA",
                to_char((asist.fecha_hora AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD') as "FECHA_REGISTRO",
                to_char((asist.fecha_hora AT TIME ZONE 'America/Lima'), 'HH24:MI:SS') as "HORA_REGISTRO",
                asist.estado as "ESTADO_ASISTENCIA",
                CASE 
                    WHEN asist.estado IN ('P', 'T') THEN 'A'
                    ELSE 'NA'
                END as "ESTADO",
                COALESCE(asist.observaciones, '') as "OBSERVACIONES",
                COALESCE(u.username, 'desconocido') as "USUARIO_REGISTRO"
            FROM principal p
            LEFT JOIN asistencias asist ON asist.principal_id = p.id
            LEFT JOIN cargos c ON p.cargo_id = c.id
            LEFT JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            LEFT JOIN usuarios u ON asist.usuario_registro_id = u.id
        `;
        const params = [];
        if (!isSU) {
            query += ` WHERE sj.sede_regional_id = $1`;
            params.push(userRole);
        }
        query += ` ORDER BY p.ape_pat ASC, p.ape_mat ASC, asist.fecha_hora DESC`;

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No hay datos para exportar' });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(result.rows);
        XLSX.utils.book_append_sheet(wb, ws, "Asistencias");

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=reporte_asistencia.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al generar el reporte Excel' });
    }
};

const getAbsentees = async (req, res) => {
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    try {
        let query = `
            SELECT p.doc_identidad as dni, p.nombres, p.ape_pat || ' ' || p.ape_mat as apellidos, 
                   p.local as area, c.nombre as puesto, p.turno, p.hora_ingreso::text as hora_ingreso
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            WHERE NOT EXISTS (
                SELECT 1 FROM asistencias asist 
                WHERE asist.principal_id = p.id 
                AND (asist.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
            )
        `;
        const params = [];
        if (!isSU) {
            query += ` AND sj.sede_regional_id = $1`;
            params.push(userRole);
        }
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener faltas de hoy' });
    }
};

const getStats = async (req, res) => {
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    const shift = req.query.shift === 'tarde' ? 'tarde' : 'dia';
    try {
        let params = [];
        const roleJoin = isSU ? '' : 'JOIN sede_juris sj ON p.sede_juris_id = sj.id';
        const roleWhere = isSU ? '' : 'AND sj.sede_regional_id = $1';
        const roleJoinSub = isSU ? '' : 'JOIN sede_juris sj ON p2.sede_juris_id = sj.id';
        if (!isSU) params.push(userRole);

        let statsQuery = '';
        if (shift === 'tarde') {
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) FROM principal p ${roleJoin} LEFT JOIN turnos t ON t.principal_id = p.id WHERE (CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 OR t.condicion = 2) ${roleWhere}) as total_postulantes,
                    
                    (SELECT COUNT(*) FROM principal p ${roleJoin} 
                     LEFT JOIN asistencias a ON a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                     LEFT JOIN turnos t ON t.principal_id = p.id
                     WHERE (
                       (CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 AND a.id IS NOT NULL) OR
                       (t.condicion = 2 AND t.marcacion_2 != '0' AND t.marcacion_2 IS NOT NULL AND CAST(SUBSTRING(t.marcacion_2 FROM 1 FOR 10) AS DATE) = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date)
                     ) ${roleWhere}) as presentes,
                     
                    (SELECT COUNT(*) FROM principal p ${roleJoin}
                     LEFT JOIN asistencias a ON a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                     LEFT JOIN turnos t ON t.principal_id = p.id
                     WHERE (
                       (CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 AND a.estado = 'T') OR
                       (t.condicion = 2 AND t.marcacion_2 != '0' AND t.marcacion_2 IS NOT NULL AND CAST(SUBSTRING(t.marcacion_2 FROM 1 FOR 10) AS DATE) = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND t.estado = 'T')
                     ) ${roleWhere}) as tardanzas,
                     
                    (SELECT COUNT(*) FROM principal p ${roleJoin}
                     LEFT JOIN asistencias a ON a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                     LEFT JOIN turnos t ON t.principal_id = p.id
                     WHERE (
                       (CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 AND a.estado = 'P') OR
                       (t.condicion = 2 AND t.marcacion_2 != '0' AND t.marcacion_2 IS NOT NULL AND CAST(SUBSTRING(t.marcacion_2 FROM 1 FOR 10) AS DATE) = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND t.estado = 'P')
                     ) ${roleWhere}) as temprano
            `;
        } else {
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) FROM principal p ${roleJoin} WHERE CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as total_postulantes,
                    
                    (SELECT COUNT(*) FROM principal p ${roleJoin} JOIN asistencias a ON a.principal_id = p.id 
                     WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date 
                     AND CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as presentes,
                     
                    (SELECT COUNT(*) FROM principal p ${roleJoin} JOIN asistencias a ON a.principal_id = p.id 
                     WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date 
                     AND a.estado = 'T' AND CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as tardanzas,
                     
                    (SELECT COUNT(*) FROM principal p ${roleJoin} JOIN asistencias a ON a.principal_id = p.id 
                     WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date 
                     AND a.estado = 'P' AND CAST(SUBSTRING(p.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as temprano
            `;
        }

        const stats = await db.query(statsQuery, params);
        const data = stats.rows[0];
        const faltas = parseInt(data.total_postulantes) - parseInt(data.presentes);

        let queryAsistenciaPorCargo = '';
        if (shift === 'tarde') {
            queryAsistenciaPorCargo = `
                SELECT c.nombre as cargo, 
                       (SELECT COUNT(*) FROM principal p2 ${roleJoinSub} LEFT JOIN turnos t2 ON p2.id = t2.principal_id WHERE p2.cargo_id = c.id AND (CAST(SUBSTRING(p2.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 OR t2.condicion = 2) ${roleWhere}) as total_cargo,
                       (SELECT COUNT(*) FROM principal p2 ${roleJoinSub} 
                        LEFT JOIN asistencias a2 ON a2.principal_id = p2.id AND (a2.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                        LEFT JOIN turnos t2 ON p2.id = t2.principal_id
                        WHERE p2.cargo_id = c.id AND (
                          (CAST(SUBSTRING(p2.hora_ingreso FROM 1 FOR 2) AS INTEGER) >= 13 AND a2.id IS NOT NULL) OR
                          (t2.condicion = 2 AND t2.marcacion_2 != '0' AND t2.marcacion_2 IS NOT NULL AND CAST(SUBSTRING(t2.marcacion_2 FROM 1 FOR 10) AS DATE) = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date)
                        ) ${roleWhere}) as presentes
                FROM cargos c
                ORDER BY c.id ASC
            `;
        } else {
            queryAsistenciaPorCargo = `
                SELECT c.nombre as cargo, 
                       (SELECT COUNT(*) FROM principal p2 ${roleJoinSub} WHERE p2.cargo_id = c.id AND CAST(SUBSTRING(p2.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as total_cargo,
                       (SELECT COUNT(*) FROM principal p2 ${roleJoinSub} 
                        JOIN asistencias a2 ON a2.principal_id = p2.id AND (a2.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                        WHERE p2.cargo_id = c.id AND CAST(SUBSTRING(p2.hora_ingreso FROM 1 FOR 2) AS INTEGER) < 13 ${roleWhere}) as presentes
                FROM cargos c
                ORDER BY c.id ASC
            `;
        }

        let queryMetasPorCargo = `
            SELECT c.nombre as cargo,
                   COALESCE(m.limite_vacantes, 0) as meta,
                   (SELECT COUNT(*) FROM principal p2 ${roleJoinSub} WHERE p2.cargo_id = c.id ${roleWhere}) as registrados
            FROM cargos c
            LEFT JOIN metas_cargos m ON m.cargo_id = c.id
            ORDER BY c.id ASC
        `;

        const asistenciaPorCargo = await db.query(queryAsistenciaPorCargo, params);
        const metasPorCargo = await db.query(queryMetasPorCargo, params);
        
        res.json({
            presentes: parseInt(data.presentes),
            faltas: faltas,
            tardanzas: parseInt(data.tardanzas),
            temprano: parseInt(data.temprano),
            asistenciaPorCargo: asistenciaPorCargo.rows,
            metasPorCargo: metasPorCargo.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener estadisticas' });
    }
};

const getDailyAttendance = async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
    const userRole = req.user.rol;
    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

    try {
        let queryPresentes = `
            SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
                   COALESCE(c.nombre, 'Sin Cargo') as cargo, COALESCE(tp.descripcion, 'Sin Tipo') as tipo_postulante,
                   sr.nombre as sede_reg, sr.nombre as sede_regional, sj.nombre as sede_juris,
                   p.local, p.turno, p.aula,
                   p.hora_ingreso::text as hora_ingreso, a.estado, a.fecha_hora
            FROM asistencias a
            JOIN principal p ON a.principal_id = p.id
            LEFT JOIN cargos c ON p.cargo_id = c.id
            LEFT JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = $1
        `;
        let queryAusentes = `
            SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
                   COALESCE(c.nombre, 'Sin Cargo') as cargo, COALESCE(tp.descripcion, 'Sin Tipo') as tipo_postulante,
                   sr.nombre as sede_reg, sr.nombre as sede_regional, sj.nombre as sede_juris,
                   p.local, p.turno, p.aula,
                   p.hora_ingreso::text as hora_ingreso
            FROM principal p
            LEFT JOIN cargos c ON p.cargo_id = c.id
            LEFT JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            WHERE NOT EXISTS (
                SELECT 1 FROM asistencias a 
                WHERE a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = $1
            )
        `;
        const paramsPresentes = [targetDate];
        const paramsAusentes = [targetDate];

        if (!isSU) {
            queryPresentes += ` AND sj.sede_regional_id = $2`;
            paramsPresentes.push(userRole);

            queryAusentes += ` AND sj.sede_regional_id = $2`;
            paramsAusentes.push(userRole);
        }

        queryPresentes += ` ORDER BY a.fecha_hora DESC`;
        queryAusentes += ` ORDER BY p.ape_pat, p.ape_mat`;

        const presentesRes = await db.query(queryPresentes, paramsPresentes);
        const ausentesRes = await db.query(queryAusentes, paramsAusentes);

        res.json({
            date: targetDate,
            presentes: presentesRes.rows,
            ausentes: ausentesRes.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener asistencia diaria.' });
    }
};

const getUltimaActualizacion = async (req, res) => {
    try {
        const result = await db.query('SELECT COALESCE(MAX(id), 0) as ultima_id FROM control_actualizaciones');
        res.json({ ultima_id: parseInt(result.rows[0].ultima_id) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener última actualización.' });
    }
};

module.exports = {
    exportAttendanceToExcel,
    getAbsentees,
    getStats,
    getDailyAttendance,
    getUltimaActualizacion
};
