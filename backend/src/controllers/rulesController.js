const db = require('../config/db');

const getRules = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM reglas_asistencia ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener reglas' });
    }
};

const createRule = async (req, res) => {
    const { nombre, dias_labor, hora_ingreso, hora_salida, es_predeterminado } = req.body;
    try {
        if (es_predeterminado) {
            // Quitar predeterminado a los demás
            await db.query('UPDATE reglas_asistencia SET es_predeterminado = FALSE');
        }
        
        const result = await db.query(
            `INSERT INTO reglas_asistencia (nombre, dias_labor, hora_ingreso, hora_salida, es_predeterminado) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [nombre, dias_labor, hora_ingreso, hora_salida, es_predeterminado]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear regla' });
    }
};

const applyRuleToCargo = async (req, res) => {
    const { regla_id, cargo_id } = req.body;
    try {
        await db.query('UPDATE principal SET regla_id = $1 WHERE cargo_id = $2', [regla_id, cargo_id]);
        res.json({ message: 'Regla aplicada a todos los trabajadores del cargo.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al aplicar la regla.' });
    }
};

module.exports = {
    getRules,
    createRule,
    applyRuleToCargo
};
