const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    const { username, password } = req.body;

    try {
        console.log('Intento de login para usuario:', username);
        const result = await db.query('SELECT * FROM usuarios WHERE username = $1 AND activo = TRUE', [username]);
        
        if (result.rows.length === 0) {
            console.log('Usuario no encontrado en DB:', username);
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('¿Contraseña coincide?:', isMatch);

        if (!isMatch) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            process.env.JWT_SECRET || 'clave_secreta_provisional',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                nombre: user.nombre,
                rol: user.rol
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

module.exports = {
    login
};
