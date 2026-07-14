const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/iniciar-sesion', authController.login);
router.post('/cerrar-sesion', authController.logout);

module.exports = router;
