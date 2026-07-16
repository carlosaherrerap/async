const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const reportController = require('../controllers/reportController');
const ocrController = require('../controllers/ocrController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Ruta para verificar trabajador y estado
router.get('/verificar', verifyToken, attendanceController.verifyWorker);

// Ruta para escanear y procesar imagen de DNI
router.post('/escanear-dni', verifyToken, attendanceController.scanDniImage);

// Ruta para registrar asistencia (Pública para el punto de marcación)
router.post('/registrar-asistencia', verifyToken, attendanceController.registerAttendance);

// Rutas protegidas
router.post('/registrar-postulante', verifyToken, attendanceController.registerWorker);
router.get('/postulantes', verifyToken, attendanceController.getAllWorkers);
router.put('/postulantes/:id', verifyToken, attendanceController.updateWorker);
router.get('/sincronizar-descarga', verifyToken, attendanceController.getSyncPull);
router.get('/sincronizar-verificacion', verifyToken, attendanceController.getSyncCheck);
router.get('/exportar-excel', verifyToken, reportController.exportAttendanceToExcel);
router.get('/inasistencias', verifyToken, reportController.getAbsentees);
router.get('/estadisticas', verifyToken, reportController.getStats);
router.get('/reporte-diario', verifyToken, reportController.getDailyAttendance);
router.get('/ultima-actualizacion', verifyToken, reportController.getUltimaActualizacion);

router.post('/cambiar-sede', [verifyToken, isAdmin], attendanceController.changeSede);
router.get('/historial-sedes', [verifyToken, isAdmin], attendanceController.getSedeHistory);

// OCR - Procesamiento de fotos de listas impresas (solo admin/SU)
router.post('/procesar-foto-lista', [verifyToken, isAdmin], ocrController.procesarFotoLista);

module.exports = router;
