const db = require('../config/db');

const getCargos = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.id, c.nombre, COALESCE(m.limite_vacantes, 0) as meta 
            FROM cargos c 
            LEFT JOIN metas_cargos m ON c.id = m.cargo_id
            ORDER BY c.id ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener cargos' });
    }
};

const createCargo = async (req, res) => {
    const { nombre, meta } = req.body;
    try {
        await db.query('BEGIN');
        const cargoResult = await db.query(
            'INSERT INTO cargos (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );
        const cargo = cargoResult.rows[0];

        if (meta !== undefined) {
            await db.query(
                'INSERT INTO metas_cargos (cargo_id, limite_vacantes) VALUES ($1, $2)',
                [cargo.id, meta]
            );
        }

        await db.query('COMMIT');
        res.status(201).json({ ...cargo, meta: meta || 0 });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ message: 'Error al crear cargo' });
    }
};

const updateMeta = async (req, res) => {
    const { id } = req.params;
    const { meta } = req.body;
    try {
        // Lógica de Upsert (insertar o actualizar) para la meta
        await db.query(`
            INSERT INTO metas_cargos (cargo_id, limite_vacantes)
            VALUES ($1, $2)
            ON CONFLICT (cargo_id) 
            DO UPDATE SET limite_vacantes = $2
        `, [id, meta]);
        res.json({ message: 'Meta actualizada correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar meta.' });
    }
};

const getSedes = async (req, res) => {
    try {
        const regionals = await db.query('SELECT id, nombre, ubigeo FROM sede_regional ORDER BY nombre ASC');
        const jurisdictions = await db.query('SELECT id, nombre, sede_regional_id, codigo_juris, ubigeo FROM sede_juris ORDER BY nombre ASC');
        res.json({
            regionals: regionals.rows,
            jurisdictions: jurisdictions.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener sedes' });
    }
};

module.exports = {
    getCargos,
    createCargo,
    updateMeta,
    getSedes
};
