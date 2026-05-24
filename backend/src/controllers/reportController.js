const db = require('../config/db');
const XLSX = require('xlsx');
const path = require('path');

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

        // Crear libro y hoja de trabajo
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(result.rows);
        XLSX.utils.book_append_sheet(wb, ws, "Asistencias");

        // Generar buffer
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
                   p.local as area, c.nombre as puesto
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
                (SELECT COUNT(*) FROM principal) as total_trabajadores,
                (SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE) as presentes,
                (SELECT COUNT(*) FROM asistencias WHERE fecha_hora::date = CURRENT_DATE AND estado = 'T') as tardanzas
        `);
        
        const data = stats.rows[0];
        const faltas = parseInt(data.total_trabajadores) - parseInt(data.presentes);
        
        res.json({
            presentes: parseInt(data.presentes),
            faltas: faltas,
            tardanzas: parseInt(data.tardanzas)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

module.exports = {
    exportAttendanceToExcel,
    getAbsentees,
    getStats
};
