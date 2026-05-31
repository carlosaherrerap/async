const express = require('express');
const router = express.Router();
const rulesController = require('../controllers/rulesController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, rulesController.getRules);
router.post('/', [verifyToken, isAdmin], rulesController.createRule);
router.post('/apply-cargo', [verifyToken, isAdmin], rulesController.applyRuleToCargo);

module.exports = router;
