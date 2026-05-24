const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

const reportController = require('../controllers/reportController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Ruta para verificar trabajador y estado
router.get('/verify', attendanceController.verifyWorker);

// Ruta para registrar asistencia (Pública para el punto de marcación)
router.post('/register', attendanceController.registerAttendance);

// Rutas protegidas
router.get('/export', [verifyToken, isAdmin], reportController.exportAttendanceToExcel);
router.get('/absentees', verifyToken, reportController.getAbsentees);
router.get('/stats', verifyToken, reportController.getStats);

module.exports = router;
