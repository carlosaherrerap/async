const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

const reportController = require('../controllers/reportController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Ruta para verificar trabajador y estado
router.get('/verify', verifyToken, attendanceController.verifyWorker);

// Ruta para escanear y procesar imagen de DNI
router.post('/scan-dni', verifyToken, attendanceController.scanDniImage);

// Ruta para registrar asistencia (Pública para el punto de marcación)
router.post('/register', verifyToken, attendanceController.registerAttendance);

// Rutas protegidas
router.post('/register-worker', verifyToken, attendanceController.registerWorker);
router.get('/workers', verifyToken, attendanceController.getAllWorkers);
router.put('/workers/:id', verifyToken, attendanceController.updateWorker);
router.get('/sync-pull', verifyToken, attendanceController.getSyncPull);
router.get('/sync-check', verifyToken, attendanceController.getSyncCheck);
router.get('/export', [verifyToken, isAdmin], reportController.exportAttendanceToExcel);
router.get('/absentees', verifyToken, reportController.getAbsentees);
router.get('/stats', verifyToken, reportController.getStats);
router.get('/daily', verifyToken, reportController.getDailyAttendance);

module.exports = router;
