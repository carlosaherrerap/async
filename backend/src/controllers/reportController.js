const db = require('../config/db');
const XLSX = require('xlsx');

const exportAttendanceToExcel = async (req, res) => {
    try {
        const query = `
            SELECT 
                asist.id as "Id",
                'DNI' as "tipo_doc",
                p.doc_identidad as "numero_doc",
                p.ape_pat as "apellido_paterno",
                p.ape_mat as "apellido_materno",
                p.nombres as "nombres",
                p.sede_reg as "sede_regional",
                p.sede_juris as "sede_provincial_id",
                p.local as "local_id",
                p.aula as "num_aula",
                tp.descripcion as "tipo_postulante_id",
                c.nombre as "CARGO",
                p.turno as "TURNO",
                p.hora_ingreso::text as "HORA_PROGRAMADA",
                to_char(asist.fecha_hora, 'YYYY-MM-DD') as "FECHA_REGISTRO",
                to_char(asist.fecha_hora, 'HH24:MI:SS') as "HORA_REGISTRO",
                asist.estado as "ESTADO_ASISTENCIA",
                COALESCE(asist.observaciones, '') as "OBSERVACIONES"
            FROM asistencias asist
            JOIN principal p ON asist.principal_id = p.id
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            ORDER BY asist.fecha_hora DESC
        `;

        const result = await db.query(query);

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
    try {
        const query = `
            SELECT p.doc_identidad as dni, p.nombres, p.ape_pat || ' ' || p.ape_mat as apellidos, 
                   p.local as area, c.nombre as puesto, p.turno, p.hora_ingreso::text as hora_ingreso
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            WHERE NOT EXISTS (
                SELECT 1 FROM asistencias asist 
                WHERE asist.principal_id = p.id 
                AND asist.fecha_hora::date = CURRENT_DATE
            )
        `;

        const result = await db.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener faltas de hoy' });
    }
};

const getStats = async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM principal) as total_postulantes,
                (SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE) as presentes,
                (SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE AND estado = 'T') as tardanzas,
                (SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE AND estado = 'P') as temprano
        `);
        
        const data = stats.rows[0];
        const faltas = parseInt(data.total_postulantes) - parseInt(data.presentes);

        const asistenciaPorCargo = await db.query(`
            SELECT c.nombre as cargo, 
                   COUNT(a.id) as presentes,
                   (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as total_cargo
            FROM cargos c
            LEFT JOIN principal p ON p.cargo_id = c.id
            LEFT JOIN asistencias a ON a.principal_id = p.id AND a.fecha_hora::date = CURRENT_DATE
            GROUP BY c.id, c.nombre
            ORDER BY c.id ASC
        `);

        const metasPorCargo = await db.query(`
            SELECT c.nombre as cargo,
                   COALESCE(m.limite_vacantes, 0) as meta,
                   (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as registrados
            FROM cargos c
            LEFT JOIN metas_cargos m ON m.cargo_id = c.id
            ORDER BY c.id ASC
        `);
        
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

    try {
        const presentesRes = await db.query(`
            SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
                   c.nombre as cargo, tp.descripcion as tipo_postulante,
                   p.sede_reg, p.sede_juris, p.local, p.turno,
                   p.hora_ingreso::text as hora_ingreso, a.estado, a.fecha_hora
            FROM asistencias a
            JOIN principal p ON a.principal_id = p.id
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            WHERE a.fecha_hora::date = $1
            ORDER BY a.fecha_hora DESC
        `, [targetDate]);

        const ausentesRes = await db.query(`
            SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
                   c.nombre as cargo, tp.descripcion as tipo_postulante,
                   p.sede_reg, p.sede_juris, p.local, p.turno,
                   p.hora_ingreso::text as hora_ingreso
            FROM principal p
            JOIN cargos c ON p.cargo_id = c.id
            JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
            WHERE NOT EXISTS (
                SELECT 1 FROM asistencias a 
                WHERE a.principal_id = p.id AND a.fecha_hora::date = $1
            )
            ORDER BY p.ape_pat, p.ape_mat
        `, [targetDate]);

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
