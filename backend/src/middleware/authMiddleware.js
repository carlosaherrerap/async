const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'] || (req.query.token ? `Bearer ${req.query.token}` : null);

    if (!token) {
        return res.status(403).json({ message: 'Se requiere un token para la autenticación' });
    }

    try {
        const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET || 'clave_secreta_provisional');
        req.user = decoded;
    } catch (err) {
        return res.status(401).json({ message: 'Token inválido' });
    }
    return next();
};

const isAdmin = (req, res, next) => {
    // Verificación de rol de administrador o superusuario (insensible a mayúsculas/minúsculas)
    const role = req.user?.rol?.trim().toLowerCase();
    if (req.user && (role === 'admin' || role === 'administrador' || role === 'su' || role === 'super' || role === 'superusuario')) {
        next();
    } else {
        return res.status(403).json({ message: 'Requiere rol de Administrador' });
    }
};

module.exports = {
    verifyToken,
    isAdmin
};
