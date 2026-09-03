const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.post('/iniciar-sesion', authController.login);
router.post('/login', authController.login);
router.post('/cerrar-sesion', authController.logout);
router.get('/verificar-admin', [verifyToken, isAdmin], authController.verifyAdmin);

module.exports = router;

