const express = require('express');
const {
  getAvailability,
  setAvailability,
  deleteSlot,
  getAvailabilityRange,
} = require('../controllers/availabilityController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public
router.get('/:providerId', getAvailability);
router.get('/:providerId/range', getAvailabilityRange);

// Provider-only
router.post('/', protect, setAvailability);
router.delete('/:date/:slotId', protect, deleteSlot);

module.exports = router;
