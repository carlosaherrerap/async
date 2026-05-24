const db = require('../config/db');
const XLSX = require('xlsx');
const path = require('path');

const exportAttendanceToExcel = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.dni as "DNI",
                t.nombres || ' ' || t.apellidos as "Trabajador",
                a.nombre as "Area",
                p.nombre as "Puesto",
                asist.fecha as "Fecha",
                asist.hora_entrada as "Hora Entrada",
                asist.hora_salida as "Hora Salida",
                asist.estado as "Estado",
                asist.observaciones as "Observaciones"
            FROM asistencias asist
            JOIN trabajadores t ON asist.trabajador_id = t.id
            JOIN puestos p ON t.puesto_id = p.id
            JOIN areas a ON p.area_id = a.id
            ORDER BY asist.fecha DESC, asist.hora_entrada DESC
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
            SELECT t.dni, t.nombres, t.apellidos, a.nombre as area, p.nombre as puesto
            FROM trabajadores t
            JOIN puestos p ON t.puesto_id = p.id
            JOIN areas a ON p.area_id = a.id
            WHERE t.activo = TRUE
            AND NOT EXISTS (
                SELECT 1 FROM asistencias asist 
                WHERE asist.trabajador_id = t.id 
                AND asist.fecha = CURRENT_DATE
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
                (SELECT COUNT(*) FROM trabajadores WHERE activo = TRUE) as total_trabajadores,
                (SELECT COUNT(*) FROM asistencias WHERE fecha = CURRENT_DATE) as presentes,
                (SELECT COUNT(*) FROM asistencias WHERE fecha = CURRENT_DATE AND estado = 'Tardanza') as tardanzas
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
