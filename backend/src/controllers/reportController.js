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
                COALESCE(asist.observaciones, '') as "OBSERVACIONES",
                COALESCE(u.username, 'desconocido') as "USUARIO_REGISTRO"
            FROM asistencias asist
            JOIN principal p ON asist.principal_id = p.id
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            JOIN sede_juris sj ON p.sede_juris_id = sj.id
            JOIN sede_regional sr ON sj.sede_regional_id = sr.id
            LEFT JOIN usuarios u ON asist.usuario_registro_id = u.id
        `;
        const params = [];
        if (!isSU) {
            query += ` WHERE sj.sede_regional_id = $1`;
            params.push(userRole);
        }
        query += ` ORDER BY asist.fecha_hora DESC`;

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
    try {
        let statsQuery;
        let params = [];
        if (isSU) {
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) FROM principal) as total_postulantes,
                    (SELECT COUNT(*) FROM asistencias WHERE (fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date) as presentes,
                    (SELECT COUNT(*) FROM asistencias WHERE (fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND estado = 'T') as tardanzas,
                    (SELECT COUNT(*) FROM asistencias WHERE (fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND estado = 'P') as temprano
            `;
        } else {
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) FROM principal p JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE sj.sede_regional_id = $1) as total_postulantes,
                    (SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND sj.sede_regional_id = $1) as presentes,
                    (SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND a.estado = 'T' AND sj.sede_regional_id = $1) as tardanzas,
                    (SELECT COUNT(*) FROM asistencias a JOIN principal p ON a.principal_id = p.id JOIN sede_juris sj ON p.sede_juris_id = sj.id WHERE (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND a.estado = 'P' AND sj.sede_regional_id = $1) as temprano
            `;
            params.push(userRole);
        }

        const stats = await db.query(statsQuery, params);
        const data = stats.rows[0];
        const faltas = parseInt(data.total_postulantes) - parseInt(data.presentes);

        let queryAsistenciaPorCargo = `
            SELECT c.nombre as cargo, 
                   COUNT(a.id) as presentes,
                   (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as total_cargo
            FROM cargos c
            LEFT JOIN principal p ON p.cargo_id = c.id
            LEFT JOIN asistencias a ON a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
            GROUP BY c.id, c.nombre
            ORDER BY c.id ASC
        `;
        let queryMetasPorCargo = `
            SELECT c.nombre as cargo,
                   COALESCE(m.limite_vacantes, 0) as meta,
                   (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as registrados
            FROM cargos c
            LEFT JOIN metas_cargos m ON m.cargo_id = c.id
            ORDER BY c.id ASC
        `;

        if (!isSU) {
            queryAsistenciaPorCargo = `
                SELECT c.nombre as cargo, 
                       COUNT(a.id) as presentes,
                       (SELECT COUNT(*) FROM principal p2 JOIN sede_juris sj2 ON p2.sede_juris_id = sj2.id WHERE p2.cargo_id = c.id AND sj2.sede_regional_id = $1) as total_cargo
                FROM cargos c
                LEFT JOIN principal p ON p.cargo_id = c.id
                LEFT JOIN sede_juris sj ON p.sede_juris_id = sj.id AND sj.sede_regional_id = $1
                LEFT JOIN asistencias a ON a.principal_id = p.id AND (a.fecha_hora AT TIME ZONE 'America/Lima')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AND sj.id IS NOT NULL
                GROUP BY c.id, c.nombre
                ORDER BY c.id ASC
            `;
            queryMetasPorCargo = `
                SELECT c.nombre as cargo,
                       COALESCE(m.limite_vacantes, 0) as meta,
                       (SELECT COUNT(*) FROM principal p2 JOIN sede_juris sj2 ON p2.sede_juris_id = sj2.id WHERE p2.cargo_id = c.id AND sj2.sede_regional_id = $1) as registrados
                FROM cargos c
                LEFT JOIN metas_cargos m ON m.cargo_id = c.id
                ORDER BY c.id ASC
            `;
        }

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

module.exports = {
    exportAttendanceToExcel,
    getAbsentees,
    getStats,
    getDailyAttendance
};
