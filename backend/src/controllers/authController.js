const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    const { username, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    try {
        console.log('Intento de login para usuario:', username, 'desde IP:', ip);
        const result = await db.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            console.log('Usuario no encontrado en DB:', username);
            await db.query('INSERT INTO intentos_login (username, ip_address, exitoso) VALUES ($1, $2, $3)', [username || 'unknown', ip, false]);
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const user = result.rows[0];

        if (!user.activo) {
            console.log('Usuario bloqueado intentó ingresar:', username);
            await db.query('INSERT INTO intentos_login (username, ip_address, exitoso) VALUES ($1, $2, $3)', [username, ip, false]);
            return res.status(403).json({ message: 'El usuario está bloqueado por seguridad.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        console.log('¿Contraseña coincide?:', isMatch);

        if (!isMatch) {
            // Registrar intento fallido
            await db.query('INSERT INTO intentos_login (username, ip_address, exitoso) VALUES ($1, $2, $3)', [username, ip, false]);
            
            // Verificar si debe bloquearse (3 intentos fallidos consecutivos)
            const history = await db.query(
                'SELECT exitoso FROM intentos_login WHERE username = $1 ORDER BY fecha_hora DESC LIMIT 3',
                [username]
            );

            const consecutiveFailures = history.rows.filter(row => !row.exitoso).length;
            if (consecutiveFailures >= 3) {
                await db.query('UPDATE usuarios SET activo = FALSE WHERE username = $1', [username]);
                console.log(`[BLOQUEO] Usuario ${username} bloqueado tras 3 fallas.`);
                return res.status(403).json({ message: 'Usuario bloqueado por seguridad tras 3 intentos fallidos.' });
            }

            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        // Registrar intento exitoso
        await db.query('INSERT INTO intentos_login (username, ip_address, exitoso) VALUES ($1, $2, $3)', [username, ip, true]);

        // Calcular tiempo restante del día en segundos en zona horaria de Lima (America/Lima)
        const nowInLima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
        const tomorrowInLima = new Date(nowInLima.getFullYear(), nowInLima.getMonth(), nowInLima.getDate() + 1, 0, 0, 0);
        const secondsRemaining = Math.max(60, Math.floor((tomorrowInLima.getTime() - nowInLima.getTime()) / 1000));

        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            process.env.JWT_SECRET || 'clave_secreta_provisional',
            { expiresIn: secondsRemaining }
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

const logout = async (req, res) => {
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
};

module.exports = {
    login,
    logout
};
