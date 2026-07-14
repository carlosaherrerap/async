const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.get('/cargos', verifyToken, configController.getCargos);
router.post('/cargos', [verifyToken, isAdmin], configController.createCargo);
router.put('/cargos/:id', [verifyToken, isAdmin], configController.updateMeta);
router.get('/sedes', verifyToken, configController.getSedes);

module.exports = router;
