const express = require('express');
const { createService, updateService, deleteService, requestService, getGlobalServicesPublic } = require('../controllers/serviceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public: any authenticated user can list global services (for providers to pick from)
router.get('/global', protect, getGlobalServicesPublic);

router.use(protect);

router.post('/', createService);
router.post('/request', requestService);
router.put('/:id', updateService);
router.delete('/:id', deleteService);

module.exports = router;
